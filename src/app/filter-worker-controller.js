(function (root) {
  "use strict";

  const VERSION = 1;
  const PROTOCOL_VERSION = 1;
  const ALLOWED_INBOUND_TYPES = new Set(["ready", "indexed", "filtered", "correlated", "trace-related"]);

  function create(options = {}) {
    const {
      state,
      workerThreshold = 25000,
      isFileProtocol,
      createSessionToken,
      createWorkerInstance,
      applyFilteredIndexes,
      renderCorrelationsPane,
      renderTracePane,
      getSelectedEntry,
      updateDiagnostics,
      recordPerformance,
      toast
    } = options;

    if (!state) throw new Error("Filter Worker controller requires state.");
    const required = {
      isFileProtocol,
      createSessionToken,
      createWorkerInstance,
      applyFilteredIndexes,
      renderCorrelationsPane,
      renderTracePane,
      getSelectedEntry,
      updateDiagnostics,
      recordPerformance,
      toast
    };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== "function") throw new Error(`Filter Worker controller requires ${name}().`);
    }

    let initialized = false;

    function resetSearchIndex() {
      state.searchIndex = {
        enabled: false,
        tokens: 0,
        postings: 0,
        truncated: false,
        elapsedMs: 0,
        mode: "linear",
        candidateCount: state.entries.length,
        cacheHit: false,
        cacheEligible: false,
        cacheSegments: 0
      };
    }

    function canUseWorker() {
      return state.settings?.useWorker !== false
        && Boolean(state.workerReady)
        && state.entries.length >= workerThreshold
        && Boolean(state.worker)
        && Boolean(state.workerToken);
    }

    function post(message) {
      if (!state.worker || !state.workerToken) return false;
      try {
        state.worker.postMessage(message);
        return true;
      } catch {
        disable();
        return false;
      }
    }

    function init() {
      if (initialized) return Boolean(state.worker);
      initialized = true;

      if (isFileProtocol()) {
        state.lastEngine = "main · local file mode";
        return false;
      }

      const token = createSessionToken();
      if (!token) {
        state.lastEngine = "main · secure worker token unavailable";
        return false;
      }

      try {
        const worker = createWorkerInstance(token);
        if (!worker) return false;
        state.worker = worker;
        state.workerToken = token;
        worker.onmessage = onMessage;
        worker.onerror = () => disable("Background filter worker unavailable; using the main thread.");
        return true;
      } catch {
        state.worker = null;
        state.workerToken = "";
        return false;
      }
    }

    function validEnvelope(message) {
      return Boolean(
        message
        && typeof message === "object"
        && !Array.isArray(message)
        && message.protocol === PROTOCOL_VERSION
        && state.workerToken
        && message.token === state.workerToken
        && ALLOWED_INBOUND_TYPES.has(message.type)
      );
    }

    function onMessage(event) {
      const message = event?.data;
      if (!validEnvelope(message)) return false;

      if (message.type === "ready") {
        state.workerAvailable = true;
        if (state.entries.length) syncIndex();
        return true;
      }

      if (message.type === "indexed") {
        if (message.version !== state.workerVersion) return false;
        state.workerReady = true;
        const searchIndex = message.searchIndex && typeof message.searchIndex === "object" && !Array.isArray(message.searchIndex)
          ? message.searchIndex
          : {};
        state.searchIndex = Object.assign({
          enabled: false,
          tokens: 0,
          postings: 0,
          truncated: false,
          elapsedMs: 0,
          mode: "linear",
          candidateCount: state.entries.length
        }, searchIndex);
        updateDiagnostics();
        return true;
      }

      if (message.type === "filtered") {
        if (message.requestId !== state.filterRequestId || message.version !== state.workerVersion) return false;
        const elapsedMs = Number(message.elapsedMs) || 0;
        const candidateValue = Number(message.candidateCount);
        state.searchIndex.mode = message.searchMode || "linear";
        state.searchIndex.candidateCount = Number.isFinite(candidateValue) && candidateValue >= 0
          ? candidateValue
          : state.entries.length;
        state.searchIndex.reason = message.indexReason || "";
        const mode = message.searchMode === "disk-indexed"
          ? "disk-indexed"
          : message.searchMode === "indexed"
            ? "indexed"
            : "linear";
        state.lastEngine = `worker ${mode} · ${elapsedMs} ms`;
        recordPerformance("filter", elapsedMs, {
          engine: `worker-${message.searchMode || "linear"}`,
          entries: state.entries.length,
          candidates: state.searchIndex.candidateCount
        });
        applyFilteredIndexes(
          Array.isArray(message.indexes) ? message.indexes : [],
          Array.isArray(message.invalid) ? message.invalid : [],
          false
        );
        return true;
      }

      if (message.type === "correlated") {
        if (message.requestId !== state.correlationRequestId || message.version !== state.workerVersion) return false;
        const elapsedMs = Number(message.elapsedMs) || 0;
        state.correlatedIndexes = Array.isArray(message.indexes) ? message.indexes : [];
        state.correlationEngine = `worker · ${elapsedMs} ms`;
        recordPerformance("correlation", elapsedMs, { engine: "worker" });
        renderCorrelationsPane(getSelectedEntry());
        return true;
      }

      if (message.type === "trace-related") {
        if (message.requestId !== state.traceRequestId || message.version !== state.workerVersion) return false;
        const elapsedMs = Number(message.elapsedMs) || 0;
        state.traceIndexes = Array.isArray(message.indexes) ? message.indexes : [];
        state.traceEngine = `worker · ${elapsedMs} ms`;
        recordPerformance("trace", elapsedMs, { engine: "worker" });
        renderTracePane(getSelectedEntry());
        return true;
      }

      return false;
    }

    function disable(message = "") {
      if (state.worker) {
        try { state.worker.terminate(); } catch {}
      }
      state.worker = null;
      state.workerAvailable = false;
      state.workerReady = false;
      state.workerToken = "";
      resetSearchIndex();
      state.lastEngine = "main";
      if (message) toast(message);
    }

    function syncIndex() {
      if (!state.worker || !state.workerAvailable || !state.workerToken) return false;
      state.workerReady = false;
      state.searchIndex.mode = "building";
      state.searchIndex.candidateCount = state.entries.length;
      state.workerVersion += 1;
      return post({
        type: "index",
        protocol: 1,
        token: state.workerToken,
        version: state.workerVersion,
        entries: state.filterEntries
      });
    }

    function requestFilter({ requestId, request }) {
      if (!canUseWorker()) return false;
      return post({
        type: "filter",
        protocol: 1,
        token: state.workerToken,
        requestId,
        request
      });
    }

    function requestCorrelation({ requestId, correlations, limit = 200, origin }) {
      if (!canUseWorker()) return false;
      return post({
        type: "correlate",
        protocol: 1,
        token: state.workerToken,
        requestId,
        correlations,
        limit,
        origin
      });
    }

    function requestTrace({ requestId, correlations, limit = 1000, origin }) {
      if (!canUseWorker()) return false;
      return post({
        type: "trace",
        protocol: 1,
        token: state.workerToken,
        requestId,
        correlations,
        limit,
        origin
      });
    }

    function destroy() {
      disable();
      initialized = false;
    }

    return Object.freeze({
      VERSION,
      PROTOCOL_VERSION,
      init,
      destroy,
      disable,
      canUseWorker,
      syncIndex,
      requestFilter,
      requestCorrelation,
      requestTrace,
      onMessage
    });
  }

  root.SignalDockFilterWorkerController = Object.freeze({ VERSION, PROTOCOL_VERSION, create });
}(typeof self !== "undefined" ? self : window));
