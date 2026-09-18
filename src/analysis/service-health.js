(function (root) {
  "use strict";

  function percentileSorted(sorted, p) {
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[index];
  }

  function percentile(values, p) {
    return percentileSorted(values.slice().sort((a, b) => a - b), p);
  }

  function timestamp(entry) {
    if (Number.isFinite(entry?.timestampMs)) return entry.timestampMs;
    const value = Date.parse(entry?.timestamp || "");
    return Number.isFinite(value) ? value : null;
  }

  function healthStatus(row) {
    if (row.fatal > 0 || row.errorRate >= 0.10) return "critical";
    if (row.errorRate >= 0.02 || row.warningRate >= 0.15 || (row.recentErrors >= 3 && row.recentErrors >= row.previousErrors * 2)) return "degraded";
    if (row.exceptionGroups >= 3 || row.warningRate >= 0.05) return "watch";
    return "quiet";
  }

  function analyze(entries, options = {}) {
    const source = Array.isArray(entries) ? entries : [];
    const indexes = Array.isArray(options.indexes) ? options.indexes : null;
    const each = (callback) => {
      if (indexes) {
        for (const index of indexes) {
          const entry = source[index];
          if (entry) callback(entry, index);
        }
        return;
      }
      for (let index = 0; index < source.length; index += 1) {
        const entry = source[index];
        if (entry) callback(entry, index);
      }
    };

    let latest = null;
    let earliest = null;
    each((entry) => {
      const ts = timestamp(entry);
      if (ts === null) return;
      if (latest === null || ts > latest) latest = ts;
      if (earliest === null || ts < earliest) earliest = ts;
    });
    const span = latest !== null && earliest !== null ? Math.max(1, latest - earliest) : 0;
    const windowMs = Math.max(60_000, Number(options.windowMs) || Math.min(6 * 60 * 60 * 1000, Math.max(15 * 60 * 1000, Math.floor(span / 4) || 60 * 60 * 1000)));
    const recentStart = latest === null ? null : latest - windowMs;
    const previousStart = recentStart === null ? null : recentStart - windowMs;
    const groups = new Map();

    each((entry) => {
      const service = String(entry?.service || "—").trim() || "—";
      if (service === "—" && options.includeUnknown !== true) return;
      if (!groups.has(service)) groups.set(service, { service, total: 0, errors: 0, fatal: 0, warnings: 0, traces: new Set(), environments: new Set(), namespaces: new Set(), exceptionFingerprints: new Set(), durations: [], recentErrors: 0, previousErrors: 0, sources: new Set() });
      const row = groups.get(service);
      row.total += 1;
      const level = String(entry?.level || "UNKNOWN").toUpperCase();
      if (level === "ERROR") row.errors += 1;
      if (level === "FATAL") { row.fatal += 1; row.errors += 1; }
      if (level === "WARN") row.warnings += 1;
      if (entry?.correlations?.trace) row.traces.add(String(entry.correlations.trace));
      if (entry?.dimensions?.environment) row.environments.add(String(entry.dimensions.environment));
      if (entry?.dimensions?.namespace) row.namespaces.add(String(entry.dimensions.namespace));
      if (entry?.exceptionFingerprint) row.exceptionFingerprints.add(String(entry.exceptionFingerprint));
      if (entry?.source) row.sources.add(String(entry.source));
      const duration = Number(entry?.traceMeta?.durationMs);
      if (Number.isFinite(duration) && duration >= 0) row.durations.push(duration);
      const ts = timestamp(entry);
      if ((level === "ERROR" || level === "FATAL") && ts !== null && recentStart !== null) {
        if (ts > recentStart) row.recentErrors += 1;
        else if (ts > previousStart) row.previousErrors += 1;
      }
    });

    const rows = [...groups.values()].map((row) => {
      row.durations.sort((a, b) => a - b);
      const result = {
        service: row.service,
        total: row.total,
        errors: row.errors,
        fatal: row.fatal,
        warnings: row.warnings,
        errorRate: row.total ? row.errors / row.total : 0,
        warningRate: row.total ? row.warnings / row.total : 0,
        traces: row.traces.size,
        environments: [...row.environments].sort(),
        namespaces: [...row.namespaces].sort(),
        exceptionGroups: row.exceptionFingerprints.size,
        p95DurationMs: percentileSorted(row.durations, 0.95),
        medianDurationMs: percentileSorted(row.durations, 0.50),
        durationSamples: row.durations.length,
        recentErrors: row.recentErrors,
        previousErrors: row.previousErrors,
        sources: row.sources.size
      };
      result.status = healthStatus(result);
      return result;
    }).sort((a, b) => {
      const rank = { critical: 0, degraded: 1, watch: 2, quiet: 3 };
      return rank[a.status] - rank[b.status] || b.errorRate - a.errorRate || b.total - a.total || a.service.localeCompare(b.service);
    });

    const summary = rows.reduce((acc, row) => { acc[row.status] += 1; return acc; }, { critical: 0, degraded: 0, watch: 0, quiet: 0 });
    return { latest, earliest, windowMs, rows, summary };
  }

  root.SignalDockServiceHealth = { analyze, healthStatus, percentile };
}(typeof self !== "undefined" ? self : window));
