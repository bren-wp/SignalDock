(function (root) {
  "use strict";

  const MAX_DURATION_SAMPLES = 4000;

  function cleanService(entry) {
    const value = String(entry?.service || "").trim();
    return value && value !== "—" ? value : "";
  }

  function percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
  }

  function periodEdges(entries, indexes, startMs, endMs) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes : source.map((_, index) => index);
    const spanMap = new Map();
    for (const index of selected) {
      const entry = source[index];
      if (!entry) continue;
      const span = String(entry?.correlations?.span || "").trim();
      if (span) spanMap.set(span, entry);
    }
    const edges = new Map();
    for (const index of selected) {
      const entry = source[index];
      if (!entry) continue;
      const ts = Number(entry.timestampMs);
      if (!Number.isFinite(ts) || ts < startMs || ts >= endMs) continue;
      const child = cleanService(entry);
      const parentSpan = String(entry?.traceMeta?.parentSpan || entry?.correlations?.parent_span || "").trim();
      const parent = spanMap.get(parentSpan);
      const parentService = cleanService(parent);
      if (!child || !parentService || child === parentService) continue;
      const key = `${parentService}\u0000${child}`;
      const row = edges.get(key) || { key, source: parentService, target: child, calls: 0, errors: 0, warnings: 0, durations: [] };
      row.calls += 1;
      if (entry.level === "ERROR" || entry.level === "FATAL") row.errors += 1;
      else if (entry.level === "WARN") row.warnings += 1;
      const duration = Number(entry?.traceMeta?.durationMs);
      if (Number.isFinite(duration) && duration >= 0 && row.durations.length < MAX_DURATION_SAMPLES) row.durations.push(duration);
      edges.set(key, row);
    }
    return new Map([...edges.entries()].map(([key, row]) => [key, {
      key,
      source: row.source,
      target: row.target,
      calls: row.calls,
      errors: row.errors,
      warnings: row.warnings,
      errorRate: row.calls ? row.errors / row.calls : 0,
      p95Ms: percentile(row.durations, 0.95),
      medianMs: percentile(row.durations, 0.5),
      timedCalls: row.durations.length
    }]));
  }

  function classify(before, after) {
    if (!before?.calls && after?.calls) return "new";
    if (before?.calls && !after?.calls) return "disappeared";
    const a = Number(before?.calls || 0); const b = Number(after?.calls || 0);
    if (!a && !b) return "stable";
    const ratio = a ? b / a : Infinity;
    if (ratio >= 1.5 && b - a >= 2) return "rising";
    if (ratio <= 0.67 && a - b >= 2) return "falling";
    const errorDelta = Number(after?.errorRate || 0) - Number(before?.errorRate || 0);
    if (errorDelta >= 0.1 && Number(after?.errors || 0) >= 2) return "degrading";
    if (errorDelta <= -0.1 && Number(before?.errors || 0) >= 2) return "improving";
    return "stable";
  }

  function compare(entries, indexes = null, options = {}) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes : source.map((_, index) => index);
    let min = Infinity;
    let max = -Infinity;
    let timedEntries = 0;
    for (const index of selected) {
      const timestampMs = Number(source[index]?.timestampMs);
      if (!Number.isFinite(timestampMs)) continue;
      timedEntries += 1;
      if (timestampMs < min) min = timestampMs;
      if (timestampMs > max) max = timestampMs;
    }
    if (timedEntries < 2) return { rows: [], windows: null, summary: { edges: 0, changed: 0, newEdges: 0, disappearedEdges: 0 } };
    const splitMs = Number.isFinite(Number(options.splitMs)) ? Math.min(max, Math.max(min, Number(options.splitMs))) : min + ((max - min) / 2);
    if (splitMs <= min || splitMs >= max) return { rows: [], windows: null, summary: { edges: 0, changed: 0, newEdges: 0, disappearedEdges: 0 } };
    const before = periodEdges(source, selected, min, splitMs);
    const after = periodEdges(source, selected, splitMs, max + 1);
    const keys = new Set([...before.keys(), ...after.keys()]);
    const rows = [...keys].map((key) => {
      const left = before.get(key) || { key, source: key.split("\u0000")[0], target: key.split("\u0000")[1], calls: 0, errors: 0, warnings: 0, errorRate: 0, p95Ms: null, medianMs: null, timedCalls: 0 };
      const right = after.get(key) || { key, source: left.source, target: left.target, calls: 0, errors: 0, warnings: 0, errorRate: 0, p95Ms: null, medianMs: null, timedCalls: 0 };
      return {
        key,
        source: left.source || right.source,
        target: left.target || right.target,
        before: left,
        after: right,
        deltaCalls: right.calls - left.calls,
        deltaErrors: right.errors - left.errors,
        deltaErrorRate: right.errorRate - left.errorRate,
        deltaP95Ms: Number.isFinite(left.p95Ms) && Number.isFinite(right.p95Ms) ? right.p95Ms - left.p95Ms : null,
        trend: classify(left, right)
      };
    }).sort((a, b) => {
      const priority = { new: 6, degrading: 5, rising: 4, disappeared: 3, improving: 2, falling: 1, stable: 0 };
      return (priority[b.trend] || 0) - (priority[a.trend] || 0) || Math.abs(b.deltaCalls) - Math.abs(a.deltaCalls) || a.key.localeCompare(b.key);
    });
    return {
      rows,
      windows: { before: { startMs: min, endMs: splitMs }, after: { startMs: splitMs, endMs: max } },
      summary: {
        edges: rows.length,
        changed: rows.filter((row) => row.trend !== "stable").length,
        newEdges: rows.filter((row) => row.trend === "new").length,
        disappearedEdges: rows.filter((row) => row.trend === "disappeared").length,
        degrading: rows.filter((row) => row.trend === "degrading").length
      }
    };
  }

  root.SignalDockServiceTrends = { compare, periodEdges };
}(typeof self !== "undefined" ? self : window));
