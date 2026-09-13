(function (root) {
  "use strict";

  function timeOf(entry) {
    if (Number.isFinite(entry?.timestampMs)) return entry.timestampMs;
    const parsed = Date.parse(entry?.timestamp || "");
    return Number.isFinite(parsed) ? parsed : null;
  }

  function fingerprintOf(entry) {
    return String(entry?.exceptionFingerprint || (root.SignalDockExceptionGroups?.candidate?.(entry) ? root.SignalDockExceptionGroups.fingerprint(entry) : "") || "");
  }

  function classify(recent, previous) {
    if (recent >= 3 && recent >= previous * 2 && recent - previous >= 2) return "spiking";
    if (recent > previous) return "rising";
    if (recent < previous) return "falling";
    return "stable";
  }

  function analyze(entries, options = {}) {
    const rows = [];
    let latest = null;
    let earliest = null;
    for (const entry of entries || []) {
      const fingerprint = fingerprintOf(entry);
      const time = timeOf(entry);
      if (!fingerprint || time === null) continue;
      rows.push({ fingerprint, time, level: String(entry.level || "UNKNOWN").toUpperCase(), service: String(entry.service || "—") });
      latest = latest === null ? time : Math.max(latest, time);
      earliest = earliest === null ? time : Math.min(earliest, time);
    }
    if (!rows.length) return { latest: null, earliest: null, windowMs: 0, bucketMs: 0, buckets: [], groups: new Map(), summary: { spiking: 0, rising: 0, stable: 0, falling: 0 } };

    const totalSpan = Math.max(1, latest - earliest);
    const defaultWindow = Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Math.floor(totalSpan / 4)));
    const windowMs = Math.max(60_000, Number(options.windowMs) || defaultWindow);
    const recentStart = latest - windowMs;
    const previousStart = latest - windowMs * 2;
    const bucketCount = Math.max(8, Math.min(48, Number(options.bucketCount) || 20));
    const bucketMs = Math.max(1, totalSpan / bucketCount);
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({ index, startMs: earliest + index * bucketMs, endMs: earliest + (index + 1) * bucketMs, count: 0, errors: 0, fatal: 0 }));
    const groups = new Map();

    for (const row of rows) {
      const bucketIndex = Math.min(bucketCount - 1, Math.max(0, Math.floor((row.time - earliest) / bucketMs)));
      const bucket = buckets[bucketIndex]; bucket.count += 1; if (row.level === "ERROR") bucket.errors += 1; if (row.level === "FATAL") bucket.fatal += 1;
      if (!groups.has(row.fingerprint)) groups.set(row.fingerprint, { fingerprint: row.fingerprint, total: 0, recent: 0, previous: 0, firstMs: row.time, lastMs: row.time, services: new Map(), buckets: new Array(bucketCount).fill(0) });
      const group = groups.get(row.fingerprint);
      group.total += 1; group.firstMs = Math.min(group.firstMs, row.time); group.lastMs = Math.max(group.lastMs, row.time); group.services.set(row.service, (group.services.get(row.service) || 0) + 1); group.buckets[bucketIndex] += 1;
      if (row.time > recentStart) group.recent += 1;
      else if (row.time > previousStart) group.previous += 1;
    }

    const summary = { spiking: 0, rising: 0, stable: 0, falling: 0 };
    for (const group of groups.values()) {
      group.trend = classify(group.recent, group.previous);
      group.delta = group.recent - group.previous;
      group.ratio = group.previous ? group.recent / group.previous : (group.recent ? Infinity : 1);
      group.services = [...group.services.entries()].sort((a, b) => b[1] - a[1]);
      summary[group.trend] += 1;
    }
    return { latest, earliest, windowMs, bucketMs, buckets, groups, summary };
  }

  function merge(groups, trendResult) {
    return (groups || []).map((group) => Object.assign({}, group, { trend: trendResult?.groups?.get?.(group.fingerprint) || null }));
  }

  root.SignalDockExceptionTrends = { analyze, merge, classify };
}(typeof self !== "undefined" ? self : window));
