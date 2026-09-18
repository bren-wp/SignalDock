(function (root) {
  "use strict";

  const STATUS_RANK = { regressed: 0, new: 1, stable: 2, improved: 3, missing: 4 };

  function finite(value) {
    if (value === null || value === undefined || value === "") return false;
    return Number.isFinite(Number(value));
  }

  function bySignature(rows) {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row) continue;
      map.set(row.signature, row);
    }
    return map;
  }

  function classify(current, baseline, p95Delta, errorRateDelta) {
    if (!baseline) return "new";
    if (!current) return "missing";

    const baselineP95 = Number(baseline.p95DurationMs) || 0;
    const p95Threshold = Math.max(25, baselineP95 * 0.2);
    if ((p95Delta !== null && p95Delta > p95Threshold) || errorRateDelta >= 0.05) return "regressed";
    if ((p95Delta !== null && p95Delta < -p95Threshold) || errorRateDelta <= -0.05) return "improved";
    return "stable";
  }

  function compareRows(a, b) {
    return STATUS_RANK[a.status] - STATUS_RANK[b.status]
      || Math.abs(b.p95Delta || 0) - Math.abs(a.p95Delta || 0)
      || Math.abs(b.errorRateDelta) - Math.abs(a.errorRateDelta);
  }

  function compare(currentSnapshot, baselineSnapshot) {
    const currentMap = bySignature(currentSnapshot?.traceSets);
    const baselineMap = bySignature(baselineSnapshot?.traceSets);
    const signatures = new Set(currentMap.keys());
    for (const signature of baselineMap.keys()) signatures.add(signature);

    const rows = [];
    const summary = { sets: signatures.size, regressed: 0, improved: 0, newSets: 0, missing: 0 };

    for (const signature of signatures) {
      const current = currentMap.get(signature);
      const baseline = baselineMap.get(signature);
      const currentP95 = finite(current?.p95DurationMs) ? Number(current.p95DurationMs) : null;
      const baselineP95 = finite(baseline?.p95DurationMs) ? Number(baseline.p95DurationMs) : null;
      const p95Delta = currentP95 !== null && baselineP95 !== null ? currentP95 - baselineP95 : null;
      const currentErrorRate = Number(current?.errorRate) || 0;
      const baselineErrorRate = Number(baseline?.errorRate) || 0;
      const errorRateDelta = currentErrorRate - baselineErrorRate;
      const currentTraces = Number(current?.traces) || 0;
      const baselineTraces = Number(baseline?.traces) || 0;
      const status = classify(current, baseline, p95Delta, errorRateDelta);

      if (status === "regressed") summary.regressed += 1;
      else if (status === "improved") summary.improved += 1;
      else if (status === "new") summary.newSets += 1;
      else if (status === "missing") summary.missing += 1;

      rows.push({
        signature,
        services: current?.services || baseline?.services || [],
        status,
        currentTraces,
        baselineTraces,
        countDelta: currentTraces - baselineTraces,
        currentP95,
        baselineP95,
        p95Delta,
        currentErrorRate,
        baselineErrorRate,
        errorRateDelta
      });
    }

    rows.sort(compareRows);
    return { rows, summary };
  }

  root.SignalDockTraceRegression = { compare };
}(typeof self !== "undefined" ? self : window));
