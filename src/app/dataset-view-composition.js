(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      el,
      ownerDocument = root.document,
      ownerWindow = ownerDocument?.defaultView || root,
      modules = {},
      services = {},
      actions = {},
      getters = {}
    } = options;

    if (!state || !el || !ownerDocument || !ownerWindow) throw new Error("Dataset View composition requires state, elements and UI context.");

    const requiredModules = ["savedViews", "datasetFilter", "tableView", "datasetOverview", "viewOrchestrator"];
    for (const name of requiredModules) {
      if (typeof modules[name]?.create !== "function") throw new Error(`Dataset View composition requires modules.${name}.create().`);
    }

    const utils = services.utils;
    const engine = services.engine;
    const analysis = services.analysis || {};
    if (!utils || typeof utils.debounce !== "function" || typeof utils.shortSource !== "function") {
      throw new Error("Dataset View composition requires utility services.");
    }
    if (!engine || typeof engine.parseSmartQuery !== "function" || typeof engine.filterIndexes !== "function") {
      throw new Error("Dataset View composition requires query-engine services.");
    }

    const requiredActions = [
      "persistSavedViews",
      "requestSavedViewName",
      "createViewId",
      "syncLevelChips",
      "applyFilters",
      "toast",
      "ensurePageInRange",
      "renderDataViews",
      "scheduleViewAutosave",
      "updateStats",
      "renderSourceNavigation",
      "selectEntry",
      "getSources",
      "scheduleFrame",
      "now"
    ];
    for (const name of requiredActions) {
      if (typeof actions[name] !== "function") throw new Error(`Dataset View composition requires actions.${name}().`);
    }

    const instances = {
      savedViews: null,
      datasetFilter: null,
      tableView: null,
      datasetOverview: null,
      viewOrchestrator: null
    };

    function memo(name, factory) {
      if (!instances[name]) instances[name] = factory();
      return instances[name];
    }

    function recordPerformance(name, elapsed, meta) {
      services.getProfiler?.()?.record?.(name, elapsed, meta);
    }

    function createSavedViews() {
      return memo("savedViews", () => modules.savedViews.create({
        state,
        el,
        ownerDocument,
        persistSavedViews: actions.persistSavedViews,
        requestName: actions.requestSavedViewName,
        createViewId: actions.createViewId,
        getShortSource: (value) => utils.shortSource(value),
        syncLevelChips: actions.syncLevelChips,
        applyFilters: actions.applyFilters,
        toast: actions.toast
      }));
    }

    function createDatasetFilter() {
      return memo("datasetFilter", () => modules.datasetFilter.create({
        state,
        el,
        ownerDocument,
        debounce: (callback, wait) => utils.debounce(callback, wait),
        parseSmartQuery: (query) => engine.parseSmartQuery(query),
        filterIndexes: (entries, request) => engine.filterIndexes(entries, request),
        shouldUseWorkerFilter: () => getters.getFilterWorker?.()?.canUseWorker?.() || false,
        requestWorkerFilter: (payload) => getters.getFilterWorker?.()?.requestFilter?.(payload) ?? false,
        now: actions.now,
        recordPerformance: (elapsed, meta) => recordPerformance("filter", elapsed, meta),
        getExceptionFingerprint: (entry) => analysis.exceptionGroups?.candidate?.(entry) ? analysis.exceptionGroups.fingerprint(entry) : "",
        refreshDerivedAnalysis: () => {
          state.serviceGraph = null;
          state.exceptionGroups = analysis.exceptionGroups?.group?.(state.entries, { maxGroups: 1500 }) || [];
          state.exceptionTrends = analysis.exceptionTrends?.analyze?.(state.entries, { bucketCount: 20 }) || null;
          state.healthData = analysis.serviceHealth?.analyze?.(state.entries) || null;
          state.serviceMatrixData = analysis.serviceMatrix?.build?.(state.entries) || null;
          state.serviceHeatmapData = analysis.serviceHeatmap?.build?.(state.entries, null, { bucketCount: 12 }) || null;
          state.serviceTrendsData = analysis.serviceTrends?.compare?.(state.entries) || null;
          state.traceExplorerData = analysis.traceExplorer?.buildWindow?.(state.entries, null, { limit: 1000 })
            || analysis.traceExplorer?.build?.(state.entries)
            || null;
          state.traceOutlierData = analysis.traceOutliers?.rank?.(state.entries, { limit: 250 }) || null;
          getters.getTraceExplorerController?.()?.reconcileSelection?.(state.traceExplorerData);
        },
        syncLevelChips: actions.syncLevelChips,
        ensurePageInRange: actions.ensurePageInRange,
        renderDataViews: actions.renderDataViews,
        scheduleViewAutosave: actions.scheduleViewAutosave,
        updateStats: actions.updateStats,
        renderSourceNavigation: actions.renderSourceNavigation,
        getShortSource: (source) => utils.shortSource(source)
      }));
    }

    function createTableView() {
      return memo("tableView", () => modules.tableView.create({
        state,
        el,
        ownerDocument,
        ownerWindow,
        debounce: (callback, wait) => utils.debounce(callback, wait),
        scheduleFrame: actions.scheduleFrame,
        now: actions.now,
        calculateVirtualViewport: (viewportOptions) => analysis.virtualViewport?.calculate?.(viewportOptions) || null,
        formatTime: (value) => utils.formatTime(value),
        shortSource: (value) => utils.shortSource(value),
        recordPerformance: (elapsed, meta) => recordPerformance("table-render", elapsed, meta),
        scheduleViewAutosave: actions.scheduleViewAutosave,
        selectEntry: actions.selectEntry
      }));
    }

    function createDatasetOverview() {
      return memo("datasetOverview", () => modules.datasetOverview.create({
        state,
        el,
        ownerDocument,
        getSources: actions.getSources,
        formatBytes: (value) => utils.formatBytes(value),
        shortSource: (value) => utils.shortSource(value),
        formatTimelineTime: (ms) => {
          const date = new Date(ms);
          return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        }
      }));
    }

    function createViewOrchestrator() {
      return memo("viewOrchestrator", () => modules.viewOrchestrator.create({
        state,
        ownerDocument,
        rebuildFilterIndex: () => instances.datasetFilter?.rebuildFilterIndex(),
        updateStats: () => instances.datasetOverview?.updateStats(),
        refreshFilters: () => instances.datasetFilter?.refreshFilters(),
        renderSavedViews: () => instances.savedViews?.render(),
        setControlsEnabled: (enabled) => instances.datasetFilter?.setControlsEnabled(enabled),
        applyFilters: (resetPage) => instances.datasetFilter?.applyFilters(resetPage),
        renderTimeline: () => instances.datasetOverview?.renderTimeline(),
        renderTable: () => instances.tableView?.renderTable(),
        renderInspector: () => getters.getInspectorController?.()?.render?.(),
        updateActiveSourceUI: () => instances.datasetOverview?.updateActiveSourceUI()
      }));
    }

    return Object.freeze({
      VERSION,
      createSavedViews,
      createDatasetFilter,
      createTableView,
      createDatasetOverview,
      createViewOrchestrator
    });
  }

  root.SignalDockDatasetViewComposition = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
