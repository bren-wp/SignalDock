(function () {
  "use strict";

  const STORAGE_VIEWS = "signaldock-saved-views-v3";
  const STORAGE_SETTINGS = "signaldock-settings-v10";
  const APP_VERSION = "2.8.23";
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
  let caseWorkspaceController = null;
  let caseCheckpointController = null;

  const el = {};
  const $ = (id) => document.getElementById(id);
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
    Object.assign(el, {
      importButton: $("importButton"), fileInput: $("fileInput"), dragOverlay: $("dragOverlay"),
      queryInput: $("queryInput"), levelFilter: $("levelFilter"), sourceFilter: $("sourceFilter"), timeFilter: $("timeFilter"), sortFilter: $("sortFilter"), levelChips: $("levelChips"),
      saveViewButton: $("saveViewButton"), resetButton: $("resetButton"), exportButton: $("exportButton"), workspaceSaveButton: $("workspaceSaveButton"), clearAllButton: $("clearAllButton"),
      fileTabs: $("fileTabs"), sourceList: $("sourceList"), savedList: $("savedList"), savedCount: $("savedCount"), navLogCount: $("navLogCount"),
      metricEntries: $("metricEntries"), metricErrors: $("metricErrors"), metricWarnings: $("metricWarnings"), metricSources: $("metricSources"),
      chipErrors: $("chipErrors"), chipWarnings: $("chipWarnings"), loadedMeta: $("loadedMeta"),
      timelineBars: $("timelineBars"), timelineTitle: $("timelineTitle"), timelineStart: $("timelineStart"), timelineEnd: $("timelineEnd"), timelineMeta: $("timelineMeta"),
      logTable: $("logTable"), resultsSummary: $("resultsSummary"), prevPage: $("prevPage"), nextPage: $("nextPage"), pageLabel: $("pageLabel"), pageSize: $("pageSize"), renderMode: $("renderMode"),
      inspector: $("inspector"), inspectorEmpty: $("inspectorEmpty"), inspectorContent: $("inspectorContent"), inspectorLevel: $("inspectorLevel"), inspectorTime: $("inspectorTime"),
      inspectorMessage: $("inspectorMessage"), inspectorMeta: $("inspectorMeta"), detailsPane: $("detailsPane"), contextPane: $("contextPane"), correlationsPane: $("correlationsPane"), tracePane: $("tracePane"), rawPane: $("rawPane"), jsonPane: $("jsonPane"),
      closeInspector: $("closeInspector"), copyButton: $("copyButton"), filterBySourceButton: $("filterBySourceButton"), filterByServiceButton: $("filterByServiceButton"),
      settingsDialog: $("settingsDialog"), wrapToggle: $("wrapToggle"), compactToggle: $("compactToggle"), unknownToggle: $("unknownToggle"), workerToggle: $("workerToggle"), autosaveToggle: $("autosaveToggle"), parserProfile: $("parserProfile"), customParserFields: $("customParserFields"), customParserPattern: $("customParserPattern"), customParserFlags: $("customParserFlags"), savedParserProfile: $("savedParserProfile"), savedParserName: $("savedParserName"), saveParserProfileButton: $("saveParserProfileButton"), deleteParserProfileButton: $("deleteParserProfileButton"), exportParserProfilesButton: $("exportParserProfilesButton"), importParserProfilesButton: $("importParserProfilesButton"), parserProfilesFileInput: $("parserProfilesFileInput"),
      recoveryBanner: $("recoveryBanner"), recoveryMeta: $("recoveryMeta"), recoveryRestoreButton: $("recoveryRestoreButton"), recoveryDismissButton: $("recoveryDismissButton"), clearRecoveryButton: $("clearRecoveryButton"), clearSearchCacheButton: $("clearSearchCacheButton"), autosaveStatus: $("autosaveStatus"),
      serviceMapCount: $("serviceMapCount"), serviceMapDialog: $("serviceMapDialog"), serviceMapMeta: $("serviceMapMeta"), serviceMapSummary: $("serviceMapSummary"), serviceMapCanvas: $("serviceMapCanvas"), serviceMapList: $("serviceMapList"), closeServiceMapButton: $("closeServiceMapButton"), serviceMapResetButton: $("serviceMapResetButton"), serviceMapGroupBy: $("serviceMapGroupBy"),
      serviceMatrixCount: $("serviceMatrixCount"), serviceMatrixDialog: $("serviceMatrixDialog"), serviceMatrixMeta: $("serviceMatrixMeta"), serviceMatrixSummary: $("serviceMatrixSummary"), serviceMatrixBody: $("serviceMatrixBody"), closeServiceMatrixButton: $("closeServiceMatrixButton"), serviceMatrixResetButton: $("serviceMatrixResetButton"),
      serviceHeatmapCount: $("serviceHeatmapCount"), serviceHeatmapDialog: $("serviceHeatmapDialog"), serviceHeatmapMeta: $("serviceHeatmapMeta"), serviceHeatmapSummary: $("serviceHeatmapSummary"), serviceHeatmapBody: $("serviceHeatmapBody"), closeServiceHeatmapButton: $("closeServiceHeatmapButton"), serviceHeatmapResetButton: $("serviceHeatmapResetButton"),
      serviceTrendsCount: $("serviceTrendsCount"), serviceTrendsDialog: $("serviceTrendsDialog"), serviceTrendsMeta: $("serviceTrendsMeta"), serviceTrendsSummary: $("serviceTrendsSummary"), serviceTrendsBody: $("serviceTrendsBody"), serviceTrendsSplit: $("serviceTrendsSplit"), serviceTrendsWindow: $("serviceTrendsWindow"), closeServiceTrendsButton: $("closeServiceTrendsButton"), serviceTrendsResetButton: $("serviceTrendsResetButton"),
      traceExplorerCount: $("traceExplorerCount"), traceExplorerDialog: $("traceExplorerDialog"), traceExplorerMeta: $("traceExplorerMeta"), traceExplorerSummary: $("traceExplorerSummary"), traceExplorerBody: $("traceExplorerBody"), closeTraceExplorerButton: $("closeTraceExplorerButton"), traceExplorerResetButton: $("traceExplorerResetButton"), traceCompareButton: $("traceCompareButton"), traceCompareDialog: $("traceCompareDialog"), traceCompareBody: $("traceCompareBody"), closeTraceCompareButton: $("closeTraceCompareButton"),
      traceOutlierCount: $("traceOutlierCount"), traceOutlierDialog: $("traceOutlierDialog"), traceOutlierMeta: $("traceOutlierMeta"), traceOutlierSummary: $("traceOutlierSummary"), traceOutlierBody: $("traceOutlierBody"), closeTraceOutlierButton: $("closeTraceOutlierButton"), traceOutlierResetButton: $("traceOutlierResetButton"),
      queryLibraryDialog: $("queryLibraryDialog"), queryLibraryName: $("queryLibraryName"), queryLibraryFolder: $("queryLibraryFolder"), queryLibraryTags: $("queryLibraryTags"), queryLibraryDescription: $("queryLibraryDescription"), queryLibraryFavorite: $("queryLibraryFavorite"), queryLibrarySaveButton: $("queryLibrarySaveButton"), queryLibraryExportButton: $("queryLibraryExportButton"), queryLibraryImportButton: $("queryLibraryImportButton"), queryLibraryFileInput: $("queryLibraryFileInput"), queryLibraryList: $("queryLibraryList"), closeQueryLibraryButton: $("closeQueryLibraryButton"), queryLibrarySearch: $("queryLibrarySearch"), queryLibraryFolderFilter: $("queryLibraryFolderFilter"), queryLibraryManageFolder: $("queryLibraryManageFolder"), queryLibraryRenameFolder: $("queryLibraryRenameFolder"), queryLibraryRenameFolderButton: $("queryLibraryRenameFolderButton"), queryLibraryDeleteFolderButton: $("queryLibraryDeleteFolderButton"), queryLibraryBulkCount: $("queryLibraryBulkCount"), queryLibraryBulkFolder: $("queryLibraryBulkFolder"), queryLibraryBulkSelectVisible: $("queryLibraryBulkSelectVisible"), queryLibraryBulkFavorite: $("queryLibraryBulkFavorite"), queryLibraryBulkUnfavorite: $("queryLibraryBulkUnfavorite"), queryLibraryBulkMove: $("queryLibraryBulkMove"), queryLibraryBulkExport: $("queryLibraryBulkExport"), queryLibraryBulkDelete: $("queryLibraryBulkDelete"), queryLibraryBulkClear: $("queryLibraryBulkClear"),
      baselineChangeCount: $("baselineChangeCount"), baselineDialog: $("baselineDialog"), baselineMeta: $("baselineMeta"), baselineName: $("baselineName"), captureBaselineButton: $("captureBaselineButton"), captureFilteredBaselineButton: $("captureFilteredBaselineButton"), exportBaselineButton: $("exportBaselineButton"), importBaselineButton: $("importBaselineButton"), baselineFileInput: $("baselineFileInput"), baselineSummary: $("baselineSummary"), baselineServiceBody: $("baselineServiceBody"), baselineDependencyBody: $("baselineDependencyBody"), baselineTraceBody: $("baselineTraceBody"), closeBaselineButton: $("closeBaselineButton"), baselineHistoryList: $("baselineHistoryList"), baselineHistoryExportButton: $("baselineHistoryExportButton"), baselineHistoryImportButton: $("baselineHistoryImportButton"), baselineHistoryFileInput: $("baselineHistoryFileInput"), baselineCompareBase: $("baselineCompareBase"), baselineCompareCurrent: $("baselineCompareCurrent"), compareSavedBaselinesButton: $("compareSavedBaselinesButton"),
      projectCount: $("projectCount"), projectDialog: $("projectDialog"), projectName: $("projectName"), projectDescription: $("projectDescription"), createProjectButton: $("createProjectButton"), projectLinkFilesButton: $("projectLinkFilesButton"), projectCapabilityMeta: $("projectCapabilityMeta"), exportProjectsButton: $("exportProjectsButton"), importProjectsButton: $("importProjectsButton"), projectsFileInput: $("projectsFileInput"), activeProjectMeta: $("activeProjectMeta"), projectList: $("projectList"), closeProjectButton: $("closeProjectButton"),
      caseCheckpointLabel: $("caseCheckpointLabel"), addCaseCheckpointButton: $("addCaseCheckpointButton"), caseCheckpoints: $("caseCheckpoints"),
      diagnosticsGrid: $("diagnosticsGrid"), copyDiagnosticsButton: $("copyDiagnosticsButton"), commandPaletteButton: $("commandPaletteButton"), commandPaletteDialog: $("commandPaletteDialog"), commandPaletteInput: $("commandPaletteInput"), commandPaletteList: $("commandPaletteList"), closeCommandPaletteButton: $("closeCommandPaletteButton"),
      investigationCount: $("investigationCount"), investigationDialog: $("investigationDialog"), investigationTitle: $("investigationTitle"), investigationSummary: $("investigationSummary"), investigationStats: $("investigationStats"), investigationList: $("investigationList"), investigationTimeline: $("investigationTimeline"), investigationTimelineMeta: $("investigationTimelineMeta"), closeInvestigationButton: $("closeInvestigationButton"), exportInvestigationBundleButton: $("exportInvestigationBundleButton"), exportInvestigationMarkdownButton: $("exportInvestigationMarkdownButton"), exportInvestigationJsonButton: $("exportInvestigationJsonButton"), importInvestigationJsonButton: $("importInvestigationJsonButton"), investigationFileInput: $("investigationFileInput"), clearInvestigationButton: $("clearInvestigationButton"), addEvidenceButton: $("addEvidenceButton"),
      caseWorkspaceStats: $("caseWorkspaceStats"), caseTimelineFilter: $("caseTimelineFilter"), caseTimelineMeta: $("caseTimelineMeta"), caseTimelineList: $("caseTimelineList"), caseStatus: $("caseStatus"), caseSeverity: $("caseSeverity"), caseHypothesis: $("caseHypothesis"), caseImpact: $("caseImpact"), caseNextSteps: $("caseNextSteps"), addCaseFindingButton: $("addCaseFindingButton"), exportCaseMarkdownButton: $("exportCaseMarkdownButton"), exportCaseJsonButton: $("exportCaseJsonButton"), importCaseJsonButton: $("importCaseJsonButton"), caseFileInput: $("caseFileInput"), caseFindings: $("caseFindings"), addCaseMilestoneButton: $("addCaseMilestoneButton"), caseMilestones: $("caseMilestones"), addCaseAttachmentButton: $("addCaseAttachmentButton"), caseAttachmentInput: $("caseAttachmentInput"), caseAttachments: $("caseAttachments"), caseActivityMeta: $("caseActivityMeta"), caseActivityList: $("caseActivityList"),
      exceptionGroupCount: $("exceptionGroupCount"), exceptionDialog: $("exceptionDialog"), exceptionSummary: $("exceptionSummary"), exceptionTrend: $("exceptionTrend"), exceptionList: $("exceptionList"), closeExceptionButton: $("closeExceptionButton"), exceptionResetButton: $("exceptionResetButton"),
      healthIssueCount: $("healthIssueCount"), healthDialog: $("healthDialog"), healthSummary: $("healthSummary"), healthTableBody: $("healthTableBody"), closeHealthButton: $("closeHealthButton"), healthResetButton: $("healthResetButton"),
      processing: $("processing"), processingTitle: $("processingTitle"), processingDetail: $("processingDetail"), toastRegion: $("toastRegion")
    });

    state.savedViews = utils().loadJson(STORAGE_VIEWS, null) || utils().loadJson("signaldock-saved-views-v2", null) || utils().loadJson("signaldock-saved-views-v1", []);
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
    state.settings = Object.assign(state.settings, utils().loadJson("signaldock-settings-v1", {}), utils().loadJson("signaldock-settings-v2", {}), utils().loadJson("signaldock-settings-v3", {}), utils().loadJson("signaldock-settings-v5", {}), utils().loadJson("signaldock-settings-v6", {}), utils().loadJson("signaldock-settings-v8", {}), utils().loadJson(STORAGE_SETTINGS, {}));
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
      shouldUseWorkerFilter: () => state.settings.useWorker !== false && state.workerReady && state.entries.length >= WORKER_THRESHOLD,
      requestWorkerFilter: ({ requestId, request }) => state.worker.postMessage({ type: "filter", protocol: 1, token: state.workerToken, requestId, request }),
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
    state.investigation = window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] };
    state.caseFile = window.SignalDockCaseWorkspace?.empty?.("Investigation") || { title: "Investigation", status: "open", severity: "none", findings: [] };
    state.queryLibrary = window.SignalDockQueryLibrary?.load?.() || [];
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
    state.baselineHistory = window.SignalDockBaselineManager?.loadHistory?.() || [];
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
    state.projects = window.SignalDockProjectManager?.load?.() || [];
    state.activeProjectId = String(utils().loadJson("signaldock-active-project-v1", "") || "");
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
      scheduleViewAutosave: () => scheduleViewAutosave()
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
      settings: openSettings,
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
    state.caseCheckpoints = window.SignalDockCaseCheckpoints?.normalizeList?.([]) || [];
    if (!window.SignalDockCaseCheckpointController?.create) throw new Error("SignalDock Case Checkpoint controller is unavailable.");
    caseCheckpointController = window.SignalDockCaseCheckpointController.create({
      state,
      el,
      toast,
      renderCaseWorkspace: () => renderCaseWorkspace(),
      scheduleDatasetAutosave: () => scheduleDatasetAutosave()
    });
    caseCheckpointController.bind();
    projectController.render();
    applySettings();
    refreshSavedParserProfiles();
    profiler()?.observeLongTasks?.();
    bindEvents();
    setActiveNav("logs");
    initFilterWorker();
    renderEverything();
    void recoveryDiagnosticsController.checkRecoverySnapshot();
  }

  function bindEvents() {

    el.exportButton.addEventListener("click", exportFiltered);
    el.clearAllButton.addEventListener("click", clearAll);


    el.exportCaseMarkdownButton?.addEventListener("click", exportCaseMarkdown);
    el.exportCaseJsonButton?.addEventListener("click", exportCaseJson);
    el.importCaseJsonButton?.addEventListener("click", () => el.caseFileInput?.click());
    el.caseFileInput?.addEventListener("change", importCaseJson);

    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        el.fileInput.click();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (!el.queryInput.disabled) el.queryInput.focus();
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        if (!el.queryInput.disabled) el.queryInput.focus();
      }
      if (event.key === "Escape" && !el.settingsDialog.open) {
        if (state.selectedId) closeInspector();
        else if (el.queryInput.value) {
          el.queryInput.value = "";
          applyFilters(true);
        }
      }
    });
  }

  function createWorkerSessionToken() {
    const cryptoApi = window.crypto;
    if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID().replace(/-/g, "");
    if (typeof cryptoApi?.getRandomValues === "function") { const bytes = new Uint8Array(24); cryptoApi.getRandomValues(bytes); return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""); }
    return "";
  }

  function initFilterWorker() {
    if (typeof Worker !== "function") return;
    if (window.location?.protocol === "file:") {
      state.lastEngine = "main · local file mode";
      return;
    }
    try {
      const token = createWorkerSessionToken();
      if (!token) { state.lastEngine = "main · secure worker token unavailable"; return; }
      const worker = new Worker(`filter-worker.js?sd_session=${encodeURIComponent(token)}`);
      state.worker = worker;
      state.workerToken = token;
      worker.onmessage = onWorkerMessage;
      worker.onerror = () => disableWorker("Background filter worker unavailable; using the main thread.");
    } catch {
      state.worker = null;
    }
  }

  function onWorkerMessage(event) {
    const message = event?.data;
    if (!message || typeof message !== "object" || Array.isArray(message) || message.protocol !== 1 || !state.workerToken || message.token !== state.workerToken) return;
    if (message.type === "ready") {
      state.workerAvailable = true;
      if (state.entries.length) syncWorkerIndex();
      return;
    }
    if (message.type === "indexed") {
      if (message.version === state.workerVersion) {
        state.workerReady = true;
        state.searchIndex = Object.assign({ enabled: false, tokens: 0, postings: 0, truncated: false, elapsedMs: 0, mode: "linear", candidateCount: state.entries.length }, message.searchIndex || {});
        updateDiagnostics();
      }
      return;
    }
    if (message.type === "filtered") {
      if (message.requestId !== state.filterRequestId || message.version !== state.workerVersion) return;
      state.searchIndex.mode = message.searchMode || "linear";
      state.searchIndex.candidateCount = Number(message.candidateCount) || state.entries.length;
      state.searchIndex.reason = message.indexReason || "";
      state.lastEngine = `worker ${message.searchMode === "disk-indexed" ? "disk-indexed" : message.searchMode === "indexed" ? "indexed" : "linear"} · ${message.elapsedMs} ms`;
      profiler()?.record?.("filter", Number(message.elapsedMs) || 0, { engine: `worker-${message.searchMode || "linear"}`, entries: state.entries.length, candidates: state.searchIndex.candidateCount });
      applyFilteredIndexes(message.indexes, message.invalid || [], false);
      return;
    }
    if (message.type === "correlated") {
      if (message.requestId !== state.correlationRequestId || message.version !== state.workerVersion) return;
      state.correlatedIndexes = message.indexes || [];
      state.correlationEngine = `worker · ${message.elapsedMs} ms`;
      profiler()?.record?.("correlation", Number(message.elapsedMs) || 0, { engine: "worker" });
      renderCorrelationsPane(selectedEntry());
    }
    if (message.type === "trace-related") {
      if (message.requestId !== state.traceRequestId || message.version !== state.workerVersion) return;
      state.traceIndexes = message.indexes || [];
      state.traceEngine = `worker · ${message.elapsedMs} ms`;
      profiler()?.record?.("trace", Number(message.elapsedMs) || 0, { engine: "worker" });
      renderTracePane(selectedEntry());
    }
  }

  function disableWorker(message) {
    if (state.worker) state.worker.terminate();
    state.worker = null;
    state.workerAvailable = false;
    state.workerReady = false;
    state.workerToken = "";
    state.searchIndex = { enabled: false, tokens: 0, postings: 0, truncated: false, elapsedMs: 0, mode: "linear", candidateCount: state.entries.length, cacheHit: false, cacheEligible: false, cacheSegments: 0 };
    state.lastEngine = "main";
    if (message) toast(message);
  }

  function syncWorkerIndex() {
    if (!state.worker || !state.workerAvailable || !state.workerToken) return;
    state.workerReady = false;
    state.searchIndex.mode = "building";
    state.searchIndex.candidateCount = state.entries.length;
    state.workerVersion += 1;
    try {
      state.worker.postMessage({ type: "index", protocol: 1, token: state.workerToken, version: state.workerVersion, entries: state.filterEntries });
    } catch {
      disableWorker();
    }
  }

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

  function renderEverything() {
    if (state.entries.length && !state.filterEntries.length) rebuildFilterIndex();
    updateStats();
    refreshFilters();
    renderSavedViews();
    setControlsEnabled(Boolean(state.entries.length));
    applyFilters(false);
  }

  function renderDataViews() {
    renderTimeline();
    renderTable();
    renderInspector();
    updateActiveSourceUI();
  }

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

  function loadCorrelations(entry) {
    if (!entry) return;
    const correlations = entry.correlations || {};
    if (!Object.keys(correlations).length) {
      state.correlatedIndexes = [];
      state.correlationEngine = "none";
      renderCorrelationsPane(entry);
      return;
    }
    state.correlationRequestId += 1;
    const requestId = state.correlationRequestId;
    const useWorker = state.settings.useWorker !== false && state.workerReady && state.entries.length >= WORKER_THRESHOLD;
    if (useWorker) {
      state.correlationEngine = "worker · searching";
      renderCorrelationsPane(entry);
      state.worker.postMessage({ type: "correlate", protocol: 1, token: state.workerToken, requestId, correlations, limit: 200, origin: entry.globalIndex });
      return;
    }
    const started = performance.now();
    state.correlatedIndexes = engine().relatedIndexes(state.filterEntries, correlations, 200, entry.globalIndex);
    const correlationElapsed = Math.round((performance.now() - started) * 10) / 10;
    state.correlationEngine = `main · ${correlationElapsed} ms`;
    profiler()?.record?.("correlation", correlationElapsed, { engine: "main" });
    renderCorrelationsPane(entry);
  }

  function renderCorrelationsPane(entry) { inspectorController?.renderCorrelations(entry); }

  function loadTrace(entry) {
    if (!entry) return;
    const traceId = entry.correlations?.trace;
    if (!traceId) {
      state.traceIndexes = [];
      state.traceEngine = "none";
      renderTracePane(entry);
      return;
    }
    state.traceRequestId += 1;
    const requestId = state.traceRequestId;
    const correlations = { trace: traceId };
    const useWorker = state.settings.useWorker !== false && state.workerReady && state.entries.length >= WORKER_THRESHOLD;
    if (useWorker) {
      state.traceEngine = "worker · searching";
      renderTracePane(entry);
      state.worker.postMessage({ type: "trace", protocol: 1, token: state.workerToken, requestId, correlations, limit: 1000, origin: entry.globalIndex });
      return;
    }
    const started = performance.now();
    state.traceIndexes = engine().relatedIndexes(state.filterEntries, correlations, 1000, entry.globalIndex);
    const traceElapsed = Math.round((performance.now() - started) * 10) / 10;
    state.traceEngine = `main · ${traceElapsed} ms`;
    profiler()?.record?.("trace", traceElapsed, { engine: "main" });
    renderTracePane(entry);
  }

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

  function makeUiButton(id, label, className = "button button--ghost button--small") {
    const button = document.createElement("button"); button.type = "button"; button.id = id; button.className = className; button.textContent = label; return button;
  }








  function renderCaseWorkspace(rebuild = true) {
    if (!window.SignalDockCaseWorkspace || !el.caseFindings) return;
    state.caseFile = window.SignalDockCaseWorkspace.pruneEvidenceLinks(state.caseFile, state.investigation?.items || []);
    const summary = window.SignalDockCaseWorkspace.summarize(state.caseFile, state.investigation?.items || []);
    if (el.caseWorkspaceStats) el.caseWorkspaceStats.textContent = `${summary.findings} findings · ${summary.confirmed} confirmed · ${summary.linkedEvidence} linked evidence`;
    investigationController?.renderCaseSurfaces();
    caseWorkspaceController?.render({ rebuildFindings: rebuild });
    caseCheckpointController?.render();
  }

  async function exportCaseJson() {
    if (!window.SignalDockCaseWorkspace) return;
    const name=`signaldock-case-${new Date().toISOString().slice(0,10)}.sdcase`; const text=window.SignalDockCaseWorkspace.exportJson(state.caseFile);
    if(window.SignalDockStorageAdapter?.saveText) await window.SignalDockStorageAdapter.saveText({name,text,mime:"application/json;charset=utf-8"}); else utils().downloadParts(name,[text],"application/json;charset=utf-8");
    toast("Case workspace exported.");
  }

  function exportCaseMarkdown() {
    if (!window.SignalDockCaseWorkspace) return;
    let report = window.SignalDockCaseWorkspace.exportMarkdown(state.caseFile, state.investigation);
    const health = state.healthData || window.SignalDockServiceHealth?.analyze?.(state.entries);
    const trend = state.exceptionTrends;
    report += `\n\n## Observed dataset context\n\n- Entries: ${state.entries.length.toLocaleString()}\n- Services: ${(state.summary.services || []).length.toLocaleString()}\n- Error/Fatal entries: ${state.summary.errors.toLocaleString()}\n- Warning entries: ${state.summary.warnings.toLocaleString()}\n- Exception fingerprints: ${(state.exceptionGroups || []).length.toLocaleString()}\n`;
    const concerning = (health?.rows || []).filter((row) => row.status === "critical" || row.status === "degraded").slice(0, 12);
    if (concerning.length) { report += `\n### Observed service concerns\n\n`; concerning.forEach((row) => { report += `- **${row.service}** — ${row.status}; ${(row.errorRate * 100).toFixed(1)}% error rate; ${row.exceptionGroups} exception groups${row.p95DurationMs === null ? "" : `; p95 span ${formatDuration(row.p95DurationMs)}`}\n`; }); }
    const spiking = [...(trend?.groups?.values?.() || [])].filter((row) => row.trend === "spiking").sort((a,b) => b.recent - a.recent).slice(0, 12);
    if (spiking.length) { report += `\n### Spiking exception fingerprints\n\n`; spiking.forEach((row) => { report += `- \`${row.fingerprint}\` — ${row.recent} recent vs ${row.previous} previous-window occurrences\n`; }); }
    report += `\n> Observed health and trend sections are derived only from the logs included in this local SignalDock dataset.\n`;
    const name=`signaldock-case-${new Date().toISOString().slice(0,10)}.md`;
    if(window.SignalDockStorageAdapter?.saveText) window.SignalDockStorageAdapter.saveText({name,text:report,mime:"text/markdown;charset=utf-8"}); else utils().downloadParts(name,[report],"text/markdown;charset=utf-8");
    toast("Case report exported as Markdown.");
  }

  async function importCaseJson(event) {
    const file = event.target.files?.[0];
    if (!file || !window.SignalDockCaseWorkspace) return;
    try {
      state.caseFile = window.SignalDockCaseWorkspace.importJson(await file.text());
      state.caseFile = window.SignalDockCaseWorkspace.pruneEvidenceLinks(state.caseFile, state.investigation?.items || []);
      investigationController?.recordActivity("case.imported", "Case file imported", file.name || "Imported case");
      if (window.SignalDockInvestigation) state.investigation = window.SignalDockInvestigation.normalize(Object.assign({}, state.investigation, { title: state.caseFile.title || state.investigation?.title || "Investigation", summary: state.caseFile.summary || state.investigation?.summary || "" }));
      if (el.investigationTitle) el.investigationTitle.value = state.investigation.title;
      if (el.investigationSummary) el.investigationSummary.value = state.investigation.summary;
      if (el.caseStatus) el.caseStatus.value = state.caseFile.status;
      if (el.caseSeverity) el.caseSeverity.value = state.caseFile.severity;
      if (el.caseHypothesis) el.caseHypothesis.value = state.caseFile.hypothesis;
      if (el.caseImpact) el.caseImpact.value = state.caseFile.impact;
      if (el.caseNextSteps) el.caseNextSteps.value = state.caseFile.nextSteps;
      renderCaseWorkspace(); scheduleViewAutosave(); if (state.settings.autosave !== false) scheduleDatasetAutosave();
      toast(`Imported case with ${state.caseFile.findings.length} finding${state.caseFile.findings.length === 1 ? "" : "s"}.`);
    } catch (error) { toast(`Could not import case: ${error.message || error}`, "error", 6500); }
    finally { event.target.value = ""; }
  }

  function entryRowIntoView(globalIndex) { return tableViewController?.entryRowIntoView(globalIndex); }

  function filterByServiceValue(service) {
    if (!service) return;
    const cleanQuery = el.queryInput.value.replace(/(?:^|\s)service:(?:"[^"]+"|[^\s]+)/gi, " ").trim();
    el.queryInput.value = `${cleanQuery}${cleanQuery ? " " : ""}service:${quoteIfNeeded(service)}`;
    applyFilters(true);
    toast(`Filtered to service ${service}.`);
  }

  function filterByDimension(kind, value) {
    if (!kind || !value) return;
    const operator = kind === "environment" ? "env" : kind === "namespace" ? "namespace" : "service";
    const matcher = operator === "env" ? /(?:^|\s)(?:env|environment):(?:"[^"]+"|[^\s]+)/gi : operator === "namespace" ? /(?:^|\s)(?:ns|namespace):(?:"[^"]+"|[^\s]+)/gi : /(?:^|\s)service:(?:"[^"]+"|[^\s]+)/gi;
    const cleanQuery = el.queryInput.value.replace(matcher, " ").trim();
    el.queryInput.value = `${cleanQuery}${cleanQuery ? " " : ""}${operator}:${quoteIfNeeded(value)}`;
    applyFilters(true);
    toast(`Filtered to ${kind} ${value}.`);
  }

  function applyTopologyFilter({ kind = "service", value = "", scopeKind = "", scopeValue = "" } = {}) {
    kind = String(kind || "service");
    value = String(value || "").trim();
    scopeKind = String(scopeKind || "");
    scopeValue = String(scopeValue || "").trim();
    if (!value) return;
    const operator = kind === "environment" ? "env" : kind === "namespace" ? "namespace" : "service";
    const patterns = {
      service: /(?:^|\s)service:(?:"[^"]+"|[^\s]+)/gi,
      env: /(?:^|\s)(?:env|environment):(?:"[^"]+"|[^\s]+)/gi,
      namespace: /(?:^|\s)(?:ns|namespace):(?:"[^"]+"|[^\s]+)/gi
    };
    let cleanQuery = el.queryInput.value.replace(patterns[operator], " ").trim();
    cleanQuery = `${cleanQuery}${cleanQuery ? " " : ""}${operator}:${quoteIfNeeded(value)}`;
    if (scopeKind && scopeValue) {
      const scopeOperator = scopeKind === "environment" ? "env" : "namespace";
      cleanQuery = cleanQuery.replace(patterns[scopeOperator], " ").trim();
      cleanQuery += ` ${scopeOperator}:${quoteIfNeeded(scopeValue)}`;
    }
    el.queryInput.value = cleanQuery.trim();
    applyFilters(true);
    toast(`Applied topology filter: ${el.queryInput.value}.`);
  }

  function quoteIfNeeded(value) {
    const text = String(value || "");
    return /\s/.test(text) ? `"${text.replace(/"/g, "")}"` : text;
  }

  function exportFiltered() {
    if (!state.filteredIndexes.length) return;
    const day = new Date().toISOString().slice(0, 10);
    const normalize = (entry) => ({
      timestamp: entry.timestamp,
      level: entry.level,
      service: entry.service,
      source: entry.source,
      message: entry.message,
      correlations: entry.correlations || {},
      traceMeta: entry.traceMeta || {},
      dimensions: entry.dimensions || {},
      raw: entry.raw
    });

    if (state.filteredIndexes.length > 50000) {
      const parts = [];
      const chunkSize = 2000;
      for (let offset = 0; offset < state.filteredIndexes.length; offset += chunkSize) {
        const lines = [];
        const end = Math.min(offset + chunkSize, state.filteredIndexes.length);
        for (let i = offset; i < end; i += 1) {
          const entry = state.entries[state.filteredIndexes[i]];
          if (entry) lines.push(JSON.stringify(normalize(entry)));
        }
        if (lines.length) parts.push(lines.join("\n") + "\n");
      }
      utils().downloadParts(`signaldock-export-${day}.ndjson`, parts, "application/x-ndjson;charset=utf-8");
      toast(`Exported ${state.filteredIndexes.length.toLocaleString()} entries as NDJSON for lower memory overhead.`);
      return;
    }

    const payload = state.filteredIndexes.map((index) => state.entries[index]).filter(Boolean).map(normalize);
    utils().downloadJson(`signaldock-export-${day}.json`, payload);
    toast(`Exported ${payload.length.toLocaleString()} entries.`);
  }


  async function saveWorkspace() { return workspaceController?.saveWorkspace(); }

  async function restoreWorkspace(file) { return workspaceController?.restoreWorkspace(file); }

  function clearAll() {
    if (!state.entries.length) return;
    if (!window.confirm("Clear all loaded logs from this SignalDock session?")) return;
    stopLiveTail();
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
    state.investigation = window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] };
    state.caseFile = window.SignalDockCaseWorkspace?.empty?.("Investigation") || { title: "Investigation", status: "open", severity: "none", findings: [] };
    state.caseCheckpoints = [];
    state.exceptionGroups = [];
    state.exceptionTrends = null;
    state.healthData = null;
    state.exceptionViewFingerprint = "";
    resetFiltersWithoutRender();
    syncWorkerIndex();
    renderEverything();
    window.SignalDockPersistence?.clearRecovery().catch(() => {});
    hideRecoveryBanner();
    toast("All loaded logs cleared.");
  }

  function resetFiltersWithoutRender() {
    el.queryInput.value = "";
    el.levelFilter.value = "";
    el.sourceFilter.value = "";
    el.timeFilter.value = "";
    el.sortFilter.value = "original";
    syncLevelChips("");
  }

  function saveCurrentView() { savedViewsController?.saveCurrentView(); }

  function buildViewName() { return savedViewsController?.buildViewName() || "My log view"; }

  function renderSavedViews() { savedViewsController?.render(); }

  function syncLevelChips(level) {
    document.querySelectorAll("[data-level]").forEach((button) => button.classList.toggle("is-active", button.dataset.level === level));
  }

  function refreshSavedParserProfiles(selectedId = "") { settingsController?.refreshSavedParserProfiles(selectedId); }

  function applySavedParserProfile() { settingsController?.applySavedParserProfile?.(); }

  function saveParserProfileFromForm() { settingsController?.saveParserProfileFromForm?.(); }

  function deleteSelectedParserProfile() { settingsController?.deleteSelectedParserProfile?.(); }

  function exportParserProfiles() { settingsController?.exportParserProfiles?.(); }

  async function importParserProfiles(event) { await settingsController?.importParserProfiles?.(event); }

  function closeCompetingDialogs(exceptId = "") {
    [el.settingsDialog, el.serviceMapDialog, el.serviceMatrixDialog, el.serviceHeatmapDialog, el.serviceTrendsDialog, el.baselineDialog, el.projectDialog, el.traceExplorerDialog, el.traceCompareDialog, el.traceOutlierDialog, el.queryLibraryDialog, el.healthDialog, el.commandPaletteDialog, el.investigationDialog, el.exceptionDialog].forEach((dialog) => {
      if (!dialog || dialog.id === exceptId || !dialog.open) return;
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });
  }

  function showDialogSafely(dialog) {
    if (!dialog) return false;
    if (dialog.open) return true;
    try {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      return true;
    } catch {
      dialog.setAttribute("open", "");
      return true;
    }
  }

  function openCommandPalette() { commandNavigationController?.open(); }

  function closeCommandPalette() { commandNavigationController?.close(); }

  function renderCommandPalette() { commandNavigationController?.render(); }

  function runCommand(id) { commandNavigationController?.run(id); }

  function openSettings() { settingsController?.open(); }

  function persistSettingsFromForm() { settingsController?.persistFromForm(); }

  function applySettings() { settingsController?.apply(); }

  function currentCustomParserProfile() {
    return {
      pattern: String(state.settings.customParserPattern || "").trim(),
      flags: String(state.settings.customParserFlags || "i").replace(/[^imsu]/g, "")
    };
  }

  function updateCustomParserVisibility() { settingsController?.updateCustomParserVisibility(); }

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
