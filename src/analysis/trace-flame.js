(function (root) {
  "use strict";

  function duration(entry) {
    const raw = entry?.traceMeta?.durationMs;
    if (raw === null || raw === undefined || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function layout(entries, options = {}) {
    const maxBars = Math.max(50, Math.min(1000, Number(options.maxBars) || 400));
    const spans = (entries || []).filter((entry) => Number.isFinite(entry?.timestampMs) && duration(entry) !== null && entry?.correlations?.span);
    if (!spans.length) return { available: false, bars: [], minStart: null, maxEnd: null, totalMs: 0, maxDepth: 0, omitted: 0, note: "No timed spans with duration metadata." };

    const bySpan = new Map();
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const entry of spans) {
      bySpan.set(String(entry.correlations.span), entry);
      if (entry.timestampMs < minStart) minStart = entry.timestampMs;
      const end = entry.timestampMs + duration(entry);
      if (end > maxEnd) maxEnd = end;
    }

    function depthOf(entry) {
      let depth = 0;
      let parent = entry?.traceMeta?.parentSpan;
      const seen = new Set();
      while (parent && bySpan.has(String(parent)) && depth < 32 && !seen.has(String(parent))) {
        seen.add(String(parent));
        depth += 1;
        parent = bySpan.get(String(parent))?.traceMeta?.parentSpan;
      }
      return depth;
    }

    const totalMs = Math.max(0.001, maxEnd - minStart);
    const sorted = spans.slice().sort((a, b) => a.timestampMs - b.timestampMs || duration(b) - duration(a));
    const selected = sorted.slice(0, maxBars);
    const bars = selected.map((entry) => {
      const depth = depthOf(entry);
      const startPct = ((entry.timestampMs - minStart) / totalMs) * 100;
      const widthPct = Math.max(0.2, (duration(entry) / totalMs) * 100);
      return {
        id: entry.id,
        span: entry.correlations.span,
        parentSpan: entry.traceMeta?.parentSpan || "",
        service: entry.service || "—",
        name: entry.traceMeta?.name || entry.message || "span",
        level: entry.level || "UNKNOWN",
        durationMs: duration(entry),
        depth,
        startPct: Math.max(0, Math.min(100, startPct)),
        widthPct: Math.max(0.2, Math.min(100 - Math.max(0, startPct), widthPct))
      };
    });
    return {
      available: true,
      bars,
      minStart,
      maxEnd,
      totalMs,
      maxDepth: bars.reduce((max, bar) => Math.max(max, bar.depth), 0),
      omitted: Math.max(0, spans.length - bars.length),
      note: spans.length > bars.length ? `Showing ${bars.length} of ${spans.length} timed spans.` : `${spans.length} timed spans.`
    };
  }

  root.SignalDockTraceFlame = { layout };
}(typeof self !== "undefined" ? self : window));
