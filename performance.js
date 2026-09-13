(function (root) {
  "use strict";

  const MAX_SAMPLES = 40;
  const metrics = new Map();
  let longTasks = 0;
  let longestTaskMs = 0;

  function now() {
    return root.performance?.now ? root.performance.now() : Date.now();
  }

  function record(name, elapsedMs, meta = {}) {
    const value = Number(elapsedMs);
    if (!Number.isFinite(value) || value < 0) return;
    const samples = metrics.get(name) || [];
    samples.push({ value, at: Date.now(), meta: meta && typeof meta === "object" ? meta : {} });
    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
    metrics.set(name, samples);
  }

  function start(name, meta = {}) {
    const started = now();
    return (extra = {}) => {
      const elapsed = now() - started;
      record(name, elapsed, Object.assign({}, meta, extra));
      return elapsed;
    };
  }

  function summarizeSamples(samples) {
    if (!samples?.length) return null;
    const values = samples.map((sample) => sample.value);
    const total = values.reduce((sum, value) => sum + value, 0);
    const sorted = [...values].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    return {
      count: values.length,
      lastMs: values[values.length - 1],
      avgMs: total / values.length,
      p95Ms: p95,
      maxMs: sorted[sorted.length - 1],
      lastMeta: samples[samples.length - 1].meta
    };
  }

  function snapshot() {
    const out = {};
    for (const [name, samples] of metrics.entries()) out[name] = summarizeSamples(samples);
    const memory = root.performance?.memory ? {
      usedJSHeapBytes: root.performance.memory.usedJSHeapSize,
      totalJSHeapBytes: root.performance.memory.totalJSHeapSize,
      jsHeapLimitBytes: root.performance.memory.jsHeapSizeLimit
    } : null;
    return {
      metrics: out,
      longTasks,
      longestTaskMs,
      memory,
      generatedAt: new Date().toISOString()
    };
  }

  function reset() {
    metrics.clear();
    longTasks = 0;
    longestTaskMs = 0;
  }

  function observeLongTasks() {
    if (typeof root.PerformanceObserver !== "function") return false;
    try {
      const observer = new root.PerformanceObserver((list) => {
        for (const item of list.getEntries()) {
          longTasks += 1;
          longestTaskMs = Math.max(longestTaskMs, Number(item.duration) || 0);
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      return true;
    } catch { return false; }
  }

  root.SignalDockPerformance = { record, start, snapshot, reset, observeLongTasks };
}(typeof self !== "undefined" ? self : window));
