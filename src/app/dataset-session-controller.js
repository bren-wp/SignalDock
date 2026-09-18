(function (root) {
  "use strict";
  const VERSION = 1;

  function create(options = {}) {
    const {
      state, el, ownerDocument = el?.exportButton?.ownerDocument || root.document,
      todayStamp, downloadJson, downloadParts, confirmClear, stopLiveTail,
      createEmptyInvestigation, createEmptyCase, syncLevelChips, syncWorkerIndex,
      renderEverything, clearRecoverySnapshot, hideRecoveryBanner, toast
    } = options;
    if (!state || !el || !ownerDocument) throw new Error("Dataset Session controller requires state, elements and document.");
    const required = { todayStamp, downloadJson, downloadParts, confirmClear, stopLiveTail, createEmptyInvestigation, createEmptyCase, syncLevelChips, syncWorkerIndex, renderEverything, clearRecoverySnapshot, hideRecoveryBanner, toast };
    for (const [name, value] of Object.entries(required)) if (typeof value !== "function") throw new Error(`Dataset Session controller requires ${name}().`);

    const listeners = [];
    let bound = false;
    function listen(target, type, handler) { if (!target?.addEventListener) return; target.addEventListener(type, handler); listeners.push([target,type,handler]); }

    function normalizeExportEntry(entry) {
      return {
        timestamp: entry.timestamp,
        level: entry.level,
        service: entry.service,
        source: entry.source,
        message: entry.message,
        correlations: entry.correlations || {},
        traceMeta: entry.traceMeta || {},
        dimensions: entry.dimensions || {},
        raw: entry.raw
      };
    }

    function exportFiltered() {
      if (!state.filteredIndexes.length) return { mode: "empty", count: 0 };
      const day = todayStamp();
      if (state.filteredIndexes.length > 50000) {
        const parts = [];
        const chunkSize = 2000;
        let exportedCount = 0;
        for (let offset = 0; offset < state.filteredIndexes.length; offset += chunkSize) {
          const lines = [];
          const end = Math.min(offset + chunkSize, state.filteredIndexes.length);
          for (let i = offset; i < end; i += 1) {
            const entry = state.entries[state.filteredIndexes[i]];
            if (!entry) continue;
            lines.push(JSON.stringify(normalizeExportEntry(entry)));
            exportedCount += 1;
          }
          if (lines.length) parts.push(lines.join("\n") + "\n");
        }
        downloadParts(`signaldock-export-${day}.ndjson`, parts, "application/x-ndjson;charset=utf-8");
        toast(`Exported ${exportedCount.toLocaleString()} entries as NDJSON for lower memory overhead.`);
        return { mode: "ndjson", count: exportedCount, parts: parts.length };
      }
      const payload = [];
      for (const index of state.filteredIndexes) {
        const entry = state.entries[index];
        if (entry) payload.push(normalizeExportEntry(entry));
      }
      downloadJson(`signaldock-export-${day}.json`, payload);
      toast(`Exported ${payload.length.toLocaleString()} entries.`);
      return { mode: "json", count: payload.length };
    }

    function resetFiltersWithoutRender() {
      if (el.queryInput) el.queryInput.value = "";
      if (el.levelFilter) el.levelFilter.value = "";
      if (el.sourceFilter) el.sourceFilter.value = "";
      if (el.timeFilter) el.timeFilter.value = "";
      if (el.sortFilter) el.sortFilter.value = "original";
      syncLevelChips("");
    }

    function resetDerivedState() {
      state.serviceGraph = null;
      state.exceptionGroups = [];
      state.exceptionTrends = null;
      state.healthData = null;
      state.exceptionViewFingerprint = "";
      state.serviceMatrixData = null;
      state.serviceHeatmapData = null;
      state.serviceTrendsData = null;
      state.traceExplorerData = null;
      state.traceOutlierData = null;
      state.searchIndex = {
        enabled: false, tokens: 0, postings: 0, truncated: false, elapsedMs: 0,
        mode: "linear", candidateCount: 0, cacheHit: false, cacheEligible: false, cacheSegments: 0
      };
    }

    function clearAll() {
      if (!state.entries.length) return { cleared: false, reason: "empty" };
      if (!confirmClear()) return { cleared: false, reason: "cancelled" };

      stopLiveTail();
      state.filterRequestId += 1;
      state.correlationRequestId += 1;
      state.traceRequestId += 1;
      state.entries = [];
      state.filterEntries = [];
      state.filteredIndexes = [];
      state.loadedBytes = 0;
      state.inputFileCount = 0;
      state.latestTimestampMs = null;
      state.summary = { total: 0, errors: 0, warnings: 0, sources: [], sourceCounts: new Map(), services: [], serviceCounts: new Map() };
      state.page = 1;
      state.selectedId = null;
      state.correlatedIndexes = [];
      state.traceIndexes = [];
      state.correlationEngine = "idle";
      state.traceEngine = "idle";
      state.investigation = createEmptyInvestigation();
      state.caseFile = createEmptyCase();
      state.caseCheckpoints = [];
      resetDerivedState();
      resetFiltersWithoutRender();
      syncWorkerIndex();
      renderEverything();
      hideRecoveryBanner();
      Promise.resolve(clearRecoverySnapshot()).catch(() => {});
      toast("All loaded logs cleared.");
      return { cleared: true };
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(el.exportButton, "click", exportFiltered);
      listen(el.clearAllButton, "click", clearAll);
    }

    function destroy() {
      while (listeners.length) {
        const [target,type,handler] = listeners.pop();
        target.removeEventListener(type,handler);
      }
      bound = false;
    }

    return Object.freeze({ VERSION, bind, destroy, exportFiltered, clearAll, resetFiltersWithoutRender });
  }

  root.SignalDockDatasetSessionController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
