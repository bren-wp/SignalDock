(function (root) {
  "use strict";

  const SCHEMA = "signaldock.investigation";
  const VERSION = 2;
  const LEGACY_VERSION = 1;
  const BUNDLE_SCHEMA = "signaldock.evidence-bundle";
  const BUNDLE_VERSION = 2;
  const LEGACY_BUNDLE_VERSION = 1;
  const MAX_ITEMS = 2000;
  const MAX_NOTE = 8000;
  const MAX_TAGS = 16;
  const MAX_SNAPSHOT_TEXT = 64 * 1024;

  function cleanText(value, max = 512) {
    return String(value ?? "").trim().slice(0, max);
  }

  function cloneSafe(value, maxText = MAX_SNAPSHOT_TEXT) {
    if (value === null || value === undefined) return value;
    try {
      const text = JSON.stringify(value);
      if (text.length <= maxText) return JSON.parse(text);
      return { truncated: true, preview: text.slice(0, maxText) };
    } catch {
      return cleanText(value, maxText);
    }
  }

  function cloneCaseFile(value) {
    if (!value || typeof value !== "object") return null;
    try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
  }

  function cleanTags(tags) {
    const source = Array.isArray(tags) ? tags : String(tags || "").split(/[;,]/);
    const out = [];
    const seen = new Set();
    for (const value of source) {
      const tag = cleanText(value, 48).toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}._:@/-]/gu, "");
      if (!tag || seen.has(tag)) continue;
      seen.add(tag); out.push(tag);
      if (out.length >= MAX_TAGS) break;
    }
    return out;
  }

  function empty() {
    return { schema: SCHEMA, version: VERSION, title: "Investigation", summary: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), items: [] };
  }

  function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return null;
    return {
      raw: cloneSafe(snapshot.raw),
      correlations: cloneSafe(snapshot.correlations || {}, 16 * 1024) || {},
      traceMeta: cloneSafe(snapshot.traceMeta || {}, 32 * 1024) || {},
      dimensions: cloneSafe(snapshot.dimensions || {}, 8 * 1024) || {}
    };
  }

  function snapshotFromEntry(entry) {
    if (!entry) return null;
    return normalizeSnapshot({ raw: entry.raw, correlations: entry.correlations || {}, traceMeta: entry.traceMeta || {}, dimensions: entry.dimensions || {} });
  }

  function normalize(input) {
    const src = input && typeof input === "object" ? input : {};
    const notebook = {
      schema: SCHEMA,
      version: VERSION,
      title: cleanText(src.title || "Investigation", 96) || "Investigation",
      summary: cleanText(src.summary || "", 4000),
      createdAt: cleanText(src.createdAt || new Date().toISOString(), 64),
      updatedAt: cleanText(src.updatedAt || new Date().toISOString(), 64),
      items: []
    };
    const items = Array.isArray(src.items) ? src.items.slice(0, MAX_ITEMS) : [];
    notebook.items = items.map((item, index) => ({
      id: cleanText(item?.id || `evidence-${index + 1}`, 96),
      entryId: cleanText(item?.entryId || "", 256),
      globalIndex: Number.isInteger(item?.globalIndex) ? item.globalIndex : null,
      source: cleanText(item?.source || "", 512),
      service: cleanText(item?.service || "", 256),
      level: cleanText(item?.level || "UNKNOWN", 24).toUpperCase(),
      timestamp: cleanText(item?.timestamp || "", 96),
      message: cleanText(item?.message || "", 4000),
      note: cleanText(item?.note || "", MAX_NOTE),
      tags: cleanTags(item?.tags || []),
      addedAt: cleanText(item?.addedAt || new Date().toISOString(), 64),
      fingerprint: cleanText(item?.fingerprint || "", 96),
      snapshot: normalizeSnapshot(item?.snapshot)
    }));
    return notebook;
  }

  function evidenceFromEntry(entry, note = "", tags = []) {
    if (!entry) throw new Error("A log entry is required.");
    const fingerprint = root.SignalDockExceptionGroups?.candidate?.(entry) ? root.SignalDockExceptionGroups.fingerprint(entry) : "";
    return {
      id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      entryId: cleanText(entry.id || "", 256),
      globalIndex: Number.isInteger(entry.globalIndex) ? entry.globalIndex : null,
      source: cleanText(entry.source || "", 512),
      service: cleanText(entry.service || "", 256),
      level: cleanText(entry.level || "UNKNOWN", 24).toUpperCase(),
      timestamp: cleanText(entry.timestamp || "", 96),
      message: cleanText(entry.message || "", 4000),
      note: cleanText(note, MAX_NOTE),
      tags: cleanTags(tags),
      addedAt: new Date().toISOString(),
      fingerprint,
      snapshot: snapshotFromEntry(entry)
    };
  }

  function add(notebook, entry, note = "", tags = []) {
    const target = normalize(notebook);
    if (target.items.length >= MAX_ITEMS) throw new Error(`Investigation is limited to ${MAX_ITEMS.toLocaleString()} evidence items.`);
    const duplicate = target.items.find((item) => (item.entryId && item.entryId === entry?.id) || (Number.isInteger(item.globalIndex) && item.globalIndex === entry?.globalIndex && item.source === entry?.source));
    if (duplicate) return { notebook: target, item: duplicate, added: false };
    const item = evidenceFromEntry(entry, note, tags);
    target.items.push(item);
    target.updatedAt = new Date().toISOString();
    return { notebook: target, item, added: true };
  }

  function update(notebook, id, patch = {}) {
    const target = normalize(notebook);
    const item = target.items.find((candidate) => candidate.id === id);
    if (!item) return target;
    if (Object.prototype.hasOwnProperty.call(patch, "note")) item.note = cleanText(patch.note, MAX_NOTE);
    if (Object.prototype.hasOwnProperty.call(patch, "tags")) item.tags = cleanTags(patch.tags);
    target.updatedAt = new Date().toISOString();
    return target;
  }

  function remove(notebook, id) {
    const target = normalize(notebook);
    target.items = target.items.filter((item) => item.id !== id);
    target.updatedAt = new Date().toISOString();
    return target;
  }

  function summarize(notebook) {
    const target = normalize(notebook);
    const levels = {};
    const services = new Set();
    const tags = new Set();
    const fingerprints = new Set();
    for (const item of target.items) {
      levels[item.level] = (levels[item.level] || 0) + 1;
      if (item.service && item.service !== "—") services.add(item.service);
      if (item.fingerprint) fingerprints.add(item.fingerprint);
      item.tags.forEach((tag) => tags.add(tag));
    }
    return { items: target.items.length, levels, services: services.size, tags: tags.size, exceptionGroups: fingerprints.size };
  }

  function timeline(notebook, options = {}) {
    const target = normalize(notebook);
    const maxBuckets = Math.max(4, Math.min(48, Number(options.maxBuckets) || 12));
    let timedCount = 0;
    let start = Infinity;
    let end = -Infinity;
    for (const item of target.items) {
      const ms = Date.parse(item.timestamp || item.addedAt || "");
      if (!Number.isFinite(ms)) continue;
      timedCount += 1;
      if (ms < start) start = ms;
      if (ms > end) end = ms;
    }
    if (!timedCount) return { buckets: [], start: null, end: null, total: target.items.length };
    const span = Math.max(1, end - start);
    const bucketCount = Math.min(maxBuckets, Math.max(1, Math.ceil(Math.sqrt(timedCount))));
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({ index, startMs: start + span * index / bucketCount, endMs: start + span * (index + 1) / bucketCount, count: 0, errors: 0, fatal: 0, items: [] }));
    for (const item of target.items) {
      const ms = Date.parse(item.timestamp || item.addedAt || "");
      if (!Number.isFinite(ms)) continue;
      const bucketIndex = Math.min(bucketCount - 1, Math.floor(((ms - start) / span) * bucketCount));
      const bucket = buckets[bucketIndex]; bucket.count += 1; if (item.level === "ERROR") bucket.errors += 1; if (item.level === "FATAL") bucket.fatal += 1; if (bucket.items.length < 8) bucket.items.push(item.id);
    }
    return { buckets, start, end, total: target.items.length };
  }

  function merge(baseNotebook, incomingNotebook) {
    const base = normalize(baseNotebook);
    const incoming = normalize(incomingNotebook);
    const out = normalize(base);
    const keyFor = (item) => {
      if (item.entryId) return `id:${item.source || ""}:${item.entryId}`;
      if (Number.isInteger(item.globalIndex) && item.source) return `idx:${item.source}:${item.globalIndex}`;
      return `sig:${item.timestamp}|${item.service}|${item.level}|${item.message}|${item.fingerprint}`;
    };
    const keyToId = new Map(out.items.map((item) => [keyFor(item), item.id]));
    const idMap = {};
    let added = 0;
    for (const item of incoming.items) {
      if (out.items.length >= MAX_ITEMS) break;
      const key = keyFor(item);
      if (keyToId.has(key)) { idMap[item.id] = keyToId.get(key); continue; }
      keyToId.set(key, item.id); idMap[item.id] = item.id; out.items.push(item); added += 1;
    }
    if (added) out.updatedAt = new Date().toISOString();
    if (!out.summary && incoming.summary) out.summary = incoming.summary;
    return { notebook: normalize(out), added, skipped: incoming.items.length - added, idMap };
  }

  function exportJson(notebook) {
    return JSON.stringify(normalize(notebook), null, 2);
  }

  function importJson(text) {
    const parsed = JSON.parse(String(text || ""));
    if (parsed?.schema !== SCHEMA || ![LEGACY_VERSION, VERSION].includes(parsed?.version)) throw new Error("Unsupported SignalDock investigation file.");
    return normalize(parsed);
  }

  function exportBundle(notebook, metadata = {}) {
    const target = normalize(notebook);
    let snapshotItems = 0;
    const services = new Set();
    const fingerprints = new Set();
    for (const item of target.items) {
      if (item.snapshot) snapshotItems += 1;
      if (item.service && services.size < 256) services.add(item.service);
      if (item.fingerprint && fingerprints.size < 512) fingerprints.add(item.fingerprint);
    }
    const payload = {
      schema: BUNDLE_SCHEMA,
      version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: cleanText(metadata.appVersion || "", 32),
      sourceLabel: cleanText(metadata.sourceLabel || "local-workspace", 160),
      investigation: target,
      caseFile: cloneCaseFile(metadata.caseFile),
      manifest: {
        evidenceItems: target.items.length,
        snapshotItems,
        services: [...services],
        fingerprints: [...fingerprints]
      }
    };
    return JSON.stringify(payload, null, 2);
  }

  function importBundle(text) {
    const parsed = JSON.parse(String(text || ""));
    if (parsed?.schema !== BUNDLE_SCHEMA || ![LEGACY_BUNDLE_VERSION, BUNDLE_VERSION].includes(parsed?.version) || !parsed.investigation) throw new Error("Unsupported SignalDock evidence bundle.");
    return { investigation: normalize(parsed.investigation), caseFile: parsed.caseFile && typeof parsed.caseFile === "object" ? parsed.caseFile : null, metadata: { exportedAt: parsed.exportedAt || "", appVersion: parsed.appVersion || "", sourceLabel: parsed.sourceLabel || "", manifest: parsed.manifest || {} } };
  }

  function exportMarkdown(notebook) {
    const target = normalize(notebook);
    const lines = [`# ${target.title}`, "", target.summary || "SignalDock local investigation notes.", "", `Evidence items: ${target.items.length}`, ""];
    target.items.forEach((item, index) => {
      lines.push(`## ${index + 1}. ${item.level} · ${item.service || "—"}`);
      if (item.timestamp) lines.push(`- Time: ${item.timestamp}`);
      if (item.source) lines.push(`- Source: ${item.source}`);
      if (item.fingerprint) lines.push(`- Exception fingerprint: \`${item.fingerprint}\``);
      if (item.tags.length) lines.push(`- Tags: ${item.tags.map((tag) => `\`${tag}\``).join(", ")}`);
      lines.push("", item.message || "(empty message)");
      if (item.note) lines.push("", "### Note", "", item.note);
      lines.push("");
    });
    return lines.join("\n");
  }

  root.SignalDockInvestigation = { SCHEMA, VERSION, BUNDLE_SCHEMA, BUNDLE_VERSION, MAX_ITEMS, empty, normalize, add, update, remove, merge, summarize, timeline, exportJson, importJson, exportBundle, importBundle, exportMarkdown, cleanTags, snapshotFromEntry };
}(typeof self !== "undefined" ? self : window));
