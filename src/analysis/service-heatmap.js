(function (root) {
  "use strict";

  const MAX_BUCKETS = 24;
  const MAX_DURATION_SAMPLES = 4000;

  function serviceOf(entry) {
    const value = String(entry?.service || "").trim();
    return value && value !== "—" ? value : "";
  }

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[index];
  }

  function build(entries, indexes = null, options = {}) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes : null;
    const requestedBuckets = Math.max(4, Math.min(MAX_BUCKETS, Number(options.bucketCount) || 12));
    const each = (fn) => {
      if (selected) { for (const index of selected) { const entry = source[index]; if (entry) fn(entry, index); } return; }
      source.forEach((entry, index) => { if (entry) fn(entry, index); });
    };

    const spanMap = new Map();
    let timedCount = 0;
    let startMs = Infinity;
    let endMs = -Infinity;
    each((entry) => {
      const spanId = String(entry?.correlations?.span || "").trim();
      if (spanId) spanMap.set(spanId, entry);
      const ms = Number(entry?.timestampMs);
      if (!Number.isFinite(ms)) return;
      timedCount += 1;
      if (ms < startMs) startMs = ms;
      if (ms > endMs) endMs = ms;
    });

    if (!timedCount) return { rows: [], buckets: [], summary: { edges: 0, calls: 0, errors: 0, timedCalls: 0, startMs: null, endMs: null } };
    const width = Math.max(1, endMs - startMs);
    const bucketCount = Math.min(requestedBuckets, Math.max(1, Math.ceil(Math.sqrt(timedCount))));
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({
      index,
      startMs: startMs + width * index / bucketCount,
      endMs: startMs + width * (index + 1) / bucketCount
    }));

    const edges = new Map();
    each((entry) => {
      const child = serviceOf(entry);
      const parentSpan = String(entry?.traceMeta?.parentSpan || entry?.correlations?.parent_span || "").trim();
      const timestampMs = Number(entry?.timestampMs);
      if (!child || !parentSpan || !Number.isFinite(timestampMs)) return;
      const parent = spanMap.get(parentSpan);
      const parentService = serviceOf(parent);
      if (!parentService || parentService === child) return;
      const key = `${parentService}\u0000${child}`;
      const edge = edges.get(key) || {
        source: parentService,
        target: child,
        buckets: Array.from({ length: bucketCount }, () => ({ calls: 0, errors: 0, warnings: 0, durations: [] })),
        calls: 0,
        errors: 0,
        warnings: 0,
        timedCalls: 0
      };
      const bucketIndex = Math.min(bucketCount - 1, Math.max(0, Math.floor(((timestampMs - startMs) / width) * bucketCount)));
      const bucket = edge.buckets[bucketIndex];
      edge.calls += 1; bucket.calls += 1;
      if (entry.level === "ERROR" || entry.level === "FATAL") { edge.errors += 1; bucket.errors += 1; }
      else if (entry.level === "WARN") { edge.warnings += 1; bucket.warnings += 1; }
      const duration = Number(entry?.traceMeta?.durationMs);
      if (Number.isFinite(duration) && duration >= 0) {
        edge.timedCalls += 1;
        if (bucket.durations.length < MAX_DURATION_SAMPLES) bucket.durations.push(duration);
      }
      edges.set(key, edge);
    });

    const rows = [...edges.values()].map((edge) => ({
      source: edge.source,
      target: edge.target,
      calls: edge.calls,
      errors: edge.errors,
      warnings: edge.warnings,
      timedCalls: edge.timedCalls,
      errorRate: edge.calls ? edge.errors / edge.calls : 0,
      buckets: edge.buckets.map((bucket, index) => {
        bucket.durations.sort((a, b) => a - b);
        return {
          index,
          calls: bucket.calls,
          errors: bucket.errors,
          warnings: bucket.warnings,
          errorRate: bucket.calls ? bucket.errors / bucket.calls : 0,
          p95Ms: percentile(bucket.durations, 0.95),
          medianMs: percentile(bucket.durations, 0.5)
        };
      })
    })).sort((a, b) => b.errors - a.errors || b.calls - a.calls || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

    return {
      rows,
      buckets,
      summary: {
        edges: rows.length,
        calls: rows.reduce((sum, row) => sum + row.calls, 0),
        errors: rows.reduce((sum, row) => sum + row.errors, 0),
        timedCalls: rows.reduce((sum, row) => sum + row.timedCalls, 0),
        startMs,
        endMs
      }
    };
  }

  root.SignalDockServiceHeatmap = { build, MAX_BUCKETS };
}(typeof self !== "undefined" ? self : window));
