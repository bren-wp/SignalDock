(function (root) {
  "use strict";

  function cleanTraceId(value) { return String(value || "").trim(); }

  function summarize(entries, traceId) {
    const id = cleanTraceId(traceId);
    const rows = (Array.isArray(entries) ? entries : []).filter((entry) => String(entry?.correlations?.trace || "").trim() === id);
    const services = new Set();
    const spans = new Set();
    const scopes = new Set();
    let errors = 0, warnings = 0, events = 0, startMs = null, endMs = null, timedSpans = 0, durationSum = 0, parented = 0, linkedParents = 0;
    const spanIds = new Set(); const parentIds = [];
    rows.forEach((entry) => {
      const service = String(entry?.service || "").trim(); if (service && service !== "—") services.add(service);
      const span = String(entry?.correlations?.span || "").trim(); if (span) { spans.add(span); spanIds.add(span); }
      const parent = String(entry?.traceMeta?.parentSpan || entry?.correlations?.parent_span || "").trim(); if (parent) { parented += 1; parentIds.push(parent); }
      if (entry.level === "ERROR" || entry.level === "FATAL") errors += 1; else if (entry.level === "WARN") warnings += 1;
      const spanEvents = Array.isArray(entry?.traceMeta?.otel?.events) ? entry.traceMeta.otel.events : Array.isArray(entry?.traceMeta?.events) ? entry.traceMeta.events : [];
      events += spanEvents.length;
      const scopeName = String(entry?.traceMeta?.otel?.scope?.name || "").trim(); if (scopeName) scopes.add(scopeName);
      const start = Number(entry?.timestampMs); const duration = Number(entry?.traceMeta?.durationMs);
      if (Number.isFinite(start)) {
        const end = Number.isFinite(duration) && duration >= 0 ? start + duration : start;
        startMs = startMs === null ? start : Math.min(startMs, start); endMs = endMs === null ? end : Math.max(endMs, end);
      }
      if (Number.isFinite(duration) && duration >= 0) { timedSpans += 1; durationSum += duration; }
    });
    linkedParents = parentIds.filter((parent) => spanIds.has(parent)).length;
    return {
      traceId: id,
      entries: rows.length,
      spans: spans.size,
      services: [...services].sort(),
      serviceCount: services.size,
      errors,
      warnings,
      events,
      scopes: [...scopes].sort(),
      scopeCount: scopes.size,
      durationMs: startMs !== null && endMs !== null ? Math.max(0, endMs - startMs) : null,
      timedSpans,
      avgSpanMs: timedSpans ? durationSum / timedSpans : null,
      parentCoverage: parented ? linkedParents / parented : 1
    };
  }

  function delta(a, b, key) {
    const av = Number(a?.[key]); const bv = Number(b?.[key]);
    return Number.isFinite(av) && Number.isFinite(bv) ? bv - av : null;
  }

  function compare(entries, leftTraceId, rightTraceId) {
    const left = summarize(entries, leftTraceId); const right = summarize(entries, rightTraceId);
    if (!left.traceId || !right.traceId) throw new Error("Two trace IDs are required.");
    if (!left.entries || !right.entries) throw new Error("Both traces must exist in the current dataset.");
    const leftServices = new Set(left.services); const rightServices = new Set(right.services);
    return {
      left,
      right,
      delta: {
        entries: delta(left, right, "entries"), spans: delta(left, right, "spans"), errors: delta(left, right, "errors"), warnings: delta(left, right, "warnings"), events: delta(left, right, "events"), durationMs: delta(left, right, "durationMs"), avgSpanMs: delta(left, right, "avgSpanMs"), parentCoverage: delta(left, right, "parentCoverage")
      },
      services: {
        shared: [...leftServices].filter((service) => rightServices.has(service)).sort(),
        leftOnly: [...leftServices].filter((service) => !rightServices.has(service)).sort(),
        rightOnly: [...rightServices].filter((service) => !leftServices.has(service)).sort()
      }
    };
  }

  root.SignalDockTraceCompare = { summarize, compare };
}(typeof self !== "undefined" ? self : window));
