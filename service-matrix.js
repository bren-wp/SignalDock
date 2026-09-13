(function (root) {
  "use strict";

  const MAX_DURATION_SAMPLES = 20000;

  function cleanService(entry) {
    const value = String(entry?.service || "").trim();
    return value && value !== "—" ? value : "";
  }

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[index];
  }

  function build(entries, indexes = null) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes : null;
    const each = (fn) => {
      if (selected) { for (const index of selected) { const entry = source[index]; if (entry) fn(entry, index); } return; }
      source.forEach((entry, index) => { if (entry) fn(entry, index); });
    };

    const spans = new Map();
    each((entry) => {
      const span = String(entry?.correlations?.span || "").trim();
      if (span) spans.set(span, entry);
    });

    const edges = new Map();
    const services = new Set();
    let linkedSpans = 0;
    each((entry) => {
      const target = cleanService(entry);
      if (target) services.add(target);
      const parentSpan = String(entry?.traceMeta?.parentSpan || entry?.correlations?.parent_span || "").trim();
      if (!parentSpan || !target) return;
      const parent = spans.get(parentSpan);
      const sourceService = cleanService(parent);
      if (!sourceService || sourceService === target) return;
      linkedSpans += 1;
      services.add(sourceService);
      const key = `${sourceService}\u0000${target}`;
      const edge = edges.get(key) || { source: sourceService, target, calls: 0, errors: 0, warnings: 0, durations: [], traces: new Set() };
      edge.calls += 1;
      if (entry.level === "ERROR" || entry.level === "FATAL") edge.errors += 1;
      else if (entry.level === "WARN") edge.warnings += 1;
      if (entry.correlations?.trace) edge.traces.add(String(entry.correlations.trace));
      const duration = Number(entry?.traceMeta?.durationMs);
      if (Number.isFinite(duration) && duration >= 0 && edge.durations.length < MAX_DURATION_SAMPLES) edge.durations.push(duration);
      edges.set(key, edge);
    });

    const rows = [...edges.values()].map((edge) => {
      edge.durations.sort((a, b) => a - b);
      const sum = edge.durations.reduce((total, value) => total + value, 0);
      return {
        source: edge.source,
        target: edge.target,
        calls: edge.calls,
        errors: edge.errors,
        warnings: edge.warnings,
        errorRate: edge.calls ? edge.errors / edge.calls : 0,
        traces: edge.traces.size,
        timed: edge.durations.length,
        avgMs: edge.durations.length ? sum / edge.durations.length : null,
        medianMs: percentile(edge.durations, 0.5),
        p95Ms: percentile(edge.durations, 0.95),
        maxMs: edge.durations.length ? edge.durations[edge.durations.length - 1] : null
      };
    }).sort((a, b) => b.errors - a.errors || (b.p95Ms ?? -1) - (a.p95Ms ?? -1) || b.calls - a.calls || a.source.localeCompare(b.source));

    return {
      rows,
      services: [...services].sort(),
      summary: {
        services: services.size,
        edges: rows.length,
        linkedSpans,
        calls: rows.reduce((sum, row) => sum + row.calls, 0),
        errors: rows.reduce((sum, row) => sum + row.errors, 0),
        timed: rows.reduce((sum, row) => sum + row.timed, 0)
      }
    };
  }

  root.SignalDockServiceMatrix = { build, MAX_DURATION_SAMPLES };
}(typeof self !== "undefined" ? self : window));
