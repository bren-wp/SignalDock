(function (root) {
  "use strict";

  const DEFAULT_WINDOW = 2000;
  const MAX_WINDOW = 20000;

  function cleanId(value, max = 256) {
    return String(value || "").trim().slice(0, max);
  }

  function clampWindow(value, fallback) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number) || number <= 0) return fallback;
    return Math.min(MAX_WINDOW, number);
  }

  function entryIterator(source, selected, fn) {
    if (selected) {
      for (const index of selected) {
        const entry = source[index];
        if (entry) fn(entry, index);
      }
      return;
    }
    source.forEach((entry, index) => { if (entry) fn(entry, index); });
  }

  function sortRows(rows) {
    return rows.sort((a, b) => b.errors - a.errors || (b.durationMs ?? -1) - (a.durationMs ?? -1) || b.spans - a.spans || a.traceId.localeCompare(b.traceId));
  }

  function build(entries, indexes = null, options = {}) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes : null;
    const traces = new Map();
    const spanKeys = new Set();
    const globalServices = new Set();
    let entriesScanned = 0;
    let traceEntries = 0;
    let explicitParents = 0;

    entryIterator(source, selected, (entry, index) => {
      entriesScanned += 1;
      const traceId = cleanId(entry?.correlations?.trace);
      if (!traceId) return;
      traceEntries += 1;
      const row = traces.get(traceId) || {
        traceId,
        entries: 0,
        spans: 0,
        services: new Set(),
        errors: 0,
        warnings: 0,
        events: 0,
        startMs: null,
        endMs: null,
        sampleIndex: index,
        parented: 0,
        linkedParents: 0
      };
      row.entries += 1;

      const service = cleanId(entry?.service, 160);
      if (service && service !== "—") {
        row.services.add(service);
        globalServices.add(service);
      }

      const span = cleanId(entry?.correlations?.span);
      if (span) {
        const key = `${traceId}\u0000${span}`;
        if (!spanKeys.has(key)) {
          spanKeys.add(key);
          row.spans += 1;
        }
      }

      const parent = cleanId(entry?.traceMeta?.parentSpan || entry?.correlations?.parent_span);
      if (parent) {
        row.parented += 1;
        explicitParents += 1;
      }

      if (entry.level === "ERROR" || entry.level === "FATAL") row.errors += 1;
      else if (entry.level === "WARN") row.warnings += 1;

      const events = Array.isArray(entry?.traceMeta?.otel?.events)
        ? entry.traceMeta.otel.events.length
        : Array.isArray(entry?.traceMeta?.events) ? entry.traceMeta.events.length : 0;
      row.events += events;

      const start = Number(entry?.timestampMs);
      if (Number.isFinite(start)) {
        const duration = Number(entry?.traceMeta?.durationMs);
        const end = Number.isFinite(duration) && duration >= 0 ? start + duration : start;
        row.startMs = row.startMs === null ? start : Math.min(row.startMs, start);
        row.endMs = row.endMs === null ? end : Math.max(row.endMs, end);
      }
      traces.set(traceId, row);
    });

    // Resolve parent coverage in a second bounded pass. This avoids retaining a parent-id
    // array for every trace while preserving exact coverage for all loaded span ids.
    if (explicitParents) {
      entryIterator(source, selected, (entry) => {
        const traceId = cleanId(entry?.correlations?.trace);
        if (!traceId) return;
        const parent = cleanId(entry?.traceMeta?.parentSpan || entry?.correlations?.parent_span);
        if (!parent || !spanKeys.has(`${traceId}\u0000${parent}`)) return;
        const row = traces.get(traceId);
        if (row) row.linkedParents += 1;
      });
    }

    const allRows = sortRows([...traces.values()].map((row) => ({
      traceId: row.traceId,
      entries: row.entries,
      spans: row.spans,
      services: [...row.services].sort(),
      serviceCount: row.services.size,
      errors: row.errors,
      warnings: row.warnings,
      events: row.events,
      durationMs: row.startMs !== null && row.endMs !== null ? Math.max(0, row.endMs - row.startMs) : null,
      parentCoverage: row.parented ? row.linkedParents / row.parented : 1,
      sampleIndex: row.sampleIndex
    })));

    const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
    const hasExplicitLimit = options.limit !== undefined && options.limit !== null;
    const limit = hasExplicitLimit ? clampWindow(options.limit, DEFAULT_WINDOW) : allRows.length;
    const rows = allRows.slice(offset, offset + limit);

    return {
      rows,
      summary: {
        traces: allRows.length,
        errors: allRows.filter((row) => row.errors > 0).length,
        incomplete: allRows.filter((row) => row.parentCoverage < 1).length,
        services: globalServices.size,
        entriesScanned,
        traceEntries,
        explicitParents,
        uniqueSpans: spanKeys.size,
        returned: rows.length,
        offset,
        truncated: rows.length < Math.max(0, allRows.length - offset)
      }
    };
  }

  function buildWindow(entries, indexes = null, options = {}) {
    return build(entries, indexes, { ...options, limit: options.limit ?? DEFAULT_WINDOW });
  }

  root.SignalDockTraceExplorer = { build, buildWindow, DEFAULT_WINDOW, MAX_WINDOW };
}(typeof self !== "undefined" ? self : window));
