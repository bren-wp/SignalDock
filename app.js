(function () {
  "use strict";

  const STORAGE_VIEWS = "signaldock-saved-views-v3";
  const STORAGE_SETTINGS = "signaldock-settings-v10";
  const APP_VERSION = "2.8.32";
  const WORKER_THRESHOLD = 25000;

  const state = {
    entries: [],
    filterEntries: [],
    filteredIndexes: [],
    loadedBytes: 0,
    inputFileCount: 0,
    latestTimestampMs: null,
    summary: { total: 0, errors: 0, warnings: 0, sources: [], sourceCounts: new Map() },
    page: 1,
    pageSize: 100,
    renderMode: "paged",
    virtual: { start: 0, end: 0, overscan: 10, rowHeight: 47, pitch: 47, compressed: false, lastScrollTop: 0, lastScrollAt: 0, raf: 0 },
    selectedId: null,
    inspectorTab: "details",
    savedViews: [],
    settings: { wrap: false, compact: false, showUnknown: true, useWorker: true, autosave: true, parserProfile: "auto", customParserPattern: "", customParserFlags: "i" },
    worker: null,
    workerAvailable: false,
    workerReady: false,
    workerVersion: 0,
    workerToken: "",
    filterRequestId: 0,
    correlationRequestId: 0,
    correlatedIndexes: [],
    correlationEngine: "idle",
    traceRequestId: 0,
    traceIndexes: [],
    traceEngine: "idle",
    renderGeneration: 0,
    tail: { active: false, handle: null, offset: 0, timer: null, carry: "", source: "" },
    lastEngine: "main",
    recovery: { available: false, saving: false, datasetDirty: false, dismissed: false },
    serviceGraph: null,
    serviceMapGroupBy: "service",
    commandPaletteIndex: 0,
    investigation: null,
    caseFile: null,
    exceptionGroups: [],
    exceptionTrends: null,
    exceptionViewFingerprint: "",
    healthData: null,
    healthScopeFiltered: true,
    serviceMatrixData: null,
    serviceMatrixScopeFiltered: true,
    serviceHeatmapData: null,
    serviceHeatmapScopeFiltered: true,
    serviceTrendsData: null,
    serviceTrendsScopeFiltered: true,
    serviceTrendsSplit: 0.5,
    traceExplorerData: null,
    traceExplorerScopeFiltered: true,
    traceCompareSelection: [],
    traceOutlierData: null,
    traceOutlierScopeFiltered: true,
    queryLibrary: [],
    queryLibrarySearch: "",
    queryLibraryFolderFilter: "*",
    queryLibrarySelection: [],
    caseTimelineFilter: "all",
    baselineSnapshot: null,
    baselineComparison: null,
    baselineHistory: [],
    baselineHistorySelection: { baseId: "", currentId: "" },
    caseCheckpoints: [],
    projects: [],
    activeProjectId: "",
    searchIndex: { enabled: false, tokens: 0, postings: 0, truncated: false, elapsedMs: 0, mode: "linear", candidateCount: 0, cacheHit: false, cacheEligible: false, cacheSegments: 0 }
  };

  let recoveryDiagnosticsController = null;
  let savedViewsController = null;
  let importLiveTailController = null;
  let datasetFilterController = null;
  let tableViewController = null;
  let workspaceController = null;
  let datasetOverviewController = null;
  let filterWorkerController = null;
  let relatedContextController = null;
  let datasetSessionController = null;
  let queryNavigationController = null;
  let queryLibraryController = null;
  let baselineController = null;
  let projectController = null;
  let investigationController = null;
  let exceptionController = null;
  let traceExplorerController = null;
  let traceOutlierController = null;
  let serviceMapController = null;
  let serviceMatrixController = null;
  let serviceHeatmapController = null;
  let serviceTrendsController = null;
  let healthController = null;
  let inspectorController = null;
  let settingsController = null;
  let commandNavigationController = null;
  let interactionShellController = null;
  let viewOrchestratorController = null;
  let startupStateController = null;
  let caseWorkspaceController = null;
  let caseFileController = null;
  let caseCheckpointController = null;

  const el = {};
  const utils = () => window.SignalDockUtils;
  const engine = () => window.SignalDockQueryEngine;
  const profiler = () => window.SignalDockPerformance;
  const traceAnalyzer = () => window.SignalDockTraceAnalysis;
  const parserProfiles = () => window.SignalDockParserProfiles;
  const paletteEngine = () => window.SignalDockCommandPalette;

  function setActiveNav(target) { commandNavigationController?.setActiveNav(target); }

  function activateNavView(target) { commandNavigationController?.navigate(target); }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!window.SignalDockElementRegistry?.create) throw new Error("SignalDock Element Registry is unavailable.");
    Object.assign(el, window.SignalDockElementRegistry.create(document));
    if (!window.SignalDockStartupStateController?.create) throw new Error("SignalDock Startup State controller is unavailable.");
    startupStateController = window.SignalDockStartupStateController.create({
      state,
      loadJson: (key, fallback) => utils().loadJson(key, fallback),
      savedViewKeys: [STORAGE_VIEWS, "signaldock-saved-views-v2", "signaldock-saved-views-v1"],
      settingsKeys: ["signaldock-settings-v1", "signaldock-settings-v2", "signaldock-settings-v3", "signaldock-settings-v5", "signaldock-settings-v6", "signaldock-settings-v8", STORAGE_SETTINGS],
      activeProjectKey: "signaldock-active-project-v1",
      createInvestigation: () => window.SignalDockInvestigation?.empty?.(),
      createCase: (title) => window.SignalDockCaseWorkspace?.empty?.(title),
      loadQueryLibrary: () => window.SignalDockQueryLibrary?.load?.(),
      loadBaselineHistory: () => window.SignalDockBaselineManager?.loadHistory?.(),
      loadProjects: () => window.SignalDockProjectManager?.load?.(),
      normalizeCheckpoints: (items) => window.SignalDockCaseCheckpoints?.normalizeList?.(items)
    });
    startupStateController.hydratePreferences();
    if (!window.SignalDockSavedViewsController?.create) throw new Error("SignalDock Saved Views controller is unavailable.");
    savedViewsController = window.SignalDockSavedViewsController.create({
      state,
      el,
      persistSavedViews: (views) => utils().saveJson(STORAGE_VIEWS, views),
      requestName: (message, suggested) => window.prompt(message, suggested),
      createViewId: () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      getShortSource: (value) => utils().shortSource(value),
      syncLevelChips,
      applyFilters,
      toast
    });
    savedViewsController.bind();
    if (!window.SignalDockImportLiveTailController?.create) throw new Error("SignalDock Import/Live Tail controller is unavailable.");
    importLiveTailController = window.SignalDockImportLiveTailController.create({
      state,
      el,
      parseFile: (file, onProgress) => window.SignalDockParser.parseFile(file, onProgress, { profile: state.settings.parserProfile || "auto", customProfile: currentCustomParserProfile() }),
      parseText: (text, source) => window.SignalDockParser.parseText(text, source, state.settings.parserProfile || "auto", currentCustomParserProfile()),
      restoreWorkspaceFile: (file) => restoreWorkspace(file),
      startParseProfile: (file) => profiler()?.start?.("parse", { file: file.name, bytes: file.size }) || null,
      touchProjectDatasets: (projectFiles) => {
        if (!state.activeProjectId || !window.SignalDockProjectManager?.touchDataset) return;
        for (const fileMeta of projectFiles) state.projects = window.SignalDockProjectManager.touchDataset(state.projects, state.activeProjectId, fileMeta);
        projectController?.render();
      },
      setProcessing,
      nextFrame,
      toast,
      rebuildFilterIndex,
      refreshFilters,
      setControlsEnabled,
      syncWorkerIndex,
      applyFilters,
      markDatasetForAutosave,
      renderEverything,
      canUseLiveTail: () => typeof window.showOpenFilePicker === "function",
      pickLiveTailFile: async () => {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: "Log files", accept: { "text/plain": [".log", ".txt", ".jsonl", ".ndjson"] } }]
        });
        const file = await handle.getFile();
        return { handle, file };
      },
      readLiveTailDelta: async (handle, offset) => {
        const file = await handle.getFile();
        const truncated = file.size < offset;
        const start = truncated ? 0 : offset;
        const text = file.size > start ? await file.slice(start, file.size).text() : "";
        return { name: file.name, size: file.size, start, text, truncated };
      }
    });
    importLiveTailController.bind();
    if (!window.SignalDockDatasetFilterController?.create) throw new Error("SignalDock Dataset Filter controller is unavailable.");
    datasetFilterController = window.SignalDockDatasetFilterController.create({
      state,
      el,
      debounce: (callback, wait) => utils().debounce(callback, wait),
      parseSmartQuery: (query) => engine().parseSmartQuery(query),
      filterIndexes: (entries, request) => engine().filterIndexes(entries, request),
      shouldUseWorkerFilter: () => filterWorkerController?.canUseWorker() || false,
      requestWorkerFilter: ({ requestId, request }) => filterWorkerController?.requestFilter({ requestId, request }) ?? false,
      now: () => performance.now(),
      recordPerformance: (elapsed, meta) => profiler()?.record?.("filter", elapsed, meta),
      getExceptionFingerprint: (entry) => window.SignalDockExceptionGroups?.candidate?.(entry) ? window.SignalDockExceptionGroups.fingerprint(entry) : "",
      refreshDerivedAnalysis: () => {
        state.serviceGraph = null;
        state.exceptionGroups = window.SignalDockExceptionGroups?.group?.(state.entries, { maxGroups: 1500 }) || [];
        state.exceptionTrends = window.SignalDockExceptionTrends?.analyze?.(state.entries, { bucketCount: 20 }) || null;
        state.healthData = window.SignalDockServiceHealth?.analyze?.(state.entries) || null;
        state.serviceMatrixData = window.SignalDockServiceMatrix?.build?.(state.entries) || null;
        state.serviceHeatmapData = window.SignalDockServiceHeatmap?.build?.(state.entries, null, { bucketCount: 12 }) || null;
        state.serviceTrendsData = window.SignalDockServiceTrends?.compare?.(state.entries) || null;
        state.traceExplorerData = window.SignalDockTraceExplorer?.buildWindow?.(state.entries, null, { limit: 1000 }) || window.SignalDockTraceExplorer?.build?.(state.entries) || null;
        state.traceOutlierData = window.SignalDockTraceOutliers?.rank?.(state.entries, { limit: 250 }) || null;
        traceExplorerController?.reconcileSelection(state.traceExplorerData);
      },
      syncLevelChips,
      ensurePageInRange,
      renderDataViews,
      scheduleViewAutosave: () => scheduleViewAutosave(),
      updateStats,
      renderSourceNavigation,
      getShortSource: (source) => utils().shortSource(source)
    });
    datasetFilterController.bind();
    if (!window.SignalDockTableViewController?.create) throw new Error("SignalDock Table View controller is unavailable.");
    tableViewController = window.SignalDockTableViewController.create({
      state,
      el,
      ownerDocument: document,
      ownerWindow: window,
      debounce: (callback, wait) => utils().debounce(callback, wait),
      scheduleFrame: (callback) => requestAnimationFrame(callback),
      now: () => performance.now(),
      calculateVirtualViewport: (options) => window.SignalDockVirtualViewport?.calculate?.(options) || null,
      formatTime: (value) => utils().formatTime(value),
      shortSource: (value) => utils().shortSource(value),
      recordPerformance: (elapsed, meta) => profiler()?.record?.("table-render", elapsed, meta),
      scheduleViewAutosave: () => scheduleViewAutosave(),
      selectEntry
    });
    tableViewController.bind();
    if (!window.SignalDockWorkspaceController?.create) throw new Error("SignalDock Workspace controller is unavailable.");
    workspaceController = window.SignalDockWorkspaceController.create({
      state,
      el,
      appVersion: APP_VERSION,
      ownerDocument: document,
      prepareWorkspaceArchive: (entries, workspace, version) => {
        const parts = window.SignalDockWorkspace.serializeParts(entries, workspace, version);
        const size = parts.reduce((sum, part) => sum + new Blob([part]).size, 0);
        return { parts, size };
      },
      persistWorkspaceArchive: async ({ filename, parts, size }) => {
        let saved = null;
        if (window.SignalDockDesktopBridge?.saveParts) {
          saved = await window.SignalDockDesktopBridge.saveParts({
            name: filename,
            mime: "application/json;charset=utf-8",
            parts,
            persistHandle: Boolean(state.activeProjectId),
            projectId: state.activeProjectId,
            id: filename,
            note: "SignalDock project workspace"
          });
        } else {
          utils().downloadParts(filename, parts, "application/json;charset=utf-8");
          saved = { mode: "download", name: filename, handleRef: "" };
        }
        if (saved?.mode !== "cancelled" && state.activeProjectId && window.SignalDockProjectManager) {
          if (window.SignalDockProjectManager.touchWorkspace) {
            state.projects = window.SignalDockProjectManager.touchWorkspace(state.projects, state.activeProjectId, {
              id: filename,
              name: saved?.name || filename,
              size,
              handleRef: saved?.handleRef || "",
              handleKind: saved?.handleRef ? "file" : ""
            });
          }
          if (state.baselineSnapshot && window.SignalDockProjectManager.attachBaseline) {
            state.projects = window.SignalDockProjectManager.attachBaseline(state.projects, state.activeProjectId, {
              id: state.baselineSnapshot.id,
              name: state.baselineSnapshot.name,
              capturedAt: state.baselineSnapshot.capturedAt
            });
          }
          if (state.caseFile && window.SignalDockProjectManager.attachCase) {
            state.projects = window.SignalDockProjectManager.attachCase(state.projects, state.activeProjectId, {
              id: state.caseFile.id || "active-case",
              title: state.caseFile.title || state.investigation?.title || "Investigation",
              status: state.caseFile.status || "open",
              updatedAt: state.caseFile.updatedAt || new Date().toISOString()
            });
          }
          projectController?.render();
        }
        return { mode: saved?.mode || "saved", name: saved?.name || filename, reopenLinked: Boolean(saved?.handleRef) };
      },
      readAndParseWorkspace: async (file) => window.SignalDockWorkspace.parse(await file.text()),
      normalizeWorkspaceSnapshot: (snapshot) => ({
        ...snapshot,
        investigation: window.SignalDockInvestigation?.normalize?.(snapshot.investigation) || snapshot.investigation,
        caseFile: window.SignalDockCaseWorkspace?.normalize?.(snapshot.caseFile) || snapshot.caseFile,
        caseCheckpoints: window.SignalDockCaseCheckpoints?.normalizeList?.(snapshot.caseCheckpoints) || snapshot.caseCheckpoints
      }),
      normalizeWorkspaceDomain: (workspace) => {
        const investigationSource = workspace?.investigation || window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] };
        const investigation = window.SignalDockInvestigation?.normalize?.(investigationSource) || investigationSource;
        const caseSource = workspace?.caseFile || window.SignalDockCaseWorkspace?.empty?.(investigation?.title || "Investigation") || { title: investigation?.title || "Investigation", status: "open", severity: "none", findings: [] };
        const caseFile = window.SignalDockCaseWorkspace?.normalize?.(caseSource) || caseSource;
        const caseCheckpoints = window.SignalDockCaseCheckpoints?.normalizeList?.(workspace?.caseCheckpoints || []) || [];
        let baselineSnapshot = state.baselineSnapshot;
        try { baselineSnapshot = workspace?.baselineSnapshot ? window.SignalDockBaselineManager?.normalize?.(workspace.baselineSnapshot) : state.baselineSnapshot; }
        catch { baselineSnapshot = null; }
        return {
          investigation,
          caseFile,
          caseCheckpoints,
          baselineSnapshot,
          activeProjectId: String(workspace?.activeProjectId || state.activeProjectId || "")
        };
      },
      persistActiveProjectId: (projectId) => utils().saveJson("signaldock-active-project-v1", projectId),
      isServiceMapGroupMode: (mode) => Boolean(window.SignalDockServiceMap?.GROUP_MODES?.includes(mode)),
      getSelectedEntry: selectedEntry,
      stopLiveTail,
      appendParsedEntries,
      applySettings,
      rebuildFilterIndex,
      refreshFilters,
      setControlsEnabled,
      syncWorkerIndex,
      syncLevelChips,
      applyFilters,
      selectEntry,
      markDatasetForAutosave,
      setProcessing,
      toast,
      nowIso: () => new Date().toISOString()
    });
    workspaceController.bind();
    if (!window.SignalDockDatasetOverviewController?.create) throw new Error("SignalDock Dataset Overview controller is unavailable.");
    datasetOverviewController = window.SignalDockDatasetOverviewController.create({
      state,
      el,
      ownerDocument: document,
      getSources,
      formatBytes: (value) => utils().formatBytes(value),
      shortSource: (value) => utils().shortSource(value),
      formatTimelineTime: (ms) => {
        const date = new Date(ms);
        return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      }
    });
    datasetOverviewController.bind();
    if (!window.SignalDockFilterWorkerController?.create) throw new Error("SignalDock Filter Worker controller is unavailable.");
    filterWorkerController = window.SignalDockFilterWorkerController.create({
      state, workerThreshold: WORKER_THRESHOLD,
      isFileProtocol: () => window.location?.protocol === "file:",
      createSessionToken: () => {
        const cryptoApi = window.crypto;
        if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID().replace(/-/g, "");
        if (typeof cryptoApi?.getRandomValues === "function") { const bytes = new Uint8Array(24); cryptoApi.getRandomValues(bytes); return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""); }
        return "";
      },
      createWorkerInstance: (token) => typeof Worker === "function" ? new Worker("filter-worker.js?sd_session=" + encodeURIComponent(token)) : null,
      applyFilteredIndexes, renderCorrelationsPane, renderTracePane, getSelectedEntry: selectedEntry, updateDiagnostics,
      recordPerformance: (name, elapsed, meta) => profiler()?.record?.(name, elapsed, meta),
      toast
    });
    if (!window.SignalDockRelatedContextController?.create) throw new Error("SignalDock Related Context controller is unavailable.");
    relatedContextController = window.SignalDockRelatedContextController.create({
      state,
      relatedIndexes: (entries, correlations, limit, origin) => engine().relatedIndexes(entries, correlations, limit, origin),
      canUseWorker: () => filterWorkerController?.canUseWorker() || false,
      requestCorrelation: (payload) => filterWorkerController?.requestCorrelation(payload) ?? false,
      requestTrace: (payload) => filterWorkerController?.requestTrace(payload) ?? false,
      renderCorrelations: (entry) => inspectorController?.renderCorrelations(entry),
      renderTrace: (entry) => inspectorController?.renderTrace(entry),
      now: () => performance.now(),
      recordPerformance: (name, elapsed, meta) => profiler()?.record?.(name, elapsed, meta)
    });
    if (!window.SignalDockDatasetSessionController?.create) throw new Error("SignalDock Dataset Session controller is unavailable.");
    datasetSessionController = window.SignalDockDatasetSessionController.create({
      state, el, ownerDocument: document,
      todayStamp: () => new Date().toISOString().slice(0, 10),
      downloadJson: (name, payload) => utils().downloadJson(name, payload),
      downloadParts: (name, parts, mime) => utils().downloadParts(name, parts, mime),
      confirmClear: () => window.confirm("Clear all loaded logs from this SignalDock session?"),
      stopLiveTail,
      createEmptyInvestigation: () => window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] },
      createEmptyCase: () => window.SignalDockCaseWorkspace?.empty?.("Investigation") || { title: "Investigation", status: "open", severity: "none", findings: [] },
      syncLevelChips, syncWorkerIndex, renderEverything,
      clearRecoverySnapshot: () => recoveryDiagnosticsController?.clearRecoverySnapshot({ silent: true }) || Promise.resolve(),
      hideRecoveryBanner: () => recoveryDiagnosticsController?.hideRecoveryBanner(),
      toast
    });
    datasetSessionController.bind();
    if (!window.SignalDockInteractionShellController?.create) throw new Error("SignalDock Interaction Shell controller is unavailable.");
    interactionShellController = window.SignalDockInteractionShellController.create({
      state,
      el,
      ownerDocument: document,
      dialogs: [
        el.settingsDialog, el.serviceMapDialog, el.serviceMatrixDialog, el.serviceHeatmapDialog,
        el.serviceTrendsDialog, el.baselineDialog, el.projectDialog, el.traceExplorerDialog,
        el.traceCompareDialog, el.traceOutlierDialog, el.queryLibraryDialog, el.healthDialog,
        el.commandPaletteDialog, el.investigationDialog, el.exceptionDialog
      ],
      importLogs: () => el.fileInput?.click(),
      focusSearch: () => { if (!el.queryInput?.disabled) el.queryInput?.focus(); },
      closeInspector: () => closeInspector(),
      applyFilters: (resetPage) => applyFilters(resetPage)
    });
    interactionShellController.bind();
    if (!window.SignalDockViewOrchestratorController?.create) throw new Error("SignalDock View Orchestrator controller is unavailable.");
    viewOrchestratorController = window.SignalDockViewOrchestratorController.create({
      state,
      ownerDocument: document,
      rebuildFilterIndex: () => datasetFilterController?.rebuildFilterIndex(),
      updateStats: () => datasetOverviewController?.updateStats(),
      refreshFilters: () => datasetFilterController?.refreshFilters(),
      renderSavedViews: () => savedViewsController?.render(),
      setControlsEnabled: (enabled) => datasetFilterController?.setControlsEnabled(enabled),
      applyFilters: (resetPage) => datasetFilterController?.applyFilters(resetPage),
      renderTimeline: () => datasetOverviewController?.renderTimeline(),
      renderTable: () => tableViewController?.renderTable(),
      renderInspector: () => inspectorController?.render(),
      updateActiveSourceUI: () => datasetOverviewController?.updateActiveSourceUI()
    });
    startupStateController.hydrateInvestigation();
    if (!window.SignalDockRecoveryDiagnosticsController?.create) throw new Error("SignalDock Recovery/diagnostics controller is unavailable.");
    recoveryDiagnosticsController = window.SignalDockRecoveryDiagnosticsController.create({
      state,
      el,
      appVersion: APP_VERSION,
      getWorkspaceState: currentWorkspaceState,
      getViewState: currentViewState,
      getRecoveryAvailability: () => Boolean(window.SignalDockPersistence),
      getAutosaveEligibility: (entries) => window.SignalDockPersistence?.autosaveEligibility?.(entries) || null,
      saveRecoveryDataset: (entries, workspace, version) => window.SignalDockPersistence?.saveDataset?.(entries, workspace, version),
      saveRecoveryView: (view, settings) => window.SignalDockPersistence?.saveView?.(view, settings),
      getRecoveryInfo: () => window.SignalDockPersistence?.recoveryInfo?.() || Promise.resolve(null),
      loadRecovery: () => window.SignalDockPersistence?.loadRecovery?.() || Promise.resolve(null),
      clearRecovery: () => window.SignalDockPersistence?.clearRecovery?.() || Promise.resolve(),
      clearSearchCache: async () => {
        if (!window.SignalDockSearchCache) return { available: false };
        await window.SignalDockSearchCache.clear();
        return { available: true };
      },
      restoreWorkspacePayload,
      setProcessing,
      toast,
      getPerformanceSnapshot: () => profiler()?.snapshot?.() || null,
      copyText: (text) => utils().copyText(text),
      formatBytes: (value) => utils().formatBytes(value),
      canUseVirtualTable,
      getCapabilitySnapshot: () => ({
        indexedDB: Boolean(window.indexedDB),
        fileSystemAccess: typeof window.showOpenFilePicker === "function",
        performanceMemory: Boolean(performance.memory)
      })
    });
    recoveryDiagnosticsController.bind();
    if (!window.SignalDockQueryLibraryController?.create) throw new Error("SignalDock Query Library controller is unavailable.");
    queryLibraryController = window.SignalDockQueryLibraryController.create({
      state,
      el,
      getUtils: utils,
      toast,
      buildViewName,
      syncLevelChips,
      applyFilters,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    queryLibraryController.bind();
    queryLibraryController.render();
    if (!window.SignalDockQueryNavigationController?.create) throw new Error("SignalDock Query Navigation controller is unavailable.");
    queryNavigationController = window.SignalDockQueryNavigationController.create({
      el,
      applyFilters: (resetPage) => applyFilters(resetPage),
      toast
    });
    startupStateController.hydrateBaselineHistory();
    if (!window.SignalDockBaselineController?.create) throw new Error("SignalDock Baseline controller is unavailable.");
    baselineController = window.SignalDockBaselineController.create({
      state,
      el,
      appVersion: APP_VERSION,
      getUtils: utils,
      toast,
      quoteIfNeeded,
      applyFilters,
      closeCompetingDialogs,
      showDialogSafely,
      getProjectName: (projectId) => state.projects.find((project) => project.id === projectId)?.name || "Unassigned",
      attachBaselineToActiveProject: (baseline, meta = {}) => {
        if (!state.activeProjectId || !window.SignalDockProjectManager?.attachBaseline) return;
        state.projects = window.SignalDockProjectManager.attachBaseline(state.projects, state.activeProjectId, {
          id: baseline.id,
          name: baseline.name,
          capturedAt: baseline.capturedAt,
          tags: meta.tags || []
        });
      },
      renderProjects: () => projectController?.render(),
      scheduleDatasetAutosave: () => scheduleDatasetAutosave()
    });
    baselineController.bind();
    startupStateController.hydrateProjects();
    if (!window.SignalDockProjectController?.create) throw new Error("SignalDock Project controller is unavailable.");
    projectController = window.SignalDockProjectController.create({
      state,
      el,
      getUtils: utils,
      toast,
      closeCompetingDialogs,
      showDialogSafely,
      projectDatasetId,
      loadFiles: (files, options) => handleFiles(files, options),
      restoreWorkspaceFile: (file) => restoreWorkspace(file),
      refreshBaselineHistory: () => baselineController?.renderHistory()
    });
    projectController.bind();
    if (!window.SignalDockInspectorController?.create) throw new Error("SignalDock Inspector controller is unavailable.");
    inspectorController = window.SignalDockInspectorController.create({
      state,
      el,
      getUtils: utils,
      getTraceAnalyzer: traceAnalyzer,
      toast,
      renderTable,
      requestCorrelations: loadCorrelations,
      requestTrace: loadTrace,
      applyFilters,
      filterByServiceValue,
      quoteIfNeeded,
      scheduleViewAutosave: () => scheduleViewAutosave()
    });
    inspectorController.bind();
    if (!window.SignalDockSettingsController?.create) throw new Error("SignalDock Settings controller is unavailable.");
    settingsController = window.SignalDockSettingsController.create({
      state,
      el,
      storageKey: STORAGE_SETTINGS,
      getUtils: utils,
      getParserProfiles: parserProfiles,
      toast,
      applyFilters,
      markDatasetForAutosave,
      updateAutosaveStatus,
      updateDiagnostics,
      closeCompetingDialogs,
      showDialogSafely,
      scheduleViewAutosave: () => scheduleViewAutosave(),
      maxParserProfilesImportBytes: 4 * 1024 * 1024,
      readParserProfilesText: async (file, maxBytes) => {
        if (!window.SignalDockStorageAdapter?.readTextFile) throw new Error("Local parser-profile reader is unavailable.");
        const result = await window.SignalDockStorageAdapter.readTextFile(file, maxBytes);
        return result.text;
      }
    });
    settingsController.bind();
    const navigationFeatureCallbacks = {
      search: () => el.queryInput?.focus(),
      map: () => serviceMapController?.open(),
      matrix: () => serviceMatrixController?.open(),
      heatmap: () => serviceHeatmapController?.open(),
      trends: () => serviceTrendsController?.open(),
      baseline: () => baselineController?.open(),
      traces: () => traceExplorerController?.open(),
      outliers: () => traceOutlierController?.open(),
      health: () => healthController?.open(),
      investigation: () => investigationController?.open(),
      exceptions: () => exceptionController?.open(),
      projects: () => projectController?.open(),
      settings: () => settingsController?.open(),
      live: startLiveTail,
      saved: () => queryLibraryController?.open()
    };
    if (!window.SignalDockCommandNavigationController?.create) throw new Error("SignalDock Command/navigation controller is unavailable.");
    commandNavigationController = window.SignalDockCommandNavigationController.create({
      state,
      el,
      getPaletteEngine: paletteEngine,
      getSelectedEntry: selectedEntry,
      closeCompetingDialogs,
      showDialogSafely,
      actions: {
        importLogs: () => el.fileInput?.click(),
        focusSearch: navigationFeatureCallbacks.search,
        openServiceMap: navigationFeatureCallbacks.map,
        openServiceMatrix: navigationFeatureCallbacks.matrix,
        openServiceHeatmap: navigationFeatureCallbacks.heatmap,
        openServiceTrends: navigationFeatureCallbacks.trends,
        openBaseline: navigationFeatureCallbacks.baseline,
        openProjects: navigationFeatureCallbacks.projects,
        openTraceExplorer: navigationFeatureCallbacks.traces,
        openTraceOutliers: navigationFeatureCallbacks.outliers,
        openQueryLibrary: navigationFeatureCallbacks.saved,
        openHealth: navigationFeatureCallbacks.health,
        openInvestigation: navigationFeatureCallbacks.investigation,
        exportCaseMarkdown,
        openExceptions: navigationFeatureCallbacks.exceptions,
        addSelectedEvidence,
        saveWorkspace,
        exportFiltered,
        saveCurrentView,
        resetFilters,
        toggleRenderMode: () => {
          state.renderMode = state.renderMode === "virtual" ? "paged" : "virtual";
          if (el.renderMode) el.renderMode.value = state.renderMode;
          if (el.logTable) el.logTable.scrollTop = 0;
          renderTable();
          scheduleViewAutosave();
        },
        toggleLiveTail: navigationFeatureCallbacks.live,
        openSettings: navigationFeatureCallbacks.settings,
        clearAll
      },
      navResetDialogs: [
        el.settingsDialog, el.serviceMapDialog, el.healthDialog, el.serviceMatrixDialog,
        el.serviceHeatmapDialog, el.serviceTrendsDialog, el.baselineDialog, el.projectDialog,
        el.traceExplorerDialog, el.traceOutlierDialog, el.queryLibraryDialog,
        el.investigationDialog, el.exceptionDialog
      ],
      traceCompareDialog: el.traceCompareDialog,
      traceExplorerDialog: el.traceExplorerDialog
    });
    commandNavigationController.bind();
    if (!window.SignalDockInvestigationController?.create) throw new Error("SignalDock Investigation controller is unavailable.");
    investigationController = window.SignalDockInvestigationController.create({
      state,
      el,
      appVersion: APP_VERSION,
      getUtils: utils,
      toast,
      getSelectedEntry: selectedEntry,
      selectEntry,
      entryRowIntoView,
      updateStats,
      renderInspector,
      refreshCaseWorkspace: (rebuild = true) => renderCaseWorkspace(rebuild),
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav,
      scheduleViewAutosave: () => scheduleViewAutosave(),
      scheduleDatasetAutosave: () => scheduleDatasetAutosave()
    });
    investigationController.bind();
    if (!window.SignalDockExceptionController?.create) throw new Error("SignalDock Exception controller is unavailable.");
    exceptionController = window.SignalDockExceptionController.create({
      state,
      el,
      getUtils: utils,
      formatDuration,
      toast,
      applyFilters,
      selectEntry,
      entryRowIntoView,
      pinEvidence: (...args) => investigationController?.pinEvidence(...args),
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    exceptionController.bind();
    if (!window.SignalDockTraceExplorerController?.create) throw new Error("SignalDock Trace Explorer controller is unavailable.");
    traceExplorerController = window.SignalDockTraceExplorerController.create({
      state,
      el,
      formatDuration,
      toast,
      selectEntry,
      renderInspector,
      entryRowIntoView,
      filterByCorrelation,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    traceExplorerController.bind();
    if (!window.SignalDockTraceOutlierController?.create) throw new Error("SignalDock Trace Outliers controller is unavailable.");
    traceOutlierController = window.SignalDockTraceOutlierController.create({
      state,
      el,
      formatDuration,
      toast,
      applyTraceFilter: (traceId) => {
        el.queryInput.value = `trace:${quoteIfNeeded(traceId)}`;
        applyFilters(true);
      },
      selectEntry,
      renderInspector,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    traceOutlierController.bind();
    if (!window.SignalDockServiceMapController?.create) throw new Error("SignalDock Service Map controller is unavailable.");
    serviceMapController = window.SignalDockServiceMapController.create({
      state,
      el,
      formatDuration,
      toast,
      applyMapNodeFilter: applyTopologyFilter,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav,
      recordPerformance: (...args) => profiler()?.record?.(...args)
    });
    serviceMapController.bind();
    if (!window.SignalDockServiceMatrixController?.create) throw new Error("SignalDock Service Matrix controller is unavailable.");
    serviceMatrixController = window.SignalDockServiceMatrixController.create({
      state,
      el,
      formatDuration,
      toast,
      filterByServiceValue,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    serviceMatrixController.bind();
    if (!window.SignalDockServiceHeatmapController?.create) throw new Error("SignalDock Service Heatmap controller is unavailable.");
    serviceHeatmapController = window.SignalDockServiceHeatmapController.create({
      state,
      el,
      formatDuration,
      toast,
      filterByServiceValue,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    serviceHeatmapController.bind();
    if (!window.SignalDockServiceTrendsController?.create) throw new Error("SignalDock Service Trends controller is unavailable.");
    serviceTrendsController = window.SignalDockServiceTrendsController.create({
      state,
      el,
      formatDuration,
      toast,
      filterByServiceValue,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    serviceTrendsController.bind();
    if (!window.SignalDockHealthController?.create) throw new Error("SignalDock Observed Health controller is unavailable.");
    healthController = window.SignalDockHealthController.create({
      state,
      el,
      formatDuration,
      toast,
      filterByServiceValue,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    healthController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
    caseWorkspaceController = window.SignalDockCaseWorkspaceController.create({
      state,
      el,
      getUtils: utils,
      toast,
      getSelectedEntry: selectedEntry,
      recordCaseActivity: (...args) => investigationController?.recordActivity(...args),
      refreshCaseWorkspace: (rebuild = true) => renderCaseWorkspace(rebuild),
      scheduleViewAutosave: () => scheduleViewAutosave(),
      scheduleDatasetAutosave: () => scheduleDatasetAutosave()
    });
    caseWorkspaceController.bind();
    if (!window.SignalDockCaseFileController?.create) throw new Error("SignalDock Case File controller is unavailable.");
    caseFileController = window.SignalDockCaseFileController.create({
      state, el, ownerDocument: document,
      pruneEvidenceLinks: (caseFile, evidence) => window.SignalDockCaseWorkspace.pruneEvidenceLinks(caseFile, evidence),
      summarizeCase: (caseFile, evidence) => window.SignalDockCaseWorkspace.summarize(caseFile, evidence),
      exportCaseJsonText: (caseFile) => window.SignalDockCaseWorkspace.exportJson(caseFile),
      exportCaseMarkdownText: (caseFile, investigation) => window.SignalDockCaseWorkspace.exportMarkdown(caseFile, investigation),
      importCaseJsonText: (text) => window.SignalDockCaseWorkspace.importJson(text),
      normalizeInvestigation: (value) => window.SignalDockInvestigation?.normalize?.(value) || value,
      analyzeServiceHealth: (entries) => window.SignalDockServiceHealth?.analyze?.(entries) || null,
      saveTextExport: async (request) => {
        if (window.SignalDockStorageAdapter?.saveText) return window.SignalDockStorageAdapter.saveText(request);
        utils().downloadParts(request.name, [request.text], request.mime);
        return { mode: "download", name: request.name };
      },
      readCaseText: async (file, maxBytes) => {
        if (!window.SignalDockStorageAdapter?.readTextFile) throw new Error("Local case-file reader is unavailable.");
        const result = await window.SignalDockStorageAdapter.readTextFile(file, maxBytes);
        return result.text;
      },
      renderCaseSurfaces: () => investigationController?.renderCaseSurfaces(),
      renderWorkspace: (rebuild = true) => caseWorkspaceController?.render({ rebuildFindings: rebuild }),
      renderCheckpoints: () => caseCheckpointController?.render(),
      recordCaseActivity: (...args) => investigationController?.recordActivity(...args),
      scheduleViewAutosave: () => scheduleViewAutosave(),
      scheduleDatasetAutosave: () => scheduleDatasetAutosave(),
      formatDuration,
      todayStamp: () => new Date().toISOString().slice(0, 10),
      toast
    });
    startupStateController.hydrateCaseCheckpoints();
    if (!window.SignalDockCaseCheckpointController?.create) throw new Error("SignalDock Case Checkpoint controller is unavailable.");
    caseCheckpointController = window.SignalDockCaseCheckpointController.create({
      state,
      el,
      toast,
      renderCaseWorkspace: () => renderCaseWorkspace(),
      scheduleDatasetAutosave: () => scheduleDatasetAutosave()
    });
    caseCheckpointController.bind();
    caseFileController.bind();
    projectController.render();
    settingsController?.apply();
    settingsController?.refreshSavedParserProfiles();
    profiler()?.observeLongTasks?.();
    setActiveNav("logs");
    filterWorkerController.init();
    renderEverything();
    void recoveryDiagnosticsController.checkRecoverySnapshot();
  }

  function syncWorkerIndex() { return filterWorkerController?.syncIndex() || false; }

  async function startLiveTail() { return importLiveTailController?.startLiveTail(); }

  function stopLiveTail() { return importLiveTailController?.stopLiveTail(); }

  function projectDatasetId(file) { return importLiveTailController?.projectDatasetId(file) || ""; }

  async function handleFiles(fileList, options = {}) { return importLiveTailController?.handleFiles(fileList, options); }

  function appendParsedEntries(parsed) { return importLiveTailController?.appendParsedEntries(parsed) || 0; }

  function rebuildFilterIndex() { return datasetFilterController?.rebuildFilterIndex(); }

  function currentFilterRequest() { return datasetFilterController?.currentFilterRequest() || {}; }

  function applyFilters(resetPage) { return datasetFilterController?.applyFilters(resetPage); }

  function applyFilteredIndexes(indexes, invalidTokens, resetPage) { return datasetFilterController?.applyFilteredIndexes(indexes, invalidTokens, resetPage); }

  function updateQueryValidity(invalidTokens) { return datasetFilterController?.updateQueryValidity(invalidTokens); }

  function resetFilters() { return datasetFilterController?.resetFilters(); }

  function setControlsEnabled(enabled) { return datasetFilterController?.setControlsEnabled(enabled); }

  function refreshFilters() { return datasetFilterController?.refreshFilters(); }

  function getSources() { return datasetFilterController?.getSources() || []; }

  function renderEverything() { return viewOrchestratorController?.renderEverything(); }

  function renderDataViews() { return viewOrchestratorController?.renderDataViews(); }

  function updateStats() { return datasetOverviewController?.updateStats(); }

  function renderSourceNavigation() { return datasetOverviewController?.renderSourceNavigation(); }

  function updateActiveSourceUI() { return datasetOverviewController?.updateActiveSourceUI(); }

  function renderTimeline() { return datasetOverviewController?.renderTimeline(); }

  function renderTable() { return tableViewController?.renderTable(); }

  function canUseVirtualTable() { return tableViewController?.canUseVirtualTable() || false; }

  function renderVirtualTable(resetScroll = false) { return tableViewController?.renderVirtualTable(resetScroll); }

  function ensurePageInRange() { return tableViewController?.ensurePageInRange(); }

  function setPage(page) { return tableViewController?.setPage(page); }
  function selectedEntry() { return inspectorController?.selectedEntry() || null; }

  function selectEntry(id) { inspectorController?.selectEntry(id); }

  function closeInspector() { inspectorController?.close(); }

  function renderInspector() { inspectorController?.render(); }

  function loadCorrelations(entry) { return relatedContextController?.loadCorrelations(entry); }

  function renderCorrelationsPane(entry) { inspectorController?.renderCorrelations(entry); }

  function loadTrace(entry) { return relatedContextController?.loadTrace(entry); }

  function renderTracePane(entry) { inspectorController?.renderTrace(entry); }

  function formatDuration(value) {
    if (inspectorController) return inspectorController.formatDuration(value);
    const ms = Number(value);
    if (!Number.isFinite(ms)) return "—";
    if (ms < 1) return `${Math.round(ms * 1000)} µs`;
    if (ms < 1000) return `${ms < 10 ? ms.toFixed(2) : ms.toFixed(1)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  }

  function filterByCorrelation(kind, value) { inspectorController?.filterByCorrelation(kind, value); }

  function renderCaseWorkspace(rebuild = true) { return caseFileController?.renderCaseWorkspace(rebuild); }

  async function exportCaseJson() { return caseFileController?.exportCaseJson(); }

  async function exportCaseMarkdown() { return caseFileController?.exportCaseMarkdown(); }

  function entryRowIntoView(globalIndex) { return tableViewController?.entryRowIntoView(globalIndex); }

  function filterByServiceValue(service) { return queryNavigationController?.filterByServiceValue(service) || false; }

  function filterByDimension(kind, value) { return queryNavigationController?.filterByDimension(kind, value) || false; }

  function applyTopologyFilter(options = {}) { return queryNavigationController?.applyTopologyFilter(options) || false; }

  function quoteIfNeeded(value) { return queryNavigationController?.quoteIfNeeded(value) || String(value || ""); }

  function exportFiltered() { return datasetSessionController?.exportFiltered(); }

  async function saveWorkspace() { return workspaceController?.saveWorkspace(); }

  async function restoreWorkspace(file) { return workspaceController?.restoreWorkspace(file); }

  function clearAll() { return datasetSessionController?.clearAll(); }

  function resetFiltersWithoutRender() { return datasetSessionController?.resetFiltersWithoutRender(); }

  function saveCurrentView() { savedViewsController?.saveCurrentView(); }

  function buildViewName() { return savedViewsController?.buildViewName() || "My log view"; }

  function renderSavedViews() { savedViewsController?.render(); }

  function syncLevelChips(level) { return viewOrchestratorController?.syncLevelChips(level); }

  function closeCompetingDialogs(exceptId = "") { return interactionShellController?.closeCompetingDialogs(exceptId) || 0; }

  function showDialogSafely(dialog) { return interactionShellController?.showDialogSafely(dialog) || false; }

  function currentCustomParserProfile() {
    return settingsController?.currentCustomParserProfile?.() || {
      pattern: String(state.settings.customParserPattern || "").trim(),
      flags: String(state.settings.customParserFlags || "i").replace(/[^imsu]/g, "")
    };
  }

  function currentViewState() { return workspaceController?.currentViewState() || {}; }

  function currentWorkspaceState() { return workspaceController?.currentWorkspaceState() || {}; }

  function markDatasetForAutosave() { recoveryDiagnosticsController?.markDatasetForAutosave(); }

  function scheduleDatasetAutosave() { recoveryDiagnosticsController?.scheduleDatasetAutosave(); }

  function scheduleViewAutosave() { recoveryDiagnosticsController?.scheduleViewAutosave(); }

  function updateAutosaveStatus() { recoveryDiagnosticsController?.updateAutosaveStatus(); }

  function hideRecoveryBanner() { recoveryDiagnosticsController?.hideRecoveryBanner(); }

  async function restoreWorkspacePayload(payload, label = "workspace") { return workspaceController?.restoreWorkspacePayload(payload, label); }

  function updateDiagnostics() { recoveryDiagnosticsController?.updateDiagnostics(); }

  function setProcessing(active, title = "Processing logs…", detail = "Reading files locally") {
    el.processing.hidden = !active;
    el.processingTitle.textContent = title;
    el.processingDetail.textContent = detail;
  }

  function toast(message, type = "info", duration = 3600) {
    const node = document.createElement("div");
    node.className = `toast${type === "error" ? " toast--error" : ""}`;
    node.textContent = message;
    el.toastRegion.appendChild(node);
    setTimeout(() => node.remove(), duration);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }
}());
