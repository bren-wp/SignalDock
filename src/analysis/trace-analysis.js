(function (root) {
  "use strict";

  function endTime(entry) {
    if (!Number.isFinite(entry?.timestampMs)) return null;
    const duration = Number.isFinite(entry?.traceMeta?.durationMs) ? Math.max(0, entry.traceMeta.durationMs) : 0;
    return entry.timestampMs + duration;
  }

  function analyze(entries, indexes = null) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes.map((index) => source[index]).filter(Boolean) : source.filter(Boolean);
    const spans = selected.filter((entry) => entry?.correlations?.span && Number.isFinite(entry.timestampMs));
    if (!spans.length) return { available: false, reason: "No timestamped spans are available.", entries: selected.length, spans: 0, chain: [], latencyMs: null, coverage: 0, completeParents: false };

    const bySpan = new Map(spans.map((entry) => [String(entry.correlations.span), entry]));
    const children = new Map();
    let linkedParents = 0;
    for (const span of spans) {
      const parent = String(span.traceMeta?.parentSpan || "");
      if (!parent || !bySpan.has(parent)) continue;
      linkedParents += 1;
      const list = children.get(parent) || [];
      list.push(span);
      children.set(parent, list);
    }

    const declaredParents = spans.filter((span) => String(span.traceMeta?.parentSpan || "")).length;
    const missingParents = Math.max(0, declaredParents - linkedParents);
    const roots = spans.filter((span) => {
      const parent = String(span.traceMeta?.parentSpan || "");
      return !parent || !bySpan.has(parent);
    });
    const traceStart = Math.min(...spans.map((entry) => entry.timestampMs));
    const traceEnd = Math.max(...spans.map((entry) => endTime(entry) ?? entry.timestampMs));

    const memo = new Map();
    function subtreeEnd(span) {
      const id = String(span.correlations.span);
      if (memo.has(id)) return memo.get(id);
      let latest = endTime(span) ?? span.timestampMs;
      for (const child of children.get(id) || []) latest = Math.max(latest, subtreeEnd(child));
      memo.set(id, latest);
      return latest;
    }

    const root = [...roots].sort((a, b) => {
      const endDiff = subtreeEnd(b) - subtreeEnd(a);
      return endDiff || a.timestampMs - b.timestampMs;
    })[0] || spans[0];

    const chain = [];
    let current = root;
    const seen = new Set();
    while (current && !seen.has(current.correlations.span)) {
      seen.add(current.correlations.span);
      chain.push(current);
      const direct = children.get(String(current.correlations.span)) || [];
      if (!direct.length) break;
      current = [...direct].sort((a, b) => subtreeEnd(b) - subtreeEnd(a) || (b.traceMeta?.durationMs || 0) - (a.traceMeta?.durationMs || 0))[0];
    }

    const measured = spans.filter((entry) => Number.isFinite(entry.traceMeta?.durationMs));
    const chainMeasured = chain.filter((entry) => Number.isFinite(entry.traceMeta?.durationMs));
    const bottleneck = [...chainMeasured].sort((a, b) => b.traceMeta.durationMs - a.traceMeta.durationMs)[0] || null;
    const coverage = declaredParents ? linkedParents / declaredParents : 1;
    const completeParents = missingParents === 0;

    return {
      available: true,
      entries: selected.length,
      spans: spans.length,
      roots: roots.length,
      linkedParents,
      missingParents,
      completeParents,
      coverage,
      traceStart,
      traceEnd,
      latencyMs: Math.max(0, traceEnd - traceStart),
      measuredSpans: measured.length,
      chain,
      bottleneck,
      method: completeParents ? "parent-span critical chain" : "partial parent-span critical chain",
      note: completeParents
        ? "Critical chain follows the explicit parent-span branch whose descendants finish latest."
        : "Some parent spans are missing; the chain uses only explicit relationships present in the loaded logs."
    };
  }

  root.SignalDockTraceAnalysis = { analyze, endTime };
}(typeof self !== "undefined" ? self : window));
