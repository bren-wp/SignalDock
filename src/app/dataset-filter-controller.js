(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      el,
      ownerDocument = el?.queryInput?.ownerDocument || root.document,
      debounce,
      parseSmartQuery,
      filterIndexes,
      shouldUseWorkerFilter,
      requestWorkerFilter,
      now,
      recordPerformance,
      getExceptionFingerprint,
      refreshDerivedAnalysis,
      syncLevelChips,
      ensurePageInRange,
      renderDataViews,
      scheduleViewAutosave,
      updateStats,
      renderSourceNavigation,
      getShortSource
    } = options;

    if (!state || !el || !ownerDocument) throw new Error("Dataset Filter controller requires state, elements and document.");
    const required = {
      debounce,
      parseSmartQuery,
      filterIndexes,
      shouldUseWorkerFilter,
      requestWorkerFilter,
      now,
      recordPerformance,
      getExceptionFingerprint,
      refreshDerivedAnalysis,
      syncLevelChips,
      ensurePageInRange,
      renderDataViews,
      scheduleViewAutosave,
      updateStats,
      renderSourceNavigation,
      getShortSource
    };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== "function") throw new Error(`Dataset Filter controller requires ${name}().`);
    }

    const listeners = [];
    let bound = false;

    function listen(target, type, handler) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }

    function makeOption(label, value = label) {
      const option = ownerDocument.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }

    function rebuildFilterIndex() {
      let latest = null;
      let errors = 0;
      let warnings = 0;
      const sourceCounts = new Map();
      const serviceCounts = new Map();

      state.filterEntries = state.entries.map((entry) => {
        const timestampMs = Number.isFinite(entry.timestampMs)
          ? entry.timestampMs
          : (() => {
              const parsed = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
              return Number.isNaN(parsed) ? null : parsed;
            })();

        if (timestampMs !== null && (latest === null || timestampMs > latest)) latest = timestampMs;
        if (entry.level === "ERROR" || entry.level === "FATAL") errors += 1;
        else if (entry.level === "WARN") warnings += 1;

        sourceCounts.set(entry.source, (sourceCounts.get(entry.source) || 0) + 1);
        if (entry.service && entry.service !== "—") {
          serviceCounts.set(entry.service, (serviceCounts.get(entry.service) || 0) + 1);
        }

        const exceptionFingerprint = getExceptionFingerprint(entry) || "";
        entry.exceptionFingerprint = exceptionFingerprint;
        return {
          level: entry.level,
          source: entry.source,
          service: entry.service,
          message: entry.message,
          timestamp: entry.timestamp,
          timestampMs,
          searchText: entry.searchText,
          correlations: entry.correlations || {},
          dimensions: entry.dimensions || {},
          exceptionFingerprint
        };
      });

      state.latestTimestampMs = latest;
      state.summary = {
        total: state.entries.length,
        errors,
        warnings,
        sources: Array.from(sourceCounts.keys()).sort((a, b) => a.localeCompare(b)),
        sourceCounts,
        services: Array.from(serviceCounts.keys()).sort((a, b) => a.localeCompare(b)),
        serviceCounts
      };

      refreshDerivedAnalysis();
      return state.filterEntries;
    }

    function currentFilterRequest() {
      const query = el.queryInput?.value.trim() || "";
      return {
        query,
        parsed: parseSmartQuery(query),
        level: el.levelFilter?.value || "",
        source: el.sourceFilter?.value || "",
        timeRange: el.timeFilter?.value || "",
        sortMode: el.sortFilter?.value || "original",
        showUnknown: state.settings?.showUnknown !== false,
        referenceTime: state.latestTimestampMs || 0
      };
    }

    function applyFilters(resetPage) {
      const request = currentFilterRequest();
      state.filterRequestId += 1;
      const requestId = state.filterRequestId;

      if (shouldUseWorkerFilter()) {
        const dispatched = requestWorkerFilter({ requestId, request });
        if (dispatched !== false) {
          state.lastEngine = "worker";
          if (el.resultsSummary) el.resultsSummary.textContent = "Filtering in background…";
          ownerDocument.body?.classList?.add("filtering-active");
          if (resetPage) state.page = 1;
          return { engine: "worker", requestId };
        }
      }

      const started = now();
      const result = filterIndexes(state.filterEntries, request);
      const elapsed = Math.round((now() - started) * 10) / 10;
      state.lastEngine = `main · ${elapsed} ms`;
      recordPerformance(elapsed, { engine: "main", entries: state.entries.length });
      applyFilteredIndexes(result?.indexes, result?.parsed?.invalid, resetPage);
      return { engine: "main", requestId, elapsed };
    }

    function applyFilteredIndexes(indexes, invalidTokens, resetPage) {
      state.filteredIndexes = Array.isArray(indexes) ? indexes : [];
      if (resetPage) {
        state.page = 1;
        if (state.renderMode === "virtual" && el.logTable) el.logTable.scrollTop = 0;
      }
      ensurePageInRange();
      ownerDocument.body?.classList?.remove("filtering-active");
      updateQueryValidity(invalidTokens);
      renderDataViews();
      scheduleViewAutosave();
    }

    function updateQueryValidity(invalidTokens) {
      const invalid = Array.isArray(invalidTokens) ? invalidTokens : [];
      el.queryInput?.classList?.toggle("has-query-error", invalid.length > 0);
      if (el.queryInput) {
        el.queryInput.title = invalid.length
          ? `Could not parse: ${invalid.join(", ")}`
          : "Smart query: level:error source:api env:prod namespace:payments trace:abc any:timeout,retry re:/ETIMEDOUT|ECONNRESET/i";
      }
    }

    function resetFilters() {
      if (el.queryInput) el.queryInput.value = "";
      if (el.levelFilter) el.levelFilter.value = "";
      if (el.sourceFilter) el.sourceFilter.value = "";
      if (el.timeFilter) el.timeFilter.value = "";
      if (el.sortFilter) el.sortFilter.value = "original";
      syncLevelChips("");
      applyFilters(true);
    }

    function setControlsEnabled(enabled) {
      [
        el.queryInput,
        el.levelFilter,
        el.sourceFilter,
        el.timeFilter,
        el.sortFilter,
        el.saveViewButton,
        el.resetButton,
        el.exportButton,
        el.workspaceSaveButton,
        el.clearAllButton,
        el.pageSize,
        el.renderMode
      ].forEach((control) => {
        if (control) control.disabled = !enabled;
      });
    }

    function getSources() {
      return state.summary?.sources || [];
    }

    function refreshFilters() {
      if (!el.sourceFilter) return;
      const current = el.sourceFilter.value;
      const sources = getSources();
      el.sourceFilter.replaceChildren(
        makeOption("All sources", ""),
        ...sources.map((source) => makeOption(getShortSource(source), source))
      );
      if (sources.includes(current)) el.sourceFilter.value = current;
      updateStats();
      renderSourceNavigation();
    }

    function applySource(source) {
      if (!el.sourceFilter || el.sourceFilter.disabled) return;
      el.sourceFilter.value = source || "";
      applyFilters(true);
    }

    function bind() {
      if (bound) return;
      bound = true;

      const debouncedFilter = debounce(() => applyFilters(true), 80);
      listen(el.queryInput, "input", debouncedFilter);
      listen(el.levelFilter, "change", () => {
        syncLevelChips(el.levelFilter.value);
        applyFilters(true);
      });
      listen(el.sourceFilter, "change", () => applyFilters(true));
      listen(el.timeFilter, "change", () => applyFilters(true));
      listen(el.sortFilter, "change", () => applyFilters(true));
      listen(el.levelChips, "click", (event) => {
        const button = event.target?.closest?.("[data-level]");
        if (!button || el.levelFilter?.disabled) return;
        el.levelFilter.value = button.dataset.level;
        syncLevelChips(button.dataset.level);
        applyFilters(true);
      });
      listen(el.resetButton, "click", resetFilters);
      listen(el.fileTabs, "click", (event) => {
        const tab = event.target?.closest?.("[data-source]");
        if (tab) applySource(tab.dataset.source);
      });
      listen(el.sourceList, "click", (event) => {
        const button = event.target?.closest?.("[data-source]");
        if (button) applySource(button.dataset.source);
      });
    }

    function destroy() {
      while (listeners.length) {
        const [target, type, handler] = listeners.pop();
        target.removeEventListener(type, handler);
      }
      bound = false;
    }

    return Object.freeze({
      VERSION,
      bind,
      destroy,
      rebuildFilterIndex,
      currentFilterRequest,
      applyFilters,
      applyFilteredIndexes,
      updateQueryValidity,
      resetFilters,
      setControlsEnabled,
      refreshFilters,
      getSources
    });
  }

  root.SignalDockDatasetFilterController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
