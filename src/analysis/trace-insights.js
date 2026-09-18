(function (root) {
  "use strict";

  function analyze(entries) {
    const rows = Array.isArray(entries) ? entries : [];
    const spanIds = new Set();
    let spanCount = 0;
    for (const entry of rows) {
      const span = entry?.correlations?.span;
      if (!span) continue;
      spanCount += 1;
      spanIds.add(String(span));
    }

    let roots = 0;
    let orphans = 0;
    let errorSpans = 0;
    let timedSpans = 0;
    let spanEvents = 0;
    const services = new Set();
    const scopes = new Set();
    const resources = new Set();
    const kinds = new Map();
    const serviceStats = new Map();

    for (const entry of rows) {
      const service = String(entry?.service || "—");
      if (service && service !== "—") services.add(service);
      const otel = entry?.traceMeta?.otel || {};
      if (otel.scope?.name) scopes.add(`${otel.scope.name}${otel.scope.version ? `@${otel.scope.version}` : ""}`);
      if (otel.resource && Object.keys(otel.resource).length) {
        const resourceKey = Object.entries(otel.resource).sort(([a], [b]) => a.localeCompare(b)).slice(0, 16).map(([k, v]) => `${k}=${v}`).join("|");
        if (resourceKey) resources.add(resourceKey);
      }
      if (otel.kind !== undefined && otel.kind !== null && String(otel.kind) !== "") kinds.set(String(otel.kind), (kinds.get(String(otel.kind)) || 0) + 1);
      const events = Array.isArray(otel.events) ? otel.events.length : Array.isArray(entry?.traceMeta?.events) ? entry.traceMeta.events.length : 0;
      spanEvents += events;
      if (entry?.correlations?.span) {
        const parent = entry.correlations.parent_span;
        if (!parent) roots += 1;
        else if (!spanIds.has(String(parent))) orphans += 1;
        if (entry.level === "ERROR" || entry.level === "FATAL" || String(otel.status?.code || "").toUpperCase() === "ERROR") errorSpans += 1;
        if (Number.isFinite(entry?.traceMeta?.durationMs)) timedSpans += 1;
        if (!serviceStats.has(service)) serviceStats.set(service, { service, spans: 0, errors: 0, durationMs: 0, timed: 0 });
        const stat = serviceStats.get(service); stat.spans += 1; if (entry.level === "ERROR" || entry.level === "FATAL") stat.errors += 1; if (Number.isFinite(entry?.traceMeta?.durationMs)) { stat.durationMs += entry.traceMeta.durationMs; stat.timed += 1; }
      }
    }

    const parented = Math.max(0, spanCount - roots);
    const linkedParents = Math.max(0, parented - orphans);
    const parentCoverage = parented ? linkedParents / parented : 1;
    const serviceBreakdown = [...serviceStats.values()].map((stat) => ({
      ...stat,
      avgDurationMs: stat.timed ? stat.durationMs / stat.timed : null
    })).sort((a, b) => b.spans - a.spans || b.errors - a.errors || a.service.localeCompare(b.service));

    return {
      entries: rows.length,
      spans: spanCount,
      events: Math.max(0, rows.length - spanCount),
      roots,
      orphans,
      parentCoverage,
      errorSpans,
      timedSpans,
      spanEvents,
      services: services.size,
      scopes: [...scopes].sort(),
      resourceSets: resources.size,
      kinds: [...kinds.entries()].sort((a, b) => b[1] - a[1]),
      serviceBreakdown
    };
  }

  root.SignalDockTraceInsights = { analyze };
}(typeof self !== "undefined" ? self : window));
