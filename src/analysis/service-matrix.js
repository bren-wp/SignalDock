(function (root) {
  "use strict";

  const MAX_DURATION_SAMPLES = 128;
  const MAX_EDGES = 20000;
  const HISTOGRAM_BUCKETS = 96;
  const HISTOGRAM_BASE = 1.18;

  function cleanService(entry) {
    const value = String(entry?.service || "").trim();
    return value && value !== "—" ? value.slice(0, 160) : "";
  }

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[index];
  }

  function bucketIndex(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(HISTOGRAM_BUCKETS - 1, Math.max(0, Math.floor(Math.log(value + 1) / Math.log(HISTOGRAM_BASE))));
  }

  function bucketValue(index) {
    if (index <= 0) return 0;
    return Math.max(0, Math.pow(HISTOGRAM_BASE, index + 0.5) - 1);
  }

  function addHistogram(histogram, value) {
    histogram[bucketIndex(value)] += 1;
  }

  function percentileHistogram(histogram, count, p) {
    if (!count) return null;
    const wanted = Math.max(1, Math.ceil(count * p));
    let seen = 0;
    for (let index = 0; index < histogram.length; index += 1) {
      seen += histogram[index];
      if (seen >= wanted) return bucketValue(index);
    }
    return null;
  }

  function addDuration(edge, duration) {
    edge.timed += 1;
    edge.durationSum += duration;
    edge.maxMs = edge.maxMs === null ? duration : Math.max(edge.maxMs, duration);

    if (edge.histogram) {
      addHistogram(edge.histogram, duration);
      return;
    }
    edge.durations.push(duration);
    if (edge.durations.length <= MAX_DURATION_SAMPLES) return;

    edge.histogram = new Array(HISTOGRAM_BUCKETS).fill(0);
    edge.durations.forEach((value) => addHistogram(edge.histogram, value));
    edge.durations = [];
  }

  function build(entries, indexes = null, options = {}) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes : null;
    const maxEdges = Math.min(MAX_EDGES, Math.max(100, Math.floor(Number(options.maxEdges) || MAX_EDGES)));
    const each = (fn) => {
      if (selected) { for (const index of selected) { const entry = source[index]; if (entry) fn(entry, index); } return; }
      source.forEach((entry, index) => { if (entry) fn(entry, index); });
    };

    const spans = new Map();
    each((entry) => {
      const span = String(entry?.correlations?.span || "").trim();
      if (span) spans.set(span.slice(0, 256), entry);
    });

    const edges = new Map();
    const services = new Set();
    let linkedSpans = 0;
    let droppedCalls = 0;
    let edgeLimitHit = false;

    each((entry) => {
      const target = cleanService(entry);
      if (target) services.add(target);
      const parentSpan = String(entry?.traceMeta?.parentSpan || entry?.correlations?.parent_span || "").trim().slice(0, 256);
      if (!parentSpan || !target) return;
      const parent = spans.get(parentSpan);
      const sourceService = cleanService(parent);
      if (!sourceService || sourceService === target) return;
      linkedSpans += 1;
      services.add(sourceService);
      const key = `${sourceService}\u0000${target}`;
      let edge = edges.get(key);
      if (!edge) {
        if (edges.size >= maxEdges) {
          edgeLimitHit = true;
          droppedCalls += 1;
          return;
        }
        edge = {
          source: sourceService,
          target,
          calls: 0,
          errors: 0,
          warnings: 0,
          durations: [],
          histogram: null,
          timed: 0,
          durationSum: 0,
          maxMs: null,
          traces: new Set()
        };
        edges.set(key, edge);
      }
      edge.calls += 1;
      if (entry.level === "ERROR" || entry.level === "FATAL") edge.errors += 1;
      else if (entry.level === "WARN") edge.warnings += 1;
      if (entry.correlations?.trace) edge.traces.add(String(entry.correlations.trace).slice(0, 256));
      const duration = Number(entry?.traceMeta?.durationMs);
      if (Number.isFinite(duration) && duration >= 0) addDuration(edge, duration);
    });

    const rows = [...edges.values()].map((edge) => {
      let medianMs = null;
      let p95Ms = null;
      if (edge.histogram) {
        medianMs = percentileHistogram(edge.histogram, edge.timed, 0.5);
        p95Ms = percentileHistogram(edge.histogram, edge.timed, 0.95);
      } else if (edge.durations.length) {
        edge.durations.sort((a, b) => a - b);
        medianMs = percentile(edge.durations, 0.5);
        p95Ms = percentile(edge.durations, 0.95);
      }
      return {
        source: edge.source,
        target: edge.target,
        calls: edge.calls,
        errors: edge.errors,
        warnings: edge.warnings,
        errorRate: edge.calls ? edge.errors / edge.calls : 0,
        traces: edge.traces.size,
        timed: edge.timed,
        avgMs: edge.timed ? edge.durationSum / edge.timed : null,
        medianMs,
        p95Ms,
        maxMs: edge.maxMs,
        latencyApproximate: Boolean(edge.histogram)
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
        timed: rows.reduce((sum, row) => sum + row.timed, 0),
        approximateLatencyEdges: rows.filter((row) => row.latencyApproximate).length,
        edgeLimitHit,
        droppedCalls
      }
    };
  }

  root.SignalDockServiceMatrix = {
    build,
    MAX_DURATION_SAMPLES,
    MAX_EDGES,
    HISTOGRAM_BUCKETS
  };
}(typeof self !== "undefined" ? self : window));
