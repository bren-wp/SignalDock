(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      relatedIndexes,
      canUseWorker,
      requestCorrelation,
      requestTrace,
      renderCorrelations,
      renderTrace,
      now,
      recordPerformance
    } = options;

    if (!state) throw new Error("Related Context controller requires state.");
    const required = {
      relatedIndexes,
      canUseWorker,
      requestCorrelation,
      requestTrace,
      renderCorrelations,
      renderTrace,
      now,
      recordPerformance
    };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== "function") throw new Error(`Related Context controller requires ${name}().`);
    }

    function elapsedSince(started) {
      return Math.round((now() - started) * 10) / 10;
    }

    function loadCorrelations(entry) {
      if (!entry) return { mode: "none", reason: "no-entry" };

      state.correlationRequestId += 1;
      const requestId = state.correlationRequestId;
      const correlations = entry.correlations || {};

      if (!Object.keys(correlations).length) {
        state.correlatedIndexes = [];
        state.correlationEngine = "none";
        renderCorrelations(entry);
        return { mode: "none", requestId, reason: "no-correlations" };
      }

      if (canUseWorker()) {
        state.correlationEngine = "worker · searching";
        renderCorrelations(entry);
        if (requestCorrelation({
          requestId,
          correlations,
          limit: 200,
          origin: entry.globalIndex
        })) {
          return { mode: "worker", requestId };
        }
      }

      const started = now();
      state.correlatedIndexes = relatedIndexes(
        state.filterEntries,
        correlations,
        200,
        entry.globalIndex
      );
      const elapsed = elapsedSince(started);
      state.correlationEngine = `main · ${elapsed} ms`;
      recordPerformance("correlation", elapsed, { engine: "main" });
      renderCorrelations(entry);
      return { mode: "main", requestId, elapsed };
    }

    function loadTrace(entry) {
      if (!entry) return { mode: "none", reason: "no-entry" };

      state.traceRequestId += 1;
      const requestId = state.traceRequestId;
      const traceId = entry.correlations?.trace;

      if (!traceId) {
        state.traceIndexes = [];
        state.traceEngine = "none";
        renderTrace(entry);
        return { mode: "none", requestId, reason: "no-trace" };
      }

      const correlations = { trace: traceId };
      if (canUseWorker()) {
        state.traceEngine = "worker · searching";
        renderTrace(entry);
        if (requestTrace({
          requestId,
          correlations,
          limit: 1000,
          origin: entry.globalIndex
        })) {
          return { mode: "worker", requestId };
        }
      }

      const started = now();
      state.traceIndexes = relatedIndexes(
        state.filterEntries,
        correlations,
        1000,
        entry.globalIndex
      );
      const elapsed = elapsedSince(started);
      state.traceEngine = `main · ${elapsed} ms`;
      recordPerformance("trace", elapsed, { engine: "main" });
      renderTrace(entry);
      return { mode: "main", requestId, elapsed };
    }

    return Object.freeze({
      VERSION,
      loadCorrelations,
      loadTrace
    });
  }

  root.SignalDockRelatedContextController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
