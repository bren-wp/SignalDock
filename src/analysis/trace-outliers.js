(function (root) {
  "use strict";

  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function compareRanked(a, b) {
    return b.score - a.score || (b.durationMs || 0) - (a.durationMs || 0) || b.errors - a.errors;
  }

  function createBoundedRanker(limit) {
    const heap = [];
    function swap(left, right) {
      const value = heap[left];
      heap[left] = heap[right];
      heap[right] = value;
    }
    function siftUp(index) {
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (compareRanked(heap[parent], heap[index]) >= 0) break;
        swap(parent, index);
        index = parent;
      }
    }
    function siftDown(index) {
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let worst = index;
        if (left < heap.length && compareRanked(heap[left], heap[worst]) > 0) worst = left;
        if (right < heap.length && compareRanked(heap[right], heap[worst]) > 0) worst = right;
        if (worst === index) break;
        swap(index, worst);
        index = worst;
      }
    }
    return {
      add(row) {
        if (heap.length < limit) {
          heap.push(row);
          siftUp(heap.length - 1);
          return;
        }
        if (compareRanked(row, heap[0]) >= 0) return;
        heap[0] = row;
        siftDown(0);
      },
      rows() {
        return heap.sort(compareRanked);
      }
    };
  }

  function aggregate(entries, indexes = null) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes : null;
    const traces = new Map();
    const collect = (entry) => {
      const id = String(entry?.correlations?.trace || "").trim(); if (!id) return;
      const row = traces.get(id) || { traceId: id, entries: 0, spans: new Set(), services: new Set(), errors: 0, warnings: 0, events: 0, startMs: null, endMs: null };
      row.entries += 1;
      const span = String(entry?.correlations?.span || "").trim(); if (span) row.spans.add(span);
      const service = String(entry?.service || "").trim(); if (service && service !== "—") row.services.add(service);
      if (entry.level === "ERROR" || entry.level === "FATAL") row.errors += 1; else if (entry.level === "WARN") row.warnings += 1;
      const events = Array.isArray(entry?.traceMeta?.otel?.events) ? entry.traceMeta.otel.events : Array.isArray(entry?.traceMeta?.events) ? entry.traceMeta.events : [];
      row.events += events.length;
      const start = Number(entry?.timestampMs); const duration = Number(entry?.traceMeta?.durationMs);
      if (Number.isFinite(start)) {
        const end = Number.isFinite(duration) && duration >= 0 ? start + duration : start;
        row.startMs = row.startMs === null ? start : Math.min(row.startMs, start); row.endMs = row.endMs === null ? end : Math.max(row.endMs, end);
      }
      traces.set(id, row);
    };
    if (selected) {
      for (const index of selected) {
        const entry = source[index];
        if (entry) collect(entry);
      }
    } else {
      for (const entry of source) {
        if (entry) collect(entry);
      }
    }
    return [...traces.values()].map((row) => ({
      traceId: row.traceId,
      entries: row.entries,
      spans: row.spans.size,
      services: [...row.services].sort(),
      serviceCount: row.services.size,
      errors: row.errors,
      warnings: row.warnings,
      events: row.events,
      durationMs: row.startMs !== null && row.endMs !== null ? Math.max(0, row.endMs - row.startMs) : null
    }));
  }

  function rank(entries, options = {}) {
    const traces = aggregate(entries, options.indexes);
    const timed = traces.map((row) => row.durationMs).filter((value) => Number.isFinite(value) && value >= 0);
    const center = median(timed);
    const deviations = center === null ? [] : timed.map((value) => Math.abs(value - center));
    const mad = median(deviations) || 0;
    const scale = mad > 0 ? 1.4826 * mad : 0;
    const limit = Math.max(1, Math.floor(Number(options.limit) || 100));
    const ranker = createBoundedRanker(limit);
    for (const row of traces) {
      const latencyScore = Number.isFinite(row.durationMs) && center !== null && scale > 0 ? Math.max(0, (row.durationMs - center) / scale) : 0;
      const errorScore = row.errors ? 2 + Math.min(6, row.errors * 0.75) : 0;
      const breadthScore = row.serviceCount >= 4 ? Math.min(3, (row.serviceCount - 3) * 0.5) : 0;
      const score = latencyScore + errorScore + breadthScore;
      const reasons = [];
      if (latencyScore >= 2) reasons.push(`duration ${latencyScore.toFixed(1)} robust deviations above median`);
      if (row.errors) reasons.push(`${row.errors} error${row.errors === 1 ? "" : "s"}`);
      if (row.serviceCount >= 4) reasons.push(`${row.serviceCount} services involved`);
      if (!reasons.length && Number.isFinite(row.durationMs) && center !== null && row.durationMs > center) reasons.push("above-median duration");
      const ranked = { ...row, score, reasons };
      if (ranked.score > 0 || options.includeAll) ranker.add(ranked);
    }
    return { rows: ranker.rows(), baseline: { timedTraces: timed.length, medianDurationMs: center, madMs: mad, robustScaleMs: scale }, totalTraces: traces.length };
  }

  root.SignalDockTraceOutliers = { aggregate, rank };
}(typeof self !== "undefined" ? self : window));
