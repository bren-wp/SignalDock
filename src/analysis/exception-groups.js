(function (root) {
  "use strict";

  const MAX_GROUPS = 5000;
  const MAX_SAMPLES = 8;
  const EXCEPTION_HINT = /\b(?:exception|error|failed|failure|panic|fatal|timeout|denied|refused|unavailable|stack\s*trace)\b/i;

  function clean(value, max = 4000) {
    return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
  }

  function canonicalMessage(input) {
    let text = clean(input).toLowerCase();
    if (!text) return "";
    text = text
      .replace(/\b\d{4}-\d{2}-\d{2}[t\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?z?\b/g, "<time>")
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "<uuid>")
      .replace(/\b(?:0x)?[0-9a-f]{16,}\b/gi, "<hex>")
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>")
      .replace(/\b(?:[a-z]:\\|\/)(?:[^\s:]+[\\/])+[^\s:]+/gi, "<path>")
      .replace(/(['"])(?:\\.|(?!\1).){4,}\1/g, "<str>")
      .replace(/\b\d+(?:\.\d+)?\b/g, "<n>")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 1200);
  }

  function exceptionType(entry) {
    const raw = entry?.raw;
    const candidates = [
      raw?.exception?.type,
      raw?.error?.type,
      raw?.error?.name,
      raw?.exceptionType,
      raw?.exception_type,
      raw?.type
    ];
    for (const value of candidates) {
      const text = clean(value, 160);
      if (text && /(?:exception|error|timeout|failure)$/i.test(text)) return text;
    }
    const message = clean(entry?.message, 800);
    const direct = message.match(/\b([A-Z][A-Za-z0-9_.]*(?:Exception|Error|Timeout|Failure))\b/);
    return direct?.[1] || "";
  }

  function stackHead(entry) {
    const raw = entry?.raw;
    const candidates = [raw?.exception?.stacktrace, raw?.exception?.stack_trace, raw?.error?.stack_trace, raw?.error?.stack, raw?.stack, raw?.stacktrace];
    for (const value of candidates) {
      const text = clean(value, 12000);
      if (!text) continue;
      const line = text.split("\n").map((item) => item.trim()).find((item) => /^at\s+|\bline\s+\d+|\.\w+:\d+/.test(item));
      if (line) return canonicalMessage(line);
    }
    const message = clean(entry?.message, 4000);
    const line = message.split("\n").map((item) => item.trim()).find((item) => /^at\s+|\bline\s+\d+|\.\w+:\d+/.test(item));
    return line ? canonicalMessage(line) : "";
  }

  function fnv1a(text) {
    let hash = 2166136261;
    const source = String(text || "");
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function fingerprint(entry) {
    const type = exceptionType(entry).toLowerCase();
    const message = canonicalMessage(entry?.message);
    const stack = stackHead(entry);
    const service = clean(entry?.service || "—", 160).toLowerCase();
    const signature = [type || "exception", service, message, stack].join("|");
    return `ex-${fnv1a(signature)}`;
  }

  function candidate(entry) {
    if (!entry) return false;
    const level = String(entry.level || "").toUpperCase();
    return level === "ERROR" || level === "FATAL" || Boolean(exceptionType(entry)) || EXCEPTION_HINT.test(String(entry.message || ""));
  }

  function group(entries, options = {}) {
    const limit = Math.max(1, Math.min(MAX_GROUPS, Number(options.maxGroups) || 1000));
    const groups = new Map();
    for (const entry of entries || []) {
      if (!candidate(entry)) continue;
      const key = clean(entry.exceptionFingerprint, 96) || fingerprint(entry);
      let current = groups.get(key);
      if (!current) {
        if (groups.size >= limit) continue;
        current = {
          fingerprint: key,
          type: exceptionType(entry) || "Exception-like failure",
          signature: canonicalMessage(entry.message),
          count: 0,
          fatal: 0,
          errors: 0,
          warnings: 0,
          services: new Map(),
          sources: new Map(),
          firstTimestampMs: null,
          lastTimestampMs: null,
          sampleIds: [],
          sampleIndexes: []
        };
        groups.set(key, current);
      }
      current.count += 1;
      if (entry.level === "FATAL") current.fatal += 1;
      else if (entry.level === "ERROR") current.errors += 1;
      else if (entry.level === "WARN") current.warnings += 1;
      const service = clean(entry.service || "—", 160) || "—";
      current.services.set(service, (current.services.get(service) || 0) + 1);
      const source = clean(entry.source || "unknown", 256) || "unknown";
      current.sources.set(source, (current.sources.get(source) || 0) + 1);
      const ts = Number.isFinite(entry.timestampMs) ? entry.timestampMs : null;
      if (ts !== null) {
        current.firstTimestampMs = current.firstTimestampMs === null ? ts : Math.min(current.firstTimestampMs, ts);
        current.lastTimestampMs = current.lastTimestampMs === null ? ts : Math.max(current.lastTimestampMs, ts);
      }
      if (current.sampleIds.length < MAX_SAMPLES && entry.id) current.sampleIds.push(entry.id);
      if (current.sampleIndexes.length < MAX_SAMPLES && Number.isInteger(entry.globalIndex)) current.sampleIndexes.push(entry.globalIndex);
    }

    return [...groups.values()].map((item) => ({
      fingerprint: item.fingerprint,
      type: item.type,
      signature: item.signature,
      count: item.count,
      fatal: item.fatal,
      errors: item.errors,
      warnings: item.warnings,
      services: [...item.services.entries()].sort((a, b) => b[1] - a[1]),
      sources: [...item.sources.entries()].sort((a, b) => b[1] - a[1]),
      firstTimestampMs: item.firstTimestampMs,
      lastTimestampMs: item.lastTimestampMs,
      sampleIds: item.sampleIds,
      sampleIndexes: item.sampleIndexes
    })).sort((a, b) => b.count - a.count || b.fatal - a.fatal || b.errors - a.errors || a.fingerprint.localeCompare(b.fingerprint));
  }

  function summary(groups) {
    const list = Array.isArray(groups) ? groups : [];
    return {
      groups: list.length,
      occurrences: list.reduce((sum, item) => sum + (Number(item.count) || 0), 0),
      fatal: list.reduce((sum, item) => sum + (Number(item.fatal) || 0), 0),
      errors: list.reduce((sum, item) => sum + (Number(item.errors) || 0), 0)
    };
  }

  root.SignalDockExceptionGroups = { MAX_GROUPS, candidate, canonicalMessage, exceptionType, fingerprint, group, summary };
}(typeof self !== "undefined" ? self : window));
