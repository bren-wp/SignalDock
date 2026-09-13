(function (root) {
  "use strict";

  function build(entries, indexes = null) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes : null;
    const traces = new Map();
    const each = (fn) => {
      if (selected) { for (const index of selected) { const entry = source[index]; if (entry) fn(entry, index); } return; }
      source.forEach((entry, index) => { if (entry) fn(entry, index); });
    };

    each((entry, index) => {
      const traceId = String(entry?.correlations?.trace || "").trim();
      if (!traceId) return;
      const row = traces.get(traceId) || { traceId, entries: 0, spans: new Set(), services: new Set(), errors: 0, warnings: 0, events: 0, startMs: null, endMs: null, sampleIndex: index, parented: 0, linkedParents: 0, spanIds: new Set(), parentIds: [] };
      row.entries += 1;
      const service = String(entry?.service || "").trim(); if (service && service !== "—") row.services.add(service);
      const span = String(entry?.correlations?.span || "").trim(); if (span) { row.spans.add(span); row.spanIds.add(span); }
      const parent = String(entry?.traceMeta?.parentSpan || entry?.correlations?.parent_span || "").trim(); if (parent) { row.parented += 1; row.parentIds.push(parent); }
      if (entry.level === "ERROR" || entry.level === "FATAL") row.errors += 1; else if (entry.level === "WARN") row.warnings += 1;
      const events = Array.isArray(entry?.traceMeta?.otel?.events) ? entry.traceMeta.otel.events.length : Array.isArray(entry?.traceMeta?.events) ? entry.traceMeta.events.length : 0;
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

    const rows = [...traces.values()].map((row) => {
      row.linkedParents = row.parentIds.filter((id) => row.spanIds.has(id)).length;
      const parentCoverage = row.parented ? row.linkedParents / row.parented : 1;
      return {
        traceId: row.traceId,
        entries: row.entries,
        spans: row.spans.size,
        services: [...row.services].sort(),
        serviceCount: row.services.size,
        errors: row.errors,
        warnings: row.warnings,
        events: row.events,
        durationMs: row.startMs !== null && row.endMs !== null ? Math.max(0, row.endMs - row.startMs) : null,
        parentCoverage,
        sampleIndex: row.sampleIndex
      };
    }).sort((a, b) => b.errors - a.errors || (b.durationMs ?? -1) - (a.durationMs ?? -1) || b.spans - a.spans || a.traceId.localeCompare(b.traceId));

    return {
      rows,
      summary: {
        traces: rows.length,
        errors: rows.filter((row) => row.errors > 0).length,
        incomplete: rows.filter((row) => row.parentCoverage < 1).length,
        services: new Set(rows.flatMap((row) => row.services)).size
      }
    };
  }

  root.SignalDockTraceExplorer = { build };
}(typeof self !== "undefined" ? self : window));
