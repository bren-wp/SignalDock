(function (root) {
  "use strict";

  function endTime(entry) {
    if (!Number.isFinite(entry?.timestampMs)) return null;
    const duration = Number.isFinite(entry?.traceMeta?.durationMs) ? Math.max(0, entry.traceMeta.durationMs) : 0;
    return entry.timestampMs + duration;
  }

  function analyze(entries, indexes = null) {
    const source = Array.isArray(entries) ? entries : [];
    const selectedIndexes = Array.isArray(indexes) ? indexes : null;
    const spans = [];
    let selectedCount = 0;
    let traceStart = Infinity;
    let traceEnd = -Infinity;
    let declaredParents = 0;
    let measuredSpans = 0;

    const collect = (entry) => {
      if (!entry) return;
      selectedCount += 1;
      if (!entry?.correlations?.span || !Number.isFinite(entry.timestampMs)) return;
      spans.push(entry);
      if (String(entry.traceMeta?.parentSpan || "")) declaredParents += 1;
      if (Number.isFinite(entry.traceMeta?.durationMs)) measuredSpans += 1;
      if (entry.timestampMs < traceStart) traceStart = entry.timestampMs;
      const end = endTime(entry) ?? entry.timestampMs;
      if (end > traceEnd) traceEnd = end;
    };

    if (selectedIndexes) {
      for (const index of selectedIndexes) collect(source[index]);
    } else {
      for (const entry of source) collect(entry);
    }

    if (!spans.length) return { available: false, reason: "No timestamped spans are available.", entries: selectedCount, spans: 0, chain: [], latencyMs: null, coverage: 0, completeParents: false };

    const bySpan = new Map();
    for (const entry of spans) bySpan.set(String(entry.correlations.span), entry);

    const children = new Map();
    const roots = [];
    let linkedParents = 0;
    for (const span of spans) {
      const parent = String(span.traceMeta?.parentSpan || "");
      if (!parent || !bySpan.has(parent)) {
        roots.push(span);
        continue;
      }
      linkedParents += 1;
      const list = children.get(parent) || [];
      list.push(span);
      children.set(parent, list);
    }

    const missingParents = Math.max(0, declaredParents - linkedParents);
    const memo = new Map();
    function subtreeEnd(span) {
      const rootId = String(span.correlations.span);
      if (memo.has(rootId)) return memo.get(rootId);

      const stack = [{ span, expanded: false }];
      const visiting = new Set();
      while (stack.length) {
        const frame = stack.pop();
        const current = frame.span;
        const id = String(current.correlations.span);
        if (memo.has(id)) {
          visiting.delete(id);
          continue;
        }

        if (frame.expanded) {
          let latest = endTime(current) ?? current.timestampMs;
          for (const child of children.get(id) || []) {
            const childId = String(child.correlations.span);
            const childEnd = memo.get(childId);
            latest = Math.max(latest, Number.isFinite(childEnd) ? childEnd : (endTime(child) ?? child.timestampMs));
          }
          memo.set(id, latest);
          visiting.delete(id);
          continue;
        }

        if (visiting.has(id)) {
          memo.set(id, endTime(current) ?? current.timestampMs);
          continue;
        }

        visiting.add(id);
        stack.push({ span: current, expanded: true });
        const direct = children.get(id) || [];
        for (let index = direct.length - 1; index >= 0; index -= 1) {
          const child = direct[index];
          const childId = String(child.correlations.span);
          if (!memo.has(childId) && !visiting.has(childId)) stack.push({ span: child, expanded: false });
        }
      }
      return memo.get(rootId) ?? (endTime(span) ?? span.timestampMs);
    }

    let root = roots[0] || spans[0];
    for (let index = 1; index < roots.length; index += 1) {
      const candidate = roots[index];
      const candidateEnd = subtreeEnd(candidate);
      const rootEnd = subtreeEnd(root);
      if (candidateEnd > rootEnd || (candidateEnd === rootEnd && candidate.timestampMs < root.timestampMs)) root = candidate;
    }

    const chain = [];
    let current = root;
    const seen = new Set();
    while (current && !seen.has(current.correlations.span)) {
      seen.add(current.correlations.span);
      chain.push(current);
      const direct = children.get(String(current.correlations.span)) || [];
      if (!direct.length) break;
      let next = direct[0];
      for (let index = 1; index < direct.length; index += 1) {
        const candidate = direct[index];
        const candidateEnd = subtreeEnd(candidate);
        const nextEnd = subtreeEnd(next);
        const candidateDuration = Number(candidate.traceMeta?.durationMs) || 0;
        const nextDuration = Number(next.traceMeta?.durationMs) || 0;
        if (candidateEnd > nextEnd || (candidateEnd === nextEnd && candidateDuration > nextDuration)) next = candidate;
      }
      current = next;
    }

    let bottleneck = null;
    for (const entry of chain) {
      if (!Number.isFinite(entry.traceMeta?.durationMs)) continue;
      if (!bottleneck || entry.traceMeta.durationMs > bottleneck.traceMeta.durationMs) bottleneck = entry;
    }
    const coverage = declaredParents ? linkedParents / declaredParents : 1;
    const completeParents = missingParents === 0;

    return {
      available: true,
      entries: selectedCount,
      spans: spans.length,
      roots: roots.length,
      linkedParents,
      missingParents,
      completeParents,
      coverage,
      traceStart,
      traceEnd,
      latencyMs: Math.max(0, traceEnd - traceStart),
      measuredSpans,
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
