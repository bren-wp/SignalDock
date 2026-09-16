(function () {
  "use strict";

  const STORAGE_VIEWS = "signaldock-saved-views-v3";
  const STORAGE_SETTINGS = "signaldock-settings-v10";
  const APP_VERSION = "2.8.13";
  const WORKER_THRESHOLD = 25000;
  const TIMELINE_BUCKETS = 36;
  const TIMELINE_SEGMENTS = 8;
  const MAX_VIRTUAL_SCROLL_PX = 8000000;

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

  let scheduleDatasetAutosave = () => {};
  let scheduleViewAutosave = () => {};
  let virtualSpacerRules = null;
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

  function setActiveNav(target) {
    document.querySelectorAll("[data-nav]").forEach((item) => {
      const active = item.dataset.nav === target;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }

  function activateNavView(target) {
    setActiveNav(target);
    const action = {
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
    }[target];
    action?.();
  }

  function bindDialogNavReset(...dialogs) {
    dialogs.filter(Boolean).forEach((dialog) => dialog.addEventListener("close", () => setActiveNav("logs")));
  }

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
    state.settings = Object.assign(state.settings, utils().loadJson("signaldock-settings-v1", {}), utils().loadJson("signaldock-settings-v2", {}), utils().loadJson("signaldock-settings-v3", {}), utils().loadJson("signaldock-settings-v5", {}), utils().loadJson("signaldock-settings-v6", {}), utils().loadJson("signaldock-settings-v8", {}), utils().loadJson(STORAGE_SETTINGS, {}));
    state.investigation = window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] };
    state.caseFile = window.SignalDockCaseWorkspace?.empty?.("Investigation") || { title: "Investigation", status: "open", severity: "none", findings: [] };
    state.queryLibrary = window.SignalDockQueryLibrary?.load?.() || [];
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
    scheduleDatasetAutosave = utils().debounce(() => autosaveDataset(), 1400);
    scheduleViewAutosave = utils().debounce(() => autosaveView(), 450);
    bindEvents();
    setActiveNav("logs");
    initFilterWorker();
    renderEverything();
    checkRecoverySnapshot();
  }

  function bindEvents() {
    el.importButton.addEventListener("click", () => el.fileInput.click());
    el.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));

    let dragDepth = 0;
    document.addEventListener("dragenter", (event) => {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      dragDepth += 1;
      el.dragOverlay.hidden = false;
    });
    document.addEventListener("dragover", (event) => {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
    });
    document.addEventListener("dragleave", (event) => {
      if (!hasFileDrag(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) el.dragOverlay.hidden = true;
    });
    document.addEventListener("drop", (event) => {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      dragDepth = 0;
      el.dragOverlay.hidden = true;
      handleFiles(event.dataTransfer.files);
    });

    const debouncedFilter = utils().debounce(() => applyFilters(true), 80);
    el.queryInput.addEventListener("input", debouncedFilter);
    el.levelFilter.addEventListener("change", () => { syncLevelChips(el.levelFilter.value); applyFilters(true); });
    el.sourceFilter.addEventListener("change", () => applyFilters(true));
    el.timeFilter.addEventListener("change", () => applyFilters(true));
    el.sortFilter.addEventListener("change", () => applyFilters(true));
    el.levelChips.addEventListener("click", (event) => {
      const button = event.target.closest("[data-level]");
      if (!button || el.levelFilter.disabled) return;
      el.levelFilter.value = button.dataset.level;
      syncLevelChips(button.dataset.level);
      applyFilters(true);
    });

    el.resetButton.addEventListener("click", resetFilters);
    el.exportButton.addEventListener("click", exportFiltered);
    el.workspaceSaveButton.addEventListener("click", saveWorkspace);
    el.clearAllButton.addEventListener("click", clearAll);
    el.saveViewButton.addEventListener("click", saveCurrentView);

    el.fileTabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-source]");
      if (!tab || el.sourceFilter.disabled) return;
      el.sourceFilter.value = tab.dataset.source;
      applyFilters(true);
    });
    el.sourceList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-source]");
      if (!button || el.sourceFilter.disabled) return;
      el.sourceFilter.value = button.dataset.source;
      applyFilters(true);
    });
    el.savedList.addEventListener("click", onSavedViewsClick);

    el.prevPage.addEventListener("click", () => setPage(state.page - 1));
    el.nextPage.addEventListener("click", () => setPage(state.page + 1));
    el.pageSize.addEventListener("change", () => {
      state.pageSize = Number(el.pageSize.value) || 100;
      state.page = 1;
      renderTable();
      scheduleViewAutosave();
    });
    el.renderMode?.addEventListener("change", () => {
      state.renderMode = el.renderMode.value === "virtual" ? "virtual" : "paged";
      state.page = 1;
      el.logTable.scrollTop = 0;
      renderTable();
      scheduleViewAutosave();
    });
    el.logTable.addEventListener("scroll", () => {
      if (state.renderMode !== "virtual") return;
      const now = performance.now();
      const delta = Math.abs(el.logTable.scrollTop - state.virtual.lastScrollTop);
      const elapsed = Math.max(1, now - state.virtual.lastScrollAt);
      const velocity = delta / elapsed;
      state.virtual.overscan = Math.max(10, Math.min(64, Math.round(10 + velocity * 10)));
      state.virtual.lastScrollTop = el.logTable.scrollTop;
      state.virtual.lastScrollAt = now;
      if (state.virtual.raf) return;
      state.virtual.raf = requestAnimationFrame(() => {
        state.virtual.raf = 0;
        renderVirtualTable(false);
      });
    });

    el.logTable.addEventListener("click", (event) => {
      const row = event.target.closest("[data-entry-id]");
      if (row) selectEntry(row.dataset.entryId);
    });
    el.contextPane.addEventListener("click", (event) => {
      const row = event.target.closest("[data-context-entry-id]");
      if (row) selectEntry(row.dataset.contextEntryId);
    });
    el.correlationsPane.addEventListener("click", (event) => {
      const row = event.target.closest("[data-context-entry-id]");
      if (row) selectEntry(row.dataset.contextEntryId);
      const filter = event.target.closest("[data-correlation-filter]");
      if (filter) filterByCorrelation(filter.dataset.correlationFilter, filter.dataset.correlationValue);
    });
    el.tracePane.addEventListener("click", (event) => {
      const service = event.target.closest("[data-trace-service]");
      if (service) {
        filterByServiceValue(service.dataset.traceService);
        return;
      }
      const row = event.target.closest("[data-trace-entry-id]");
      if (row) selectEntry(row.dataset.traceEntryId);
    });

    document.querySelectorAll("[data-inspector-tab]").forEach((button) => {
      button.addEventListener("click", () => selectInspectorTab(button.dataset.inspectorTab));
      button.addEventListener("keydown", onInspectorTabKeydown);
    });
    el.closeInspector.addEventListener("click", closeInspector);
    el.copyButton.addEventListener("click", copySelectedRaw);
    el.filterBySourceButton.addEventListener("click", filterBySelectedSource);
    el.filterByServiceButton.addEventListener("click", filterBySelectedService);
    el.exportCaseMarkdownButton?.addEventListener("click", exportCaseMarkdown);
    el.exportCaseJsonButton?.addEventListener("click", exportCaseJson);
    el.importCaseJsonButton?.addEventListener("click", () => el.caseFileInput?.click());
    el.caseFileInput?.addEventListener("change", importCaseJson);

    document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => activateNavView(button.dataset.nav)));

    [el.wrapToggle, el.compactToggle, el.unknownToggle, el.workerToggle, el.autosaveToggle, el.parserProfile, el.customParserPattern, el.customParserFlags].forEach((control) => {
      const eventName = control === el.customParserPattern || control === el.customParserFlags ? "input" : "change";
      control.addEventListener(eventName, persistSettingsFromForm);
    });
    el.parserProfile.addEventListener("change", updateCustomParserVisibility);
    el.savedParserProfile?.addEventListener("change", applySavedParserProfile);
    el.saveParserProfileButton?.addEventListener("click", saveParserProfileFromForm);
    el.deleteParserProfileButton?.addEventListener("click", deleteSelectedParserProfile);
    el.exportParserProfilesButton?.addEventListener("click", exportParserProfiles);
    el.importParserProfilesButton?.addEventListener("click", () => el.parserProfilesFileInput?.click());
    el.parserProfilesFileInput?.addEventListener("change", importParserProfiles);
    el.recoveryRestoreButton.addEventListener("click", restoreRecoverySnapshot);
    el.recoveryDismissButton.addEventListener("click", dismissRecoverySnapshot);
    el.clearRecoveryButton.addEventListener("click", clearRecoverySnapshot);
    el.clearSearchCacheButton?.addEventListener("click", clearSearchCache);
    el.copyDiagnosticsButton?.addEventListener("click", copyDiagnostics);
    bindDialogNavReset(
      el.settingsDialog,
      el.serviceMapDialog,
      el.healthDialog,
      el.serviceMatrixDialog,
      el.serviceHeatmapDialog,
      el.serviceTrendsDialog,
      el.baselineDialog,
      el.projectDialog,
      el.traceExplorerDialog,
      el.traceOutlierDialog,
      el.queryLibraryDialog,
      el.investigationDialog,
      el.exceptionDialog
    );
    el.traceCompareDialog?.addEventListener("close", () => { if (el.traceExplorerDialog?.open) return; setActiveNav("logs"); });
    el.commandPaletteButton?.addEventListener("click", openCommandPalette);
    el.closeCommandPaletteButton?.addEventListener("click", closeCommandPalette);
    el.commandPaletteInput?.addEventListener("input", () => { state.commandPaletteIndex = 0; renderCommandPalette(); });
    el.commandPaletteList?.addEventListener("click", (event) => { const button = event.target.closest("[data-command-id]"); if (button) runCommand(button.dataset.commandId); });
    window.addEventListener("resize", utils().debounce(() => { if (state.renderMode === "virtual") renderTable(); }, 120));

    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (el.commandPaletteDialog?.open) closeCommandPalette(); else openCommandPalette();
        return;
      }
      if (el.commandPaletteDialog?.open) {
        if (event.key === "Escape") { event.preventDefault(); closeCommandPalette(); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const commands = filteredCommands();
          if (commands.length) state.commandPaletteIndex = (state.commandPaletteIndex + (event.key === "ArrowDown" ? 1 : -1) + commands.length) % commands.length;
          renderCommandPalette();
          return;
        }
        if (event.key === "Enter") {
          const commands = filteredCommands();
          if (commands[state.commandPaletteIndex]) { event.preventDefault(); runCommand(commands[state.commandPaletteIndex].id); }
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        el.fileInput.click();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (!el.queryInput.disabled) el.queryInput.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s" && state.entries.length) {
        event.preventDefault();
        saveWorkspace();
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

  async function startLiveTail() {
    if (state.tail.active) {
      stopLiveTail();
      toast("Live tail stopped.");
      return;
    }
    if (typeof window.showOpenFilePicker !== "function") {
      toast("Live tail is not available in this browser. You can still import updated files manually.", "error", 6500);
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: "Log files", accept: { "text/plain": [".log", ".txt", ".jsonl", ".ndjson"] } }]
      });
      const file = await handle.getFile();
      await handleFiles([file]);
      state.tail = { active: true, handle, offset: file.size, timer: null, carry: "", source: file.name };
      updateLiveTailNav();
      toast(`Live tail started for ${file.name}.`);
      scheduleTailPoll();
    } catch (error) {
      if (error?.name !== "AbortError") toast(`Could not start live tail: ${error.message || error}`, "error", 6500);
    }
  }

  function stopLiveTail() {
    if (state.tail.timer) clearTimeout(state.tail.timer);
    state.tail.active = false;
    state.tail.timer = null;
    updateLiveTailNav();
  }

  function updateLiveTailNav() {
    const button = document.querySelector('[data-nav="live"]');
    if (!button) return;
    button.classList.toggle("is-live", state.tail.active);
    const label = button.querySelector("span");
    if (label) label.textContent = state.tail.active ? "Stop live tail" : "Live tail";
  }

  function scheduleTailPoll() {
    if (!state.tail.active) return;
    state.tail.timer = setTimeout(pollLiveTail, 1400);
  }

  async function pollLiveTail() {
    if (!state.tail.active || !state.tail.handle) return;
    try {
      const file = await state.tail.handle.getFile();
      if (file.size < state.tail.offset) {
        state.tail.offset = 0;
        state.tail.carry = "";
        toast(`${file.name} was truncated; live tail restarted from the beginning.`);
      }
      if (file.size > state.tail.offset) {
        const start = state.tail.offset;
        const chunk = await file.slice(start, file.size).text();
        state.tail.offset = file.size;
        const combined = state.tail.carry + chunk;
        const lines = combined.split(/\r?\n/);
        state.tail.carry = lines.pop() || "";
        const complete = lines.join("\n");
        if (complete.trim()) {
          const parsed = window.SignalDockParser.parseText(complete, state.tail.source, state.settings.parserProfile || "auto", currentCustomParserProfile());
          appendParsedEntries(parsed);
          state.loadedBytes += file.size - start;
          rebuildFilterIndex();
          refreshFilters();
          syncWorkerIndex();
          applyFilters(false);
          markDatasetForAutosave();
        }
      }
    } catch (error) {
      stopLiveTail();
      toast(`Live tail stopped: ${error.message || error}`, "error", 6500);
      return;
    }
    scheduleTailPoll();
  }

  function appendParsedEntries(parsed) {
    state.baselineComparison = null;
    if (el.baselineChangeCount) el.baselineChangeCount.textContent = "0";
    const base = state.entries.length;
    parsed.forEach((entry, offset) => {
      entry.globalIndex = base + offset;
      entry.id = `sd-${entry.globalIndex}`;
    });
    state.entries.push(...parsed);
  }

  function hasFileDrag(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  function projectDatasetId(file) { return `${file?.name || "dataset"}-${Math.max(0, Number(file?.size) || 0)}-${Math.max(0, Number(file?.lastModified) || 0)}`; }

  async function handleFiles(fileList, options = {}) {
    const files = Array.from(fileList || []);
    if (!files.length) return { added: 0, failed: 0, loadedIds: [] };
    const projectLinks = new Map((Array.isArray(options.projectItems) ? options.projectItems : []).filter((item) => item?.file).map((item) => [item.file, item]));
    const loadedProjectIds = [];
    const sessionFiles = files.filter((file) => file.name.toLowerCase().endsWith(".sdsession"));
    if (sessionFiles.length) {
      if (files.length !== 1) {
        toast("Open a .sdsession workspace by itself; do not mix it with log imports.", "error", 6500);
        el.fileInput.value = "";
        return;
      }
      await restoreWorkspace(sessionFiles[0]);
      el.fileInput.value = "";
      return;
    }

    setProcessing(true, "Processing logs…", `${files.length} file${files.length === 1 ? "" : "s"} selected`);
    let added = 0;
    let failed = 0;
    const projectFiles = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        try {
          const finishParseProfile = profiler()?.start?.("parse", { file: file.name, bytes: file.size });
          const parsed = await window.SignalDockParser.parseFile(file, (progress) => {
            const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
            setProcessing(true, "Processing logs…", `${index + 1}/${files.length} · ${file.name} · ${percent}%`);
          }, { profile: state.settings.parserProfile || "auto", customProfile: currentCustomParserProfile() });
          finishParseProfile?.({ entries: parsed.length, profile: state.settings.parserProfile || "auto" });
          appendParsedEntries(parsed);
          state.loadedBytes += file.size;
          state.inputFileCount += 1;
          added += parsed.length;
          const linked = projectLinks.get(file) || {}; const historyId = linked.historyId || projectDatasetId(file); projectFiles.push({ id: historyId, name: file.name, size: file.size, handleRef: linked.handleRef || "", handleKind: linked.handleRef ? "file" : "" }); loadedProjectIds.push(historyId);
        } catch (error) {
          failed += 1;
          toast(`${file.name}: ${error.message || error}`, "error", 7000);
        }
        await nextFrame();
      }
    } finally {
      setProcessing(false);
      el.fileInput.value = "";
    }

    if (added) {
      if (state.activeProjectId && window.SignalDockProjectManager?.touchDataset) { for (const fileMeta of projectFiles) state.projects = window.SignalDockProjectManager.touchDataset(state.projects, state.activeProjectId, fileMeta); projectController?.render(); }
      rebuildFilterIndex();
      refreshFilters();
      setControlsEnabled(true);
      syncWorkerIndex();
      applyFilters(true);
      const profileLabel = state.settings.parserProfile && state.settings.parserProfile !== "auto" ? ` · ${state.settings.parserProfile} profile` : "";
      toast(`Loaded ${added.toLocaleString()} log entries${profileLabel}${failed ? ` · ${failed} file(s) skipped` : ""}.`);
      markDatasetForAutosave();
    } else if (!state.entries.length) {
      renderEverything();
    }
    return { added, failed, loadedIds: loadedProjectIds };
  }

  function rebuildFilterIndex() {
    let latest = null;
    let errors = 0;
    let warnings = 0;
    const sourceCounts = new Map();
    const serviceCounts = new Map();
    state.filterEntries = state.entries.map((entry) => {
      const timestampMs = Number.isFinite(entry.timestampMs) ? entry.timestampMs : (() => {
        const parsed = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
        return Number.isNaN(parsed) ? null : parsed;
      })();
      if (timestampMs !== null && (latest === null || timestampMs > latest)) latest = timestampMs;
      if (entry.level === "ERROR" || entry.level === "FATAL") errors += 1;
      else if (entry.level === "WARN") warnings += 1;
      sourceCounts.set(entry.source, (sourceCounts.get(entry.source) || 0) + 1);
      if (entry.service && entry.service !== "—") serviceCounts.set(entry.service, (serviceCounts.get(entry.service) || 0) + 1);
      const exceptionFingerprint = window.SignalDockExceptionGroups?.candidate?.(entry) ? window.SignalDockExceptionGroups.fingerprint(entry) : "";
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
  }

  function currentFilterRequest() {
    return {
      query: el.queryInput.value.trim(),
      parsed: engine().parseSmartQuery(el.queryInput.value.trim()),
      level: el.levelFilter.value,
      source: el.sourceFilter.value,
      timeRange: el.timeFilter.value,
      sortMode: el.sortFilter.value,
      showUnknown: state.settings.showUnknown !== false,
      referenceTime: state.latestTimestampMs || 0
    };
  }

  function applyFilters(resetPage) {
    const request = currentFilterRequest();
    state.filterRequestId += 1;
    const requestId = state.filterRequestId;
    const useWorker = state.settings.useWorker !== false && state.workerReady && state.entries.length >= WORKER_THRESHOLD;
    if (useWorker) {
      state.lastEngine = "worker";
      el.resultsSummary.textContent = "Filtering in background…";
      document.body.classList.add("filtering-active");
      state.worker.postMessage({ type: "filter", protocol: 1, token: state.workerToken, requestId, request });
      if (resetPage) state.page = 1;
      return;
    }

    const started = performance.now();
    const result = engine().filterIndexes(state.filterEntries, request);
    const elapsed = Math.round((performance.now() - started) * 10) / 10;
    state.lastEngine = `main · ${elapsed} ms`;
    profiler()?.record?.("filter", elapsed, { engine: "main", entries: state.entries.length });
    applyFilteredIndexes(result.indexes, result.parsed.invalid, resetPage);
  }

  function applyFilteredIndexes(indexes, invalidTokens, resetPage) {
    state.filteredIndexes = Array.isArray(indexes) ? indexes : [];
    if (resetPage) {
      state.page = 1;
      if (state.renderMode === "virtual" && el.logTable) el.logTable.scrollTop = 0;
    }
    ensurePageInRange();
    document.body.classList.remove("filtering-active");
    updateQueryValidity(invalidTokens);
    renderDataViews();
    scheduleViewAutosave();
  }

  function updateQueryValidity(invalidTokens) {
    const invalid = Array.isArray(invalidTokens) ? invalidTokens : [];
    el.queryInput.classList.toggle("has-query-error", invalid.length > 0);
    el.queryInput.title = invalid.length ? `Could not parse: ${invalid.join(", ")}` : "Smart query: level:error source:api env:prod namespace:payments trace:abc any:timeout,retry re:/ETIMEDOUT|ECONNRESET/i";
  }

  function resetFilters() {
    el.queryInput.value = "";
    el.levelFilter.value = "";
    el.sourceFilter.value = "";
    el.timeFilter.value = "";
    el.sortFilter.value = "original";
    syncLevelChips("");
    applyFilters(true);
  }

  function setControlsEnabled(enabled) {
    [el.queryInput, el.levelFilter, el.sourceFilter, el.timeFilter, el.sortFilter, el.saveViewButton, el.resetButton, el.exportButton, el.workspaceSaveButton, el.clearAllButton, el.pageSize, el.renderMode]
      .forEach((control) => { if (control) control.disabled = !enabled; });
  }

  function refreshFilters() {
    const current = el.sourceFilter.value;
    const sources = getSources();
    el.sourceFilter.replaceChildren(new Option("All sources", ""), ...sources.map((source) => new Option(utils().shortSource(source), source)));
    if (sources.includes(current)) el.sourceFilter.value = current;
    updateStats();
    renderSourceNavigation();
  }

  function getSources() {
    return state.summary.sources || [];
  }

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

  function updateStats() {
    const { total, errors, warnings, sources } = state.summary;
    el.metricEntries.textContent = total.toLocaleString();
    el.metricErrors.textContent = errors.toLocaleString();
    el.metricWarnings.textContent = warnings.toLocaleString();
    el.metricSources.textContent = sources.length.toLocaleString();
    el.chipErrors.textContent = errors.toLocaleString();
    el.chipWarnings.textContent = warnings.toLocaleString();
    el.navLogCount.textContent = total ? total.toLocaleString() : "0";
    if (el.serviceMapCount) el.serviceMapCount.textContent = (state.summary.services || []).length.toLocaleString();
    if (el.serviceMatrixCount) el.serviceMatrixCount.textContent = (state.serviceMatrixData?.rows?.length || 0).toLocaleString();
    if (el.serviceHeatmapCount) el.serviceHeatmapCount.textContent = (state.serviceHeatmapData?.rows?.length || 0).toLocaleString();
    if (el.serviceTrendsCount) el.serviceTrendsCount.textContent = (state.serviceTrendsData?.summary?.changed || 0).toLocaleString();
    if (el.traceExplorerCount) el.traceExplorerCount.textContent = (state.traceExplorerData?.summary?.traces || state.traceExplorerData?.rows?.length || 0).toLocaleString();
    if (el.traceOutlierCount) el.traceOutlierCount.textContent = (state.traceOutlierData?.rows?.length || 0).toLocaleString();
    if (el.investigationCount) el.investigationCount.textContent = (state.investigation?.items?.length || 0).toLocaleString();
    if (el.exceptionGroupCount) el.exceptionGroupCount.textContent = (state.exceptionGroups?.length || 0).toLocaleString();
    if (el.healthIssueCount) { const health = state.healthData?.summary || {}; el.healthIssueCount.textContent = ((health.critical || 0) + (health.degraded || 0)).toLocaleString(); }
    el.loadedMeta.textContent = total ? `${state.inputFileCount} file${state.inputFileCount === 1 ? "" : "s"} · ${utils().formatBytes(state.loadedBytes)}` : "No files loaded";
  }

  function renderSourceNavigation() {
    const sources = getSources();
    el.sourceList.replaceChildren();
    el.fileTabs.replaceChildren();

    const allTab = document.createElement("button");
    allTab.type = "button";
    allTab.className = "file-tab";
    allTab.dataset.source = "";
    allTab.textContent = "All logs";
    el.fileTabs.appendChild(allTab);

    if (!sources.length) {
      const empty = document.createElement("div");
      empty.className = "sidebar-empty";
      empty.textContent = "No files loaded";
      el.sourceList.appendChild(empty);
      return;
    }

    const counts = state.summary.sourceCounts || new Map();
    sources.forEach((source) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "source-button";
      button.dataset.source = source;
      const dot = document.createElement("span"); dot.className = "source-dot";
      const name = document.createElement("span"); name.textContent = utils().shortSource(source); name.title = source;
      const count = document.createElement("em"); count.textContent = counts.get(source).toLocaleString();
      button.append(dot, name, count);
      el.sourceList.appendChild(button);

      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "file-tab";
      tab.dataset.source = source;
      tab.textContent = utils().shortSource(source);
      tab.title = source;
      el.fileTabs.appendChild(tab);
    });
  }

  function updateActiveSourceUI() {
    const source = el.sourceFilter.value;
    document.querySelectorAll(".source-button[data-source], .file-tab[data-source]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.source === source);
    });
  }

  function renderTimeline() {
    el.timelineBars.replaceChildren();
    let timestampedCount = 0;
    let min = null;
    let max = null;
    for (const index of state.filteredIndexes) {
      const entry = state.entries[index];
      if (!entry || !Number.isFinite(entry.timestampMs)) continue;
      timestampedCount += 1;
      min = min === null ? entry.timestampMs : Math.min(min, entry.timestampMs);
      max = max === null ? entry.timestampMs : Math.max(max, entry.timestampMs);
    }
    if (!timestampedCount || min === null || max === null) {
      const empty = document.createElement("div");
      empty.className = "timeline-empty";
      empty.textContent = state.entries.length ? "No timestamps detected in the current result set." : "Load timestamped logs to see activity over time.";
      el.timelineBars.appendChild(empty);
      el.timelineStart.textContent = "—";
      el.timelineEnd.textContent = "—";
      el.timelineMeta.textContent = `${state.filteredIndexes.length.toLocaleString()} results · ${state.lastEngine}`;
      return;
    }

    const span = Math.max(1, max - min);
    const buckets = Array.from({ length: TIMELINE_BUCKETS }, () => ({ count: 0, errors: 0, warnings: 0 }));
    for (const index of state.filteredIndexes) {
      const entry = state.entries[index];
      if (!entry || !Number.isFinite(entry.timestampMs)) continue;
      const bucketIndex = Math.min(TIMELINE_BUCKETS - 1, Math.floor(((entry.timestampMs - min) / span) * TIMELINE_BUCKETS));
      const bucket = buckets[bucketIndex];
      bucket.count += 1;
      if (entry.level === "ERROR" || entry.level === "FATAL") bucket.errors += 1;
      else if (entry.level === "WARN") bucket.warnings += 1;
    }
    const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
    const fragment = document.createDocumentFragment();
    buckets.forEach((bucket, index) => {
      const bar = document.createElement("div");
      bar.className = `timeline-bar${bucket.errors ? " has-error" : bucket.warnings ? " has-warn" : ""}`;
      bar.title = `${bucket.count.toLocaleString()} entries${bucket.errors ? ` · ${bucket.errors} errors` : ""}${bucket.warnings ? ` · ${bucket.warnings} warnings` : ""}`;
      bar.setAttribute("aria-label", bar.title);
      const activeSegments = bucket.count ? Math.max(1, Math.round((bucket.count / maxCount) * TIMELINE_SEGMENTS)) : 0;
      for (let segment = 0; segment < TIMELINE_SEGMENTS; segment += 1) {
        const cell = document.createElement("i");
        cell.className = `timeline-segment${segment < activeSegments ? " is-on" : ""}`;
        bar.appendChild(cell);
      }
      fragment.appendChild(bar);
      if (index === TIMELINE_BUCKETS - 1) bar.classList.add("is-last");
    });
    el.timelineBars.appendChild(fragment);
    el.timelineStart.textContent = formatTimelineTime(min);
    el.timelineEnd.textContent = formatTimelineTime(max);
    el.timelineTitle.textContent = state.filteredIndexes.length === state.entries.length ? "All activity" : "Filtered activity";
    el.timelineMeta.textContent = `${timestampedCount.toLocaleString()} timestamped · ${state.filteredIndexes.length.toLocaleString()} results · ${state.lastEngine}`;
  }

  function formatTimelineTime(ms) {
    const date = new Date(ms);
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  function renderTable() {
    if (state.renderMode === "virtual" && canUseVirtualTable()) {
      renderVirtualTable(false);
      return;
    }
    document.body.classList.remove("virtual-log-view");
    el.logTable.classList.remove("is-virtual");
    renderPagedTable();
  }

  function renderPagedTable() {
    const renderStarted = performance.now();
    el.logTable.replaceChildren();
    const total = state.filteredIndexes.length;
    ensurePageInRange();

    if (!state.entries.length) {
      el.logTable.appendChild(emptyTable("No logs loaded", "Import JSON, NDJSON, LOG, TXT or ZIP files. SignalDock processes everything locally in your browser."));
      updatePagination(0);
      return;
    }
    if (!total) {
      el.logTable.appendChild(emptyTable("No matching entries", "Try a broader query or reset your active level, source, time, or query filters."));
      updatePagination(0);
      return;
    }

    const start = (state.page - 1) * state.pageSize;
    const end = Math.min(start + state.pageSize, total);
    const pageIndexes = state.filteredIndexes.slice(start, end);
    const generation = ++state.renderGeneration;
    const chunkSize = state.pageSize >= 500 ? 125 : pageIndexes.length;
    const appendChunk = (offset) => {
      if (generation !== state.renderGeneration) return;
      const fragment = document.createDocumentFragment();
      const limit = Math.min(offset + chunkSize, pageIndexes.length);
      for (let i = offset; i < limit; i += 1) {
        const entry = state.entries[pageIndexes[i]];
        if (entry) fragment.appendChild(buildLogRow(entry));
      }
      el.logTable.appendChild(fragment);
      if (limit < pageIndexes.length) requestAnimationFrame(() => appendChunk(limit));
      else profiler()?.record?.("table-render", performance.now() - renderStarted, { rows: pageIndexes.length, pageSize: state.pageSize, mode: "paged" });
    };
    appendChunk(0);
    el.resultsSummary.textContent = `Showing ${start + 1}–${end} of ${total.toLocaleString()} matching entries · ${state.lastEngine}`;
    updatePagination(total);
  }

  function canUseVirtualTable() {
    return !state.settings.wrap && window.innerWidth >= 780;
  }

  function setVirtualSpacerHeights(topPx, bottomPx) {
    try {
      if (!virtualSpacerRules) {
        let topRule = null;
        let bottomRule = null;
        for (const sheet of Array.from(document.styleSheets)) {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule.selectorText === ".virtual-spacer--top") topRule = rule;
            if (rule.selectorText === ".virtual-spacer--bottom") bottomRule = rule;
          }
        }
        if (!topRule || !bottomRule) return false;
        virtualSpacerRules = { topRule, bottomRule };
      }
      virtualSpacerRules.topRule.style.height = `${Math.max(0, Math.round(topPx))}px`;
      virtualSpacerRules.bottomRule.style.height = `${Math.max(0, Math.round(bottomPx))}px`;
      return true;
    } catch { return false; }
  }

  function renderVirtualTable(resetScroll = false) {
    const renderStarted = performance.now();
    const total = state.filteredIndexes.length;
    document.body.classList.add("virtual-log-view");
    el.logTable.classList.add("is-virtual");
    if (resetScroll) el.logTable.scrollTop = 0;

    if (!state.entries.length || !total) {
      el.logTable.replaceChildren(emptyTable(state.entries.length ? "No matching entries" : "No logs loaded", state.entries.length ? "Try a broader query or reset the active filters." : "Import logs to begin local analysis."));
      updatePagination(0);
      return;
    }

    const rowHeight = state.settings.compact ? 37 : 46;
    const viewport = window.SignalDockVirtualViewport?.calculate?.({
      total, rowHeight, viewportHeight: Math.max(el.logTable.clientHeight || 0, 420),
      scrollTop: el.logTable.scrollTop, overscan: state.virtual.overscan, maxScrollPx: MAX_VIRTUAL_SCROLL_PX
    });
    if (!viewport) { state.renderMode = "paged"; renderPagedTable(); return; }
    state.virtual.rowHeight = rowHeight;
    state.virtual.pitch = viewport.pitch;
    state.virtual.compressed = viewport.compressed;
    const start = viewport.start;
    const end = viewport.end;
    state.virtual.start = start;
    state.virtual.end = end;

    const topSpacer = document.createElement("div");
    topSpacer.className = "virtual-spacer virtual-spacer--top";
    topSpacer.setAttribute("aria-hidden", "true");
    const bottomSpacer = document.createElement("div");
    bottomSpacer.className = "virtual-spacer virtual-spacer--bottom";
    bottomSpacer.setAttribute("aria-hidden", "true");
    const cssReady = setVirtualSpacerHeights(viewport.topSpacerPx, viewport.bottomSpacerPx);
    if (!cssReady) {
      state.renderMode = "paged";
      if (el.renderMode) el.renderMode.value = "paged";
      document.body.classList.remove("virtual-log-view");
      el.logTable.classList.remove("is-virtual");
      renderPagedTable();
      return;
    }

    const fragment = document.createDocumentFragment();
    fragment.appendChild(topSpacer);
    for (let position = start; position < end; position += 1) {
      const entry = state.entries[state.filteredIndexes[position]];
      if (entry) fragment.appendChild(buildLogRow(entry));
    }
    fragment.appendChild(bottomSpacer);
    el.logTable.replaceChildren(fragment);
    el.resultsSummary.textContent = `Window ${start + 1}–${end} of ${total.toLocaleString()} matching entries · ${state.lastEngine}`;
    el.pageLabel.textContent = "Windowed";
    el.prevPage.disabled = true;
    el.nextPage.disabled = true;
    el.pageSize.disabled = true;
    profiler()?.record?.("table-render", performance.now() - renderStarted, { rows: end - start, total, mode: "virtual" });
  }

  function buildLogRow(entry) {
    const row = document.createElement("div");
    row.className = `log-row${state.selectedId === entry.id ? " is-selected" : ""}`;
    row.dataset.entryId = entry.id;
    row.tabIndex = 0;

    const time = document.createElement("span");
    time.className = "log-row__time";
    time.textContent = utils().formatTime(entry.timestamp);
    time.title = entry.timestamp || "No timestamp detected";

    const level = document.createElement("span");
    level.className = `level-badge level-${entry.level}`;
    level.textContent = entry.level;

    const source = document.createElement("span");
    source.className = "log-row__source";
    source.textContent = entry.service !== "—" ? entry.service : utils().shortSource(entry.source);
    source.title = entry.service !== "—" ? `${entry.service} · ${entry.source}` : entry.source;

    const message = document.createElement("span");
    message.className = "log-row__message";
    message.textContent = entry.message || "(empty message)";
    message.title = entry.message || "";

    const menu = document.createElement("span");
    menu.className = "row-menu";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "icon"); icon.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "assets/icons.svg#chevron");
    icon.appendChild(use); menu.appendChild(icon);

    row.append(time, level, source, message, menu);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectEntry(entry.id); }
    });
    return row;
  }

  function emptyTable(title, text) {
    const wrap = document.createElement("div");
    wrap.className = "empty-table";
    const iconWrap = document.createElement("span"); iconWrap.className = "empty-table__icon";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); icon.setAttribute("class", "icon"); icon.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", "assets/icons.svg#terminal"); icon.appendChild(use); iconWrap.appendChild(icon);
    const strong = document.createElement("strong"); strong.textContent = title;
    const p = document.createElement("p"); p.textContent = text;
    wrap.append(iconWrap, strong, p);
    return wrap;
  }

  function updatePagination(total) {
    if (state.renderMode === "virtual" && canUseVirtualTable()) {
      el.pageLabel.textContent = total ? "Windowed" : "—";
      el.prevPage.disabled = true;
      el.nextPage.disabled = true;
      el.pageSize.disabled = true;
      if (!total) el.resultsSummary.textContent = state.entries.length ? `0 matching entries · ${state.lastEngine}` : "Load logs to begin";
      return;
    }
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    el.pageLabel.textContent = `${state.page} / ${pages}`;
    el.prevPage.disabled = !total || state.page <= 1;
    el.nextPage.disabled = !total || state.page >= pages;
    el.pageSize.disabled = !state.entries.length;
    if (!total) el.resultsSummary.textContent = state.entries.length ? `0 matching entries · ${state.lastEngine}` : "Load logs to begin";
  }

  function ensurePageInRange() {
    const pages = Math.max(1, Math.ceil(state.filteredIndexes.length / state.pageSize));
    state.page = Math.max(1, Math.min(state.page, pages));
  }

  function setPage(page) {
    if (state.renderMode === "virtual" && canUseVirtualTable()) return;
    const pages = Math.max(1, Math.ceil(state.filteredIndexes.length / state.pageSize));
    state.page = Math.max(1, Math.min(page, pages));
    renderTable();
    el.logTable.scrollTop = 0;
    scheduleViewAutosave();
  }

  function selectedEntry() {
    if (!state.selectedId) return null;
    const match = /^sd-(\d+)$/.exec(state.selectedId);
    if (match) return state.entries[Number(match[1])] || null;
    return state.entries.find((entry) => entry.id === state.selectedId) || null;
  }

  function selectEntry(id) {
    state.selectedId = id;
    state.correlatedIndexes = [];
    state.correlationEngine = "loading";
    state.traceIndexes = [];
    state.traceEngine = "loading";
    renderTable();
    renderInspector();
    const entry = selectedEntry();
    loadCorrelations(entry);
    loadTrace(entry);
    scheduleViewAutosave();
  }

  function closeInspector() {
    state.selectedId = null;
    state.correlatedIndexes = [];
    state.correlationEngine = "idle";
    state.traceIndexes = [];
    state.traceEngine = "idle";
    renderTable();
    renderInspector();
    scheduleViewAutosave();
  }

  function renderInspector() {
    const entry = selectedEntry();
    el.inspector.classList.toggle("has-selection", Boolean(entry));
    el.inspectorEmpty.hidden = Boolean(entry);
    el.inspectorContent.hidden = !entry;
    if (!entry) return;

    el.inspectorLevel.className = `level-badge level-${entry.level}`;
    el.inspectorLevel.textContent = entry.level;
    el.inspectorTime.textContent = utils().formatTime(entry.timestamp);
    el.inspectorMessage.textContent = entry.message || "(empty message)";
    const metaPills = [
      metaPill("source", utils().shortSource(entry.source)),
      metaPill("service", entry.service),
      metaPill("entry", String(entry.index + 1))
    ];
    if (entry.exceptionFingerprint) metaPills.push(metaPill("exception", entry.exceptionFingerprint));
    el.inspectorMeta.replaceChildren(...metaPills);

    renderDetailsPane(entry);
    renderContextPane(entry);
    renderCorrelationsPane(entry);
    renderTracePane(entry);
    el.rawPane.textContent = utils().safeStringify(entry.raw);
    el.jsonPane.textContent = utils().safeStringify({
      timestamp: entry.timestamp,
      level: entry.level,
      service: entry.service,
      source: entry.source,
      message: entry.message,
      correlations: entry.correlations || {},
      traceMeta: entry.traceMeta || {},
      dimensions: entry.dimensions || {},
      exceptionFingerprint: entry.exceptionFingerprint || "",
      raw: entry.raw
    });
    el.filterByServiceButton.disabled = !entry.service || entry.service === "—";
    if (el.addEvidenceButton) el.addEvidenceButton.disabled = Boolean(state.investigation?.items?.some((item) => item.entryId === entry.id));
    renderInspectorTab();
  }

  function metaPill(label, value) {
    const pill = document.createElement("span");
    pill.className = "meta-pill";
    const b = document.createElement("b"); b.textContent = `${label}:`;
    pill.append(b, document.createTextNode(` ${value || "—"}`));
    return pill;
  }

  function renderDetailsPane(entry) {
    const dl = document.createElement("dl");
    dl.className = "detail-list";
    const normalized = [
      ["Timestamp", entry.timestamp || "—"],
      ["Level", entry.level],
      ["Service", entry.service],
      ["Source", entry.source],
      ["Index", entry.index + 1],
      ...(entry.dimensions?.environment ? [["Environment", entry.dimensions.environment]] : []),
      ...(entry.dimensions?.namespace ? [["Namespace", entry.dimensions.namespace]] : []),
      ...Object.entries(entry.correlations || {}).map(([kind, value]) => [`${kind} ID`, value])
    ];
    normalized.forEach(([key, value]) => dl.appendChild(detailRow(key, value)));

    if (entry.raw && typeof entry.raw === "object" && !Array.isArray(entry.raw)) {
      flattenObject(entry.raw).slice(0, 36).forEach(([key, value]) => {
        if (["message", "msg", "level", "timestamp", "time"].includes(key.toLowerCase())) return;
        dl.appendChild(detailRow(key, compactValue(value)));
      });
    }
    el.detailsPane.replaceChildren(dl);
  }

  function flattenObject(value, prefix = "", depth = 0, output = []) {
    if (!value || typeof value !== "object" || depth > 2) return output;
    for (const [key, item] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (item && typeof item === "object" && !Array.isArray(item)) flattenObject(item, path, depth + 1, output);
      else output.push([path, item]);
      if (output.length >= 60) break;
    }
    return output;
  }

  function renderContextPane(entry) {
    const wrap = document.createElement("div");
    wrap.className = "context-view";
    const nearby = nearbySourceEntries(entry, 3);

    const nearbyTitle = document.createElement("div");
    nearbyTitle.className = "context-title";
    nearbyTitle.textContent = "Nearby entries";
    wrap.appendChild(nearbyTitle);
    if (!nearby.length) {
      const empty = document.createElement("p"); empty.className = "context-empty"; empty.textContent = "No nearby entries available."; wrap.appendChild(empty);
    } else {
      nearby.forEach((item) => wrap.appendChild(contextRow(item, item.id === entry.id)));
    }

    const related = nearbyServiceEntries(entry, 5);
    const relatedTitle = document.createElement("div");
    relatedTitle.className = "context-title context-title--spaced";
    relatedTitle.textContent = `Related service · ${entry.service}`;
    wrap.appendChild(relatedTitle);
    if (!related.length) {
      const empty = document.createElement("p"); empty.className = "context-empty"; empty.textContent = "No related service entries found."; wrap.appendChild(empty);
    } else related.forEach((item) => wrap.appendChild(contextRow(item, false)));

    el.contextPane.replaceChildren(wrap);
  }

  function nearbySourceEntries(entry, radius) {
    const index = Number.isFinite(entry.globalIndex) ? entry.globalIndex : state.entries.indexOf(entry);
    if (index < 0) return [entry];
    const before = [];
    const after = [];
    for (let i = index - 1; i >= 0 && before.length < radius; i -= 1) {
      const candidate = state.entries[i];
      if (candidate.source !== entry.source) break;
      before.push(candidate);
    }
    for (let i = index + 1; i < state.entries.length && after.length < radius; i += 1) {
      const candidate = state.entries[i];
      if (candidate.source !== entry.source) break;
      after.push(candidate);
    }
    return before.reverse().concat(entry, after);
  }

  function nearbyServiceEntries(entry, limit) {
    if (!entry.service || entry.service === "—") return [];
    const origin = Number.isFinite(entry.globalIndex) ? entry.globalIndex : state.entries.indexOf(entry);
    if (origin < 0) return [];
    const matches = [];
    const maxDistance = Math.min(state.entries.length, 50000);
    for (let distance = 1; distance < maxDistance && matches.length < limit; distance += 1) {
      const left = origin - distance;
      const right = origin + distance;
      if (left >= 0 && state.entries[left].service === entry.service) matches.push(state.entries[left]);
      if (matches.length >= limit) break;
      if (right < state.entries.length && state.entries[right].service === entry.service) matches.push(state.entries[right]);
      if (left < 0 && right >= state.entries.length) break;
    }
    return matches.sort((a, b) => timeDistance(a, entry) - timeDistance(b, entry));
  }

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

  function renderCorrelationsPane(entry) {
    if (!el.correlationsPane) return;
    const wrap = document.createElement("div");
    wrap.className = "correlation-view";
    if (!entry) { el.correlationsPane.replaceChildren(wrap); return; }

    const correlations = Object.entries(entry.correlations || {});
    const title = document.createElement("div");
    title.className = "context-title";
    title.textContent = "Detected identifiers";
    wrap.appendChild(title);

    if (!correlations.length) {
      const empty = document.createElement("p");
      empty.className = "context-empty";
      empty.textContent = "No trace, request, job, session or user identifiers were detected in this entry.";
      wrap.appendChild(empty);
      el.correlationsPane.replaceChildren(wrap);
      return;
    }

    const chips = document.createElement("div");
    chips.className = "correlation-chips";
    correlations.forEach(([kind, value]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "correlation-chip";
      button.dataset.correlationFilter = kind;
      button.dataset.correlationValue = value;
      const strong = document.createElement("strong"); strong.textContent = kind;
      const span = document.createElement("span"); span.textContent = value; span.title = value;
      button.append(strong, span);
      chips.appendChild(button);
    });
    wrap.appendChild(chips);

    const relatedTitle = document.createElement("div");
    relatedTitle.className = "context-title context-title--spaced";
    const related = state.correlatedIndexes.map((index) => state.entries[index]).filter((item) => item && item.id !== entry.id);
    relatedTitle.textContent = `Correlated entries · ${related.length}${state.correlatedIndexes.length >= 200 ? "+" : ""}`;
    wrap.appendChild(relatedTitle);

    if (related.length) {
      const matchSummary = document.createElement("div");
      matchSummary.className = "correlation-match-summary";
      correlations.forEach(([kind, value]) => {
        const count = related.reduce((sum, item) => sum + (item.correlations?.[kind] === value ? 1 : 0), 0);
        if (!count) return;
        const badge = document.createElement("span");
        const strong = document.createElement("strong"); strong.textContent = kind;
        const amount = document.createElement("em"); amount.textContent = `${count} match${count === 1 ? "" : "es"}`;
        badge.append(strong, amount);
        matchSummary.appendChild(badge);
      });
      if (matchSummary.childElementCount) wrap.appendChild(matchSummary);
    }

    if (state.correlationEngine.includes("searching")) {
      const pending = document.createElement("p"); pending.className = "context-empty"; pending.textContent = "Searching correlations in the background…"; wrap.appendChild(pending);
    } else if (!related.length) {
      const empty = document.createElement("p"); empty.className = "context-empty"; empty.textContent = "No other entries share these identifiers."; wrap.appendChild(empty);
    } else {
      related.slice(0, 60).forEach((item) => wrap.appendChild(contextRow(item, false)));
    }

    const meta = document.createElement("p");
    meta.className = "correlation-meta";
    meta.textContent = `Correlation engine: ${state.correlationEngine}`;
    wrap.appendChild(meta);
    el.correlationsPane.replaceChildren(wrap);
  }

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

  function renderTracePane(entry) {
    if (!el.tracePane) return;
    const wrap = document.createElement("div");
    wrap.className = "trace-view";
    const traceId = entry?.correlations?.trace;
    if (!entry || !traceId) {
      const empty = document.createElement("div");
      empty.className = "trace-empty";
      const strong = document.createElement("strong"); strong.textContent = "No trace detected";
      const text = document.createElement("p"); text.textContent = "Trace visualization appears when entries contain a trace ID. Span and parent-span IDs improve the waterfall hierarchy.";
      empty.append(strong, text);
      wrap.appendChild(empty);
      el.tracePane.replaceChildren(wrap);
      return;
    }

    const indexes = Array.from(new Set([entry.globalIndex, ...state.traceIndexes])).filter((index) => Number.isInteger(index));
    const traceEntries = indexes.map((index) => state.entries[index]).filter((item) => item && item.correlations?.trace === traceId);
    traceEntries.sort((a, b) => {
      const at = Number.isFinite(a.timestampMs) ? a.timestampMs : Number.MAX_SAFE_INTEGER;
      const bt = Number.isFinite(b.timestampMs) ? b.timestampMs : Number.MAX_SAFE_INTEGER;
      return at - bt || a.globalIndex - b.globalIndex;
    });

    const header = document.createElement("div");
    header.className = "trace-summary";
    const title = document.createElement("div");
    const eyebrow = document.createElement("span"); eyebrow.textContent = "TRACE";
    const code = document.createElement("code"); code.textContent = traceId; code.title = traceId;
    title.append(eyebrow, code);
    const stats = document.createElement("div");
    const services = new Set(traceEntries.map((item) => item.service).filter((value) => value && value !== "—"));
    const errors = traceEntries.filter((item) => item.level === "ERROR" || item.level === "FATAL").length;
    stats.textContent = `${traceEntries.length.toLocaleString()} entries · ${services.size} services · ${errors} errors`;
    header.append(title, stats);
    wrap.appendChild(header);

    const traceInsights = window.SignalDockTraceInsights?.analyze?.(traceEntries) || null;
    if (traceInsights?.spans) {
      const insightCard = document.createElement("section"); insightCard.className = "trace-insights-card";
      const insightHead = document.createElement("div"); const insightTitle = document.createElement("strong"); insightTitle.textContent = "TRACE QUALITY"; const insightMeta = document.createElement("span"); insightMeta.textContent = `${traceInsights.spans} spans · ${traceInsights.events} log events`; insightHead.append(insightTitle, insightMeta);
      const insightGrid = document.createElement("div"); insightGrid.className = "trace-insights-grid";
      [["Parent coverage", `${Math.round(traceInsights.parentCoverage * 100)}%`], ["Root spans", traceInsights.roots], ["Orphan spans", traceInsights.orphans], ["Error spans", traceInsights.errorSpans], ["Timed spans", traceInsights.timedSpans], ["Span events", traceInsights.spanEvents], ["Instrumentation scopes", traceInsights.scopes.length], ["Resource sets", traceInsights.resourceSets]].forEach(([label, value]) => { const item = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = String(value); const span = document.createElement("span"); span.textContent = label; item.append(strong, span); insightGrid.appendChild(item); });
      const insightNote = document.createElement("p"); insightNote.textContent = traceInsights.orphans ? `${traceInsights.orphans} span${traceInsights.orphans === 1 ? " has" : "s have"} a parent ID that is not present in the loaded trace context.` : "All parent references visible in this trace resolve to loaded spans.";
      insightCard.append(insightHead, insightGrid, insightNote); wrap.appendChild(insightCard);
    }

    const otel = entry.traceMeta?.otel;
    if (otel && (Object.keys(otel.resource || {}).length || Object.keys(otel.scope || {}).length || Object.keys(otel.attributes || {}).length || otel.kind || Object.keys(otel.status || {}).length)) {
      const card = document.createElement("section"); card.className = "otel-context-card";
      const head = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = "OTEL RESOURCE & SCOPE"; const meta = document.createElement("span"); meta.textContent = [otel.scope?.name, otel.scope?.version].filter(Boolean).join(" · ") || "OpenTelemetry context"; head.append(strong, meta); card.appendChild(head);
      const grid = document.createElement("div"); grid.className = "otel-context-grid";
      const rows = [];
      if (otel.kind !== "" && otel.kind !== undefined) rows.push(["Span kind", String(otel.kind)]);
      if (otel.resourceSchemaUrl) rows.push(["Resource schema", otel.resourceSchemaUrl]);
      if (otel.scope?.name) rows.push(["Scope", otel.scope.name]);
      if (otel.scope?.version) rows.push(["Scope version", otel.scope.version]);
      if (otel.scope?.schemaUrl) rows.push(["Scope schema", otel.scope.schemaUrl]);
      Object.entries(otel.resource || {}).slice(0, 10).forEach(([key, value]) => rows.push([`resource.${key}`, String(value)]));
      Object.entries(otel.attributes || {}).slice(0, 10).forEach(([key, value]) => rows.push([`span.${key}`, String(value)]));
      rows.slice(0, 20).forEach(([label, value]) => { const item = document.createElement("div"); const name = document.createElement("span"); name.textContent = label; const code = document.createElement("code"); code.textContent = value; code.title = value; item.append(name, code); grid.appendChild(item); });
      card.appendChild(grid); wrap.appendChild(card);
    }

    if (traceEntries.length) {
      const serviceSummary = document.createElement("div");
      serviceSummary.className = "trace-services";
      const serviceStats = new Map();
      traceEntries.forEach((item) => {
        const key = item.service && item.service !== "—" ? item.service : utils().shortSource(item.source);
        const current = serviceStats.get(key) || { count: 0, errors: 0, duration: 0 };
        current.count += 1;
        if (item.level === "ERROR" || item.level === "FATAL") current.errors += 1;
        if (Number.isFinite(item.traceMeta?.durationMs)) current.duration += item.traceMeta.durationMs;
        serviceStats.set(key, current);
      });
      [...serviceStats.entries()]
        .sort((a, b) => b[1].count - a[1].count || b[1].errors - a[1].errors)
        .slice(0, 8)
        .forEach(([service, summary]) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `trace-service${summary.errors ? " has-errors" : ""}`;
          button.dataset.traceService = service;
          const name = document.createElement("strong"); name.textContent = service; name.title = service;
          const meta = document.createElement("span");
          meta.textContent = `${summary.count} entries${summary.errors ? ` · ${summary.errors} errors` : ""}${summary.duration ? ` · ${formatDuration(summary.duration)}` : ""}`;
          button.append(name, meta);
          serviceSummary.appendChild(button);
        });
      if (serviceSummary.childElementCount) wrap.appendChild(serviceSummary);
    }

    if (state.traceEngine.includes("searching")) {
      const pending = document.createElement("p"); pending.className = "context-empty"; pending.textContent = "Building trace view in the background…"; wrap.appendChild(pending);
      el.tracePane.replaceChildren(wrap);
      return;
    }

    if (!traceEntries.length) {
      const empty = document.createElement("p"); empty.className = "context-empty"; empty.textContent = "No matching entries were found for this trace."; wrap.appendChild(empty);
      el.tracePane.replaceChildren(wrap);
      return;
    }

    const critical = traceAnalyzer()?.analyze?.(traceEntries) || null;
    const criticalIds = new Set((critical?.chain || []).map((item) => item.id));
    if (critical?.available) {
      const card = document.createElement("section");
      card.className = "critical-path-card";
      const head = document.createElement("div");
      const label = document.createElement("span"); label.textContent = "CRITICAL CHAIN";
      const method = document.createElement("em"); method.textContent = critical.completeParents ? "explicit span tree" : "partial span tree";
      head.append(label, method);
      const metrics = document.createElement("div"); metrics.className = "critical-path-metrics";
      [["Trace latency", formatDuration(critical.latencyMs)], ["Chain", `${critical.chain.length} span${critical.chain.length === 1 ? "" : "s"}`], ["Parent coverage", `${Math.round(critical.coverage * 100)}%`], ["Bottleneck", critical.bottleneck ? `${critical.bottleneck.service || "—"} · ${formatDuration(critical.bottleneck.traceMeta?.durationMs)}` : "—"]].forEach(([name, value]) => {
        const item = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = value; const span = document.createElement("span"); span.textContent = name; item.append(strong, span); metrics.appendChild(item);
      });
      const note = document.createElement("p"); note.textContent = critical.note;
      card.append(head, metrics, note);
      wrap.appendChild(card);
    }

    const flame = window.SignalDockTraceFlame?.layout?.(traceEntries, { maxBars: 420 });
    if (flame?.available) {
      const flameCard = document.createElement("section");
      flameCard.className = "trace-flame-card";
      const flameHead = document.createElement("div");
      const flameTitle = document.createElement("strong"); flameTitle.textContent = "SPAN FLAME";
      const flameMeta = document.createElement("span"); flameMeta.textContent = `${flame.bars.length} timed spans · ${formatDuration(flame.totalMs)}${flame.omitted ? ` · ${flame.omitted} omitted` : ""}`;
      flameHead.append(flameTitle, flameMeta);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "trace-flame");
      const laneHeight = 15;
      const chartHeight = Math.max(24, (flame.maxDepth + 1) * laneHeight + 8);
      svg.setAttribute("viewBox", `0 0 1000 ${chartHeight}`);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Span flame chart derived from explicit trace timing metadata");
      flame.bars.forEach((bar) => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(bar.startPct * 10));
        rect.setAttribute("y", String(4 + bar.depth * laneHeight));
        rect.setAttribute("width", String(Math.max(2, bar.widthPct * 10)));
        rect.setAttribute("height", "11");
        rect.setAttribute("rx", "2");
        rect.setAttribute("class", `trace-flame-bar trace-flame-bar--${String(bar.level || "unknown").toLowerCase()}`);
        rect.dataset.traceEntryId = bar.id;
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${bar.service} · ${bar.name} · ${formatDuration(bar.durationMs)}`;
        rect.appendChild(title);
        svg.appendChild(rect);
      });
      const flameNote = document.createElement("p"); flameNote.textContent = "Uses only spans with explicit timestamps and durations; events without duration are excluded.";
      flameCard.append(flameHead, svg, flameNote);
      wrap.appendChild(flameCard);
    }

    const spanEvents = window.SignalDockSpanEvents?.collect?.(traceEntries, { maxEvents: 500 }) || [];
    if (spanEvents.length) {
      const eventsCard = document.createElement("section"); eventsCard.className = "trace-events-card";
      const eventsHead = document.createElement("div"); const eventsTitle = document.createElement("strong"); eventsTitle.textContent = "SPAN EVENTS"; const eventsMeta = document.createElement("span"); eventsMeta.textContent = `${spanEvents.length.toLocaleString()} event${spanEvents.length === 1 ? "" : "s"} with OpenTelemetry-style metadata`; eventsHead.append(eventsTitle, eventsMeta); eventsCard.appendChild(eventsHead);
      const eventsList = document.createElement("div"); eventsList.className = "trace-events-list";
      spanEvents.slice(0, 120).forEach((spanEvent) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "trace-event"; if (spanEvent.entryId) button.dataset.traceEntryId = spanEvent.entryId;
        const time = document.createElement("time"); time.textContent = spanEvent.timestamp ? utils().formatTime(spanEvent.timestamp) : "event";
        const copy = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = spanEvent.name; const meta = document.createElement("span"); const attrCount = Object.keys(spanEvent.attributes || {}).length; meta.textContent = `${spanEvent.service || "—"}${spanEvent.span ? ` · span ${String(spanEvent.span).slice(0, 12)}` : ""}${attrCount ? ` · ${attrCount} attrs` : ""}`; copy.append(strong, meta);
        if (attrCount) { const attrs = document.createElement("code"); attrs.textContent = Object.entries(spanEvent.attributes).slice(0, 4).map(([key, value]) => `${key}=${value}`).join("  "); copy.appendChild(attrs); }
        button.append(time, copy); eventsList.appendChild(button);
      });
      eventsCard.appendChild(eventsList);
      if (spanEvents.length > 120) { const note = document.createElement("p"); note.textContent = `Showing 120 of ${spanEvents.length.toLocaleString()} span events.`; eventsCard.appendChild(note); }
      wrap.appendChild(eventsCard);
    }

    const timed = traceEntries.filter((item) => Number.isFinite(item.timestampMs));
    const minStart = timed.length ? Math.min(...timed.map((item) => item.timestampMs)) : 0;
    const maxEnd = timed.length ? Math.max(...timed.map((item) => item.timestampMs + (Number.isFinite(item.traceMeta?.durationMs) ? item.traceMeta.durationMs : 0))) : 1;
    const totalSpan = Math.max(1, maxEnd - minStart);
    const bySpan = new Map(traceEntries.filter((item) => item.correlations?.span).map((item) => [item.correlations.span, item]));

    const list = document.createElement("div");
    list.className = "trace-list";
    traceEntries.slice(0, 250).forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `trace-row${item.id === entry.id ? " is-current" : ""}${criticalIds.has(item.id) ? " is-critical" : ""}`;
      row.dataset.traceEntryId = item.id;
      const depth = traceDepth(item, bySpan);
      row.classList.add(`trace-depth-${Math.min(depth, 4)}`);

      const label = document.createElement("div");
      label.className = "trace-row__label";
      const service = document.createElement("strong"); service.textContent = item.service || "—";
      const name = document.createElement("span"); name.textContent = item.traceMeta?.name || item.message || "span"; name.title = name.textContent;
      label.append(service, name);

      const meta = document.createElement("div");
      meta.className = "trace-row__meta";
      const level = document.createElement("span"); level.className = `context-level level-${item.level}`; level.textContent = item.level;
      const duration = document.createElement("span"); duration.textContent = Number.isFinite(item.traceMeta?.durationMs) ? `${formatDuration(item.traceMeta.durationMs)}` : "event";
      meta.append(level, duration);

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "trace-waterfall");
      svg.setAttribute("viewBox", "0 0 1000 16");
      svg.setAttribute("preserveAspectRatio", "none");
      const track = document.createElementNS("http://www.w3.org/2000/svg", "line");
      track.setAttribute("x1", "0"); track.setAttribute("x2", "1000"); track.setAttribute("y1", "8"); track.setAttribute("y2", "8"); track.setAttribute("class", "trace-track");
      svg.appendChild(track);
      if (Number.isFinite(item.timestampMs)) {
        const start = ((item.timestampMs - minStart) / totalSpan) * 1000;
        const durationMs = Number.isFinite(item.traceMeta?.durationMs) ? item.traceMeta.durationMs : Math.max(totalSpan / 500, 1);
        const width = Math.max(3, Math.min(1000 - start, (durationMs / totalSpan) * 1000));
        const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bar.setAttribute("x", String(Math.max(0, start)));
        bar.setAttribute("y", "4");
        bar.setAttribute("width", String(width));
        bar.setAttribute("height", "8");
        bar.setAttribute("rx", "3");
        bar.setAttribute("class", `trace-bar trace-bar--${item.level.toLowerCase()}`);
        svg.appendChild(bar);
      }
      row.append(label, meta, svg);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    if (traceEntries.length > 250) {
      const note = document.createElement("p"); note.className = "trace-note"; note.textContent = `Showing the first 250 of ${traceEntries.length.toLocaleString()} trace entries.`; wrap.appendChild(note);
    }
    const engineMeta = document.createElement("p"); engineMeta.className = "correlation-meta"; engineMeta.textContent = `Trace engine: ${state.traceEngine}`; wrap.appendChild(engineMeta);
    el.tracePane.replaceChildren(wrap);
  }

  function traceDepth(entry, bySpan) {
    let depth = 0;
    let parent = entry.traceMeta?.parentSpan;
    const seen = new Set();
    while (parent && bySpan.has(parent) && depth < 8 && !seen.has(parent)) {
      seen.add(parent);
      depth += 1;
      parent = bySpan.get(parent)?.traceMeta?.parentSpan;
    }
    return depth;
  }

  function formatDuration(value) {
    const ms = Number(value);
    if (!Number.isFinite(ms)) return "—";
    if (ms < 1) return `${Math.round(ms * 1000)} µs`;
    if (ms < 1000) return `${ms < 10 ? ms.toFixed(2) : ms.toFixed(1)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  }

  function filterByCorrelation(kind, value) {
    if (!kind || !value) return;
    const token = `${kind}:${quoteIfNeeded(value)}`;
    const query = el.queryInput.value.trim();
    el.queryInput.value = `${query}${query ? " " : ""}${token}`;
    applyFilters(true);
    toast(`Filtering by ${kind} identifier.`);
  }

  function timeDistance(a, b) {
    if (!Number.isFinite(a.timestampMs) || !Number.isFinite(b.timestampMs)) return Math.abs(a.index - b.index);
    return Math.abs(a.timestampMs - b.timestampMs);
  }

  function contextRow(entry, current) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `context-row${current ? " is-current" : ""}`;
    button.dataset.contextEntryId = entry.id;
    const time = document.createElement("time"); time.textContent = utils().formatTime(entry.timestamp).replace(/^\d{4}-\d{2}-\d{2}\s/, "");
    const level = document.createElement("span"); level.className = `context-level level-${entry.level}`; level.textContent = entry.level;
    const message = document.createElement("span"); message.textContent = entry.message || "(empty message)";
    button.append(time, level, message);
    return button;
  }

  function detailRow(key, value) {
    const wrap = document.createElement("div"); wrap.className = "detail-row";
    const dt = document.createElement("dt"); dt.textContent = key;
    const dd = document.createElement("dd"); dd.textContent = String(value ?? "—");
    wrap.append(dt, dd);
    return wrap;
  }

  function compactValue(value) {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return utils().safeStringify(value, false).slice(0, 500);
    return String(value).slice(0, 500);
  }

  function selectInspectorTab(tab, focus = false) {
    const available = ["details", "context", "correlations", "trace", "raw", "json"];
    if (!available.includes(tab)) return;
    state.inspectorTab = tab;
    renderInspectorTab();
    scheduleViewAutosave();
    if (focus) document.querySelector(`[data-inspector-tab="${tab}"]`)?.focus();
  }

  function onInspectorTabKeydown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[data-inspector-tab]")];
    if (!tabs.length) return;
    const current = Math.max(0, tabs.indexOf(event.currentTarget));
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    selectInspectorTab(tabs[next].dataset.inspectorTab, true);
  }

  function renderInspectorTab() {
    document.querySelectorAll("[data-inspector-tab]").forEach((button) => {
      const active = button.dataset.inspectorTab === state.inspectorTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    el.detailsPane.hidden = state.inspectorTab !== "details";
    el.contextPane.hidden = state.inspectorTab !== "context";
    el.correlationsPane.hidden = state.inspectorTab !== "correlations";
    el.tracePane.hidden = state.inspectorTab !== "trace";
    el.rawPane.hidden = state.inspectorTab !== "raw";
    el.jsonPane.hidden = state.inspectorTab !== "json";
  }

  async function copySelectedRaw() {
    const entry = selectedEntry();
    if (!entry) return;
    try {
      await utils().copyText(utils().safeStringify(entry.raw));
      toast("Raw log entry copied.");
    } catch { toast("Could not copy this entry.", "error"); }
  }

  function filterBySelectedSource() {
    const entry = selectedEntry();
    if (!entry) return;
    el.sourceFilter.value = entry.source;
    applyFilters(true);
    toast(`Filtered to ${utils().shortSource(entry.source)}.`);
  }

  function filterBySelectedService() {
    const entry = selectedEntry();
    if (!entry || !entry.service || entry.service === "—") return;
    filterByServiceValue(entry.service);
  }

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

  function entryRowIntoView(globalIndex) {
    const position = state.filteredIndexes.indexOf(globalIndex);
    if (position < 0) return;
    if (state.renderMode === "virtual" && canUseVirtualTable()) {
      const metrics = window.SignalDockVirtualViewport?.calculate?.({ total: state.filteredIndexes.length, rowHeight: state.virtual.rowHeight, viewportHeight: el.logTable.clientHeight || 420, overscan: state.virtual.overscan, maxScrollPx: MAX_VIRTUAL_SCROLL_PX, scrollTop: 0 });
      if (metrics) el.logTable.scrollTop = metrics.compressed ? (position / Math.max(1, state.filteredIndexes.length - 1)) * Math.max(1, Math.min(metrics.maxScrollPx, metrics.logicalHeight) - (el.logTable.clientHeight || 420)) : position * metrics.pitch;
      renderVirtualTable(true);
    } else {
      state.page = Math.floor(position / state.pageSize) + 1;
      renderTable();
    }
  }

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


  async function saveWorkspace() {
  if (!state.entries.length) return;
  const workspace = currentWorkspaceState(); const parts = window.SignalDockWorkspace.serializeParts(state.entries, workspace, APP_VERSION); const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); const filename = `signaldock-${stamp}.sdsession`;
  const size = parts.reduce((sum, part) => sum + new Blob([part]).size, 0);
  let saved = null;
  try {
    if (window.SignalDockDesktopBridge?.saveParts) saved = await window.SignalDockDesktopBridge.saveParts({ name: filename, mime: "application/json;charset=utf-8", parts, persistHandle: Boolean(state.activeProjectId), projectId: state.activeProjectId, id: filename, note: "SignalDock project workspace" });
    else { utils().downloadParts(filename, parts, "application/json;charset=utf-8"); saved = { mode: "download", name: filename, handleRef: "" }; }
  } catch (error) { toast(`Could not save workspace: ${error.message || error}`, "error", 7500); return; }
  if (saved?.mode === "cancelled") { toast("Workspace save cancelled."); return; }
  if (state.activeProjectId && window.SignalDockProjectManager) {
    if (window.SignalDockProjectManager.touchWorkspace) state.projects = window.SignalDockProjectManager.touchWorkspace(state.projects, state.activeProjectId, { id: filename, name: saved?.name || filename, size, handleRef: saved?.handleRef || "", handleKind: saved?.handleRef ? "file" : "" });
    if (state.baselineSnapshot && window.SignalDockProjectManager.attachBaseline) state.projects = window.SignalDockProjectManager.attachBaseline(state.projects, state.activeProjectId, { id: state.baselineSnapshot.id, name: state.baselineSnapshot.name, capturedAt: state.baselineSnapshot.capturedAt });
    if (state.caseFile && window.SignalDockProjectManager.attachCase) state.projects = window.SignalDockProjectManager.attachCase(state.projects, state.activeProjectId, { id: state.caseFile.id || "active-case", title: state.caseFile.title || state.investigation?.title || "Investigation", status: state.caseFile.status || "open", updatedAt: state.caseFile.updatedAt || new Date().toISOString() });
    projectController?.render();
  }
  toast(`Workspace saved with ${state.entries.length.toLocaleString()} entries${saved?.handleRef ? " · reopen link stored locally" : ""}.`);
}

  async function restoreWorkspace(file) {
    const maxWorkspaceBytes = 500 * 1024 * 1024;
    if (file.size > maxWorkspaceBytes) {
      toast("Workspace is larger than the 500 MB session safety limit.", "error", 7000);
      return;
    }
    setProcessing(true, "Opening workspace…", file.name);
    try {
      const payload = window.SignalDockWorkspace.parse(await file.text());
      await restoreWorkspacePayload(payload, file.name);
      markDatasetForAutosave();
      toast(`Workspace restored · ${state.entries.length.toLocaleString()} entries.`);
    } catch (error) {
      toast(`Could not open workspace: ${error.message || error}`, "error", 7500);
    } finally {
      setProcessing(false);
    }
  }

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

  function saveCurrentView() {
    if (!state.entries.length) return;
    const suggested = buildViewName();
    const name = window.prompt("Name this saved view:", suggested);
    if (!name?.trim()) return;
    const view = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim().slice(0, 48),
      query: el.queryInput.value,
      level: el.levelFilter.value,
      source: el.sourceFilter.value,
      timeRange: el.timeFilter.value,
      sortMode: el.sortFilter.value
    };
    state.savedViews.unshift(view);
    state.savedViews = state.savedViews.slice(0, 24);
    utils().saveJson(STORAGE_VIEWS, state.savedViews);
    renderSavedViews();
    toast(`Saved view “${view.name}”.`);
  }

  function buildViewName() {
    const parts = [];
    if (el.levelFilter.value) parts.push(el.levelFilter.value);
    if (el.sourceFilter.value) parts.push(utils().shortSource(el.sourceFilter.value));
    if (el.timeFilter.value) parts.push(el.timeFilter.options[el.timeFilter.selectedIndex].textContent);
    if (el.queryInput.value.trim()) parts.push(el.queryInput.value.trim().slice(0, 24));
    return parts.join(" · ") || "My log view";
  }

  function renderSavedViews() {
    el.savedList.replaceChildren();
    el.savedCount.textContent = (state.queryLibrary?.length || 0).toLocaleString();
    if (!state.savedViews.length) {
      const empty = document.createElement("div");
      empty.className = "sidebar-empty";
      empty.textContent = "Save filters for quick access";
      el.savedList.appendChild(empty);
      return;
    }

    state.savedViews.forEach((view) => {
      const wrap = document.createElement("div");
      wrap.className = "saved-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "saved-button";
      button.dataset.viewId = view.id;
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); icon.setAttribute("class", "icon"); icon.setAttribute("aria-hidden", "true");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", "assets/icons.svg#bookmark"); icon.appendChild(use);
      const name = document.createElement("span"); name.textContent = view.name; name.title = view.name;
      const count = document.createElement("em"); count.textContent = view.level || view.timeRange || "VIEW";
      button.append(icon, name, count);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button icon-button--tiny";
      remove.dataset.deleteView = view.id;
      remove.title = `Delete ${view.name}`;
      remove.setAttribute("aria-label", `Delete saved view ${view.name}`);
      const x = document.createElementNS("http://www.w3.org/2000/svg", "svg"); x.setAttribute("class", "icon"); x.setAttribute("aria-hidden", "true");
      const xu = document.createElementNS("http://www.w3.org/2000/svg", "use"); xu.setAttribute("href", "assets/icons.svg#close"); x.appendChild(xu); remove.appendChild(x);
      wrap.append(button, remove);
      el.savedList.appendChild(wrap);
    });
  }

  function onSavedViewsClick(event) {
    const remove = event.target.closest("[data-delete-view]");
    if (remove) {
      state.savedViews = state.savedViews.filter((view) => view.id !== remove.dataset.deleteView);
      utils().saveJson(STORAGE_VIEWS, state.savedViews);
      renderSavedViews();
      return;
    }
    const button = event.target.closest("[data-view-id]");
    if (!button) return;
    const view = state.savedViews.find((item) => item.id === button.dataset.viewId);
    if (!view) return;
    el.queryInput.value = view.query || "";
    el.levelFilter.value = view.level || "";
    el.sourceFilter.value = Array.from(el.sourceFilter.options).some((option) => option.value === view.source) ? view.source : "";
    el.timeFilter.value = Array.from(el.timeFilter.options).some((option) => option.value === view.timeRange) ? view.timeRange : "";
    el.sortFilter.value = Array.from(el.sortFilter.options).some((option) => option.value === view.sortMode) ? view.sortMode : "original";
    syncLevelChips(el.levelFilter.value);
    applyFilters(true);
    toast(`Applied “${view.name}”.`);
  }

  function syncLevelChips(level) {
    document.querySelectorAll("[data-level]").forEach((button) => button.classList.toggle("is-active", button.dataset.level === level));
  }

  function refreshSavedParserProfiles(selectedId = "") {
    if (!el.savedParserProfile || !parserProfiles()) return;
    const current = selectedId || el.savedParserProfile.value;
    const profiles = parserProfiles().load();
    el.savedParserProfile.replaceChildren(new Option("Choose saved profile…", ""), ...profiles.map((profile) => new Option(profile.name, profile.id)));
    if (profiles.some((profile) => profile.id === current)) el.savedParserProfile.value = current;
    el.deleteParserProfileButton.disabled = !el.savedParserProfile.value;
  }

  function applySavedParserProfile() {
    const profile = parserProfiles()?.get?.(el.savedParserProfile.value);
    el.deleteParserProfileButton.disabled = !profile;
    if (!profile) return;
    el.savedParserName.value = profile.name;
    el.customParserPattern.value = profile.pattern;
    el.customParserFlags.value = profile.flags || "i";
    el.parserProfile.value = "custom";
    updateCustomParserVisibility();
    persistSettingsFromForm();
    toast(`Parser profile “${profile.name}” loaded.`);
  }

  function saveParserProfileFromForm() {
    if (!parserProfiles()) return;
    try {
      const existingId = el.savedParserProfile.value || "";
      const record = parserProfiles().upsert({ name: el.savedParserName.value, pattern: el.customParserPattern.value, flags: el.customParserFlags.value }, existingId);
      refreshSavedParserProfiles(record.id);
      el.savedParserName.value = record.name;
      toast(`Parser profile “${record.name}” saved locally.`);
    } catch (error) { toast(error.message || String(error), "error", 6500); }
  }

  function deleteSelectedParserProfile() {
    const id = el.savedParserProfile.value;
    if (!id || !parserProfiles()) return;
    const profile = parserProfiles().get(id);
    parserProfiles().remove(id);
    refreshSavedParserProfiles();
    el.savedParserName.value = "";
    toast(`Deleted parser profile “${profile?.name || "profile"}”.`);
  }

  function exportParserProfiles() {
    if (!parserProfiles()) return;
    const text = parserProfiles().exportJson();
    utils().downloadParts(`signaldock-parser-profiles-${new Date().toISOString().slice(0, 10)}.json`, [text], "application/json;charset=utf-8");
    toast("Parser profiles exported.");
  }

  async function importParserProfiles(event) {
    const file = event.target.files?.[0];
    if (!file || !parserProfiles()) return;
    try {
      const profiles = parserProfiles().importJson(await file.text());
      refreshSavedParserProfiles();
      toast(`Imported ${profiles.length} parser profile${profiles.length === 1 ? "" : "s"}.`);
    } catch (error) { toast(`Could not import parser profiles: ${error.message || error}`, "error", 6500); }
    finally { event.target.value = ""; }
  }

  function commandDefinitions() {
    return [
      { id: "import", title: "Import logs", keywords: "open file json log zip", hint: "⌘O", run: () => el.fileInput.click() },
      { id: "search", title: "Focus smart search", keywords: "query filter find", hint: "/", disabled: !state.entries.length, run: () => el.queryInput.focus() },
      { id: "service-map", title: "Open service map", keywords: "topology trace dependencies", disabled: !state.entries.length, run: () => activateNavView("map") },
      { id: "service-matrix", title: "Open service latency matrix", keywords: "latency p95 edge errors dependency calls", disabled: !state.entries.length, run: () => activateNavView("matrix") },
      { id: "service-heatmap", title: "Open dependency heatmap", keywords: "time heatmap service dependency edge errors", disabled: !state.entries.length, run: () => activateNavView("heatmap") },
      { id: "service-trends", title: "Compare dependency periods", keywords: "trend service edge period delta calls errors p95", disabled: !state.entries.length, run: () => activateNavView("trends") },
      { id: "baseline", title: "Open cross-dataset baseline comparison", keywords: "baseline regression compare dataset service dependency", run: () => activateNavView("baseline") },
      { id: "projects", title: "Open local project manager", keywords: "projects workspace metadata organize", run: () => activateNavView("projects") },
      { id: "trace-explorer", title: "Open distributed trace explorer", keywords: "trace inventory spans coverage duration", disabled: !state.entries.length, run: () => activateNavView("traces") },
      { id: "trace-outliers", title: "Rank trace outliers", keywords: "trace latency robust errors anomalies unusual", disabled: !state.entries.length, run: () => activateNavView("outliers") },
      { id: "query-library", title: "Open query library", keywords: "saved reusable searches filters presets", run: () => activateNavView("saved") },
      { id: "health", title: "Open observed health", keywords: "health service errors warnings p95 exceptions", disabled: !state.entries.length, run: () => activateNavView("health") },
      { id: "investigation", title: "Open case & investigation workspace", keywords: "case evidence notes incident findings hypothesis bookmark", run: () => activateNavView("investigation") },
      { id: "case-report", title: "Export case report (Markdown)", keywords: "case report markdown findings health exceptions", run: exportCaseMarkdown },
      { id: "exceptions", title: "Open exception groups", keywords: "errors fingerprint recurring failure crash trends", disabled: !state.entries.length, run: () => activateNavView("exceptions") },
      { id: "add-evidence", title: "Add selected log to investigation", keywords: "evidence pin bookmark", disabled: !selectedEntry(), run: addSelectedEvidence },
      { id: "save-workspace", title: "Save workspace", keywords: "session sdsession bookmark", hint: "⇧⌘S", disabled: !state.entries.length, run: saveWorkspace },
      { id: "export", title: "Export current results", keywords: "download json ndjson", disabled: !state.filteredIndexes.length, run: exportFiltered },
      { id: "save-view", title: "Save current view", keywords: "filters preset", disabled: !state.entries.length, run: saveCurrentView },
      { id: "reset", title: "Reset filters", keywords: "clear query search", disabled: !state.entries.length, run: resetFilters },
      { id: "windowed", title: state.renderMode === "virtual" ? "Switch to paged table" : "Switch to windowed table", keywords: "virtual large performance viewport", disabled: !state.entries.length || state.settings.wrap || window.innerWidth < 780, run: () => { state.renderMode = state.renderMode === "virtual" ? "paged" : "virtual"; el.renderMode.value = state.renderMode; el.logTable.scrollTop = 0; renderTable(); scheduleViewAutosave(); } },
      { id: "live", title: state.tail.active ? "Stop live tail" : "Start local live tail", keywords: "follow file stream", run: () => activateNavView("live") },
      { id: "settings", title: "Open settings", keywords: "preferences parser performance recovery", run: () => activateNavView("settings") },
      { id: "clear", title: "Clear loaded logs", keywords: "remove dataset", disabled: !state.entries.length, run: clearAll }
    ];
  }

  function filteredCommands() {
    return paletteEngine()?.filter?.(commandDefinitions(), el.commandPaletteInput?.value || "") || commandDefinitions();
  }

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

  function openCommandPalette() {
    if (!el.commandPaletteDialog) return;
    closeCompetingDialogs("commandPaletteDialog");
    state.commandPaletteIndex = 0;
    el.commandPaletteInput.value = "";
    el.commandPaletteInput.setAttribute("aria-expanded", "true");
    renderCommandPalette();
    showDialogSafely(el.commandPaletteDialog);
    requestAnimationFrame(() => el.commandPaletteInput.focus());
  }

  function closeCommandPalette() {
    if (!el.commandPaletteDialog) return;
    el.commandPaletteInput?.setAttribute("aria-expanded", "false");
    el.commandPaletteInput?.removeAttribute("aria-activedescendant");
    if (typeof el.commandPaletteDialog.close === "function" && el.commandPaletteDialog.open) el.commandPaletteDialog.close();
    else el.commandPaletteDialog.removeAttribute("open");
  }

  function renderCommandPalette() {
    if (!el.commandPaletteList) return;
    const commands = filteredCommands();
    state.commandPaletteIndex = Math.max(0, Math.min(state.commandPaletteIndex, Math.max(0, commands.length - 1)));
    el.commandPaletteList.replaceChildren();
    if (!commands.length) {
      el.commandPaletteInput?.removeAttribute("aria-activedescendant"); const empty = document.createElement("p"); empty.className = "command-empty"; empty.textContent = "No matching commands."; el.commandPaletteList.appendChild(empty); return;
    }
    commands.forEach((command, index) => {
      const button = document.createElement("button"); button.type = "button"; button.id = `commandPaletteOption-${index}`; button.className = `command-item${index === state.commandPaletteIndex ? " is-active" : ""}`; button.dataset.commandId = command.id; button.setAttribute("role", "option"); button.setAttribute("aria-selected", index === state.commandPaletteIndex ? "true" : "false"); button.disabled = Boolean(command.disabled);
      const copy = document.createElement("span"); const strong = document.createElement("strong"); strong.textContent = command.title; const small = document.createElement("small"); small.textContent = command.keywords || "SignalDock action"; copy.append(strong, small); button.appendChild(copy);
      if (command.hint) { const kbd = document.createElement("kbd"); kbd.textContent = command.hint; button.appendChild(kbd); }
      el.commandPaletteList.appendChild(button);
    });
    const activeOption = el.commandPaletteList.querySelector(".is-active"); if (activeOption) el.commandPaletteInput?.setAttribute("aria-activedescendant", activeOption.id); else el.commandPaletteInput?.removeAttribute("aria-activedescendant");
    activeOption?.scrollIntoView?.({ block: "nearest" });
  }

  function runCommand(id) {
    const command = commandDefinitions().find((item) => item.id === id);
    if (!command || command.disabled) return;
    closeCommandPalette();
    command.run();
  }

  function openSettings() {
    el.wrapToggle.checked = state.settings.wrap;
    el.compactToggle.checked = state.settings.compact;
    el.unknownToggle.checked = state.settings.showUnknown;
    el.workerToggle.checked = state.settings.useWorker !== false;
    el.autosaveToggle.checked = state.settings.autosave !== false;
    el.parserProfile.value = state.settings.parserProfile || "auto";
    el.customParserPattern.value = state.settings.customParserPattern || "";
    el.customParserFlags.value = state.settings.customParserFlags || "i";
    refreshSavedParserProfiles();
    updateCustomParserVisibility();
    updateAutosaveStatus();
    updateDiagnostics();
    closeCompetingDialogs("settingsDialog");
    showDialogSafely(el.settingsDialog);
  }

  function persistSettingsFromForm() {
    state.settings = {
      wrap: el.wrapToggle.checked,
      compact: el.compactToggle.checked,
      showUnknown: el.unknownToggle.checked,
      useWorker: el.workerToggle.checked,
      autosave: el.autosaveToggle.checked,
      parserProfile: el.parserProfile.value || "auto",
      customParserPattern: el.customParserPattern.value.trim(),
      customParserFlags: el.customParserFlags.value.replace(/[^imsu]/g, "") || "i"
    };
    utils().saveJson(STORAGE_SETTINGS, state.settings);
    applySettings();
    applyFilters(false);
    scheduleViewAutosave();
    if (state.settings.autosave !== false && state.entries.length) markDatasetForAutosave();
  }

  function applySettings() {
    document.body.classList.toggle("wrap-messages", Boolean(state.settings.wrap));
    document.body.classList.toggle("compact-density", Boolean(state.settings.compact));
    if (state.settings.wrap && state.renderMode === "virtual") { state.renderMode = "paged"; if (el.renderMode) el.renderMode.value = "paged"; }
    if (el.wrapToggle) el.wrapToggle.checked = Boolean(state.settings.wrap);
    if (el.compactToggle) el.compactToggle.checked = Boolean(state.settings.compact);
    if (el.unknownToggle) el.unknownToggle.checked = state.settings.showUnknown !== false;
    if (el.workerToggle) el.workerToggle.checked = state.settings.useWorker !== false;
    if (el.autosaveToggle) el.autosaveToggle.checked = state.settings.autosave !== false;
    if (el.parserProfile) el.parserProfile.value = state.settings.parserProfile || "auto";
    if (el.customParserPattern) el.customParserPattern.value = state.settings.customParserPattern || "";
    if (el.customParserFlags) el.customParserFlags.value = state.settings.customParserFlags || "i";
    updateCustomParserVisibility();
    updateAutosaveStatus();
  }

  function currentCustomParserProfile() {
    return {
      pattern: String(state.settings.customParserPattern || "").trim(),
      flags: String(state.settings.customParserFlags || "i").replace(/[^imsu]/g, "")
    };
  }

  function updateCustomParserVisibility() {
    if (!el.customParserFields || !el.parserProfile) return;
    el.customParserFields.hidden = el.parserProfile.value !== "custom";
  }

  function currentViewState() {
    const selected = selectedEntry();
    return {
      query: el.queryInput.value,
      level: el.levelFilter.value,
      source: el.sourceFilter.value,
      timeRange: el.timeFilter.value,
      sortMode: el.sortFilter.value,
      pageSize: state.pageSize,
      renderMode: state.renderMode,
      serviceMapGroupBy: state.serviceMapGroupBy,
      selectedGlobalIndex: selected?.globalIndex ?? null,
      inspectorTab: state.inspectorTab
    };
  }

  function currentWorkspaceState() {
    return {
      loadedBytes: state.loadedBytes,
      inputFileCount: state.inputFileCount,
      view: currentViewState(),
      settings: state.settings,
      investigation: window.SignalDockInvestigation?.normalize?.(state.investigation) || state.investigation,
      caseFile: window.SignalDockCaseWorkspace?.normalize?.(state.caseFile) || state.caseFile,
      caseCheckpoints: window.SignalDockCaseCheckpoints?.normalizeList?.(state.caseCheckpoints) || state.caseCheckpoints,
      baselineSnapshot: state.baselineSnapshot,
      activeProjectId: state.activeProjectId
    };
  }

  function markDatasetForAutosave() {
    state.recovery.datasetDirty = true;
    if (state.settings.autosave !== false) scheduleDatasetAutosave();
  }

  async function autosaveDataset() {
    if (!state.entries.length || state.settings.autosave === false || !window.SignalDockPersistence || state.recovery.saving) return;
    const eligibility = window.SignalDockPersistence.autosaveEligibility(state.entries);
    if (!eligibility.allowed) {
      state.recovery.datasetDirty = false;
      return;
    }
    state.recovery.saving = true;
    try {
      const result = await window.SignalDockPersistence.saveDataset(state.entries, currentWorkspaceState(), APP_VERSION);
      state.recovery.datasetDirty = !result.allowed;
      if (result.allowed) await window.SignalDockPersistence.saveView(currentViewState(), state.settings);
    } catch { /* recovery is best-effort and never blocks the workspace */ }
    finally { state.recovery.saving = false; }
  }

  async function autosaveView() {
    if (!state.entries.length || state.settings.autosave === false || !window.SignalDockPersistence || state.recovery.datasetDirty) return;
    try { await window.SignalDockPersistence.saveView(currentViewState(), state.settings); } catch { /* best effort */ }
  }

  async function checkRecoverySnapshot() {
    if (!window.SignalDockPersistence || state.entries.length || state.recovery.dismissed) return;
    try {
      const info = await window.SignalDockPersistence.recoveryInfo();
      if (!info?.entryCount) return;
      state.recovery.available = true;
      const chunkMeta = info.chunkCount > 1 ? ` · ${info.chunkCount.toLocaleString()} chunks` : "";
      el.recoveryMeta.textContent = `${info.entryCount.toLocaleString()} entries · ${utils().formatBytes(info.byteSize)}${chunkMeta} · saved ${new Date(info.savedAt).toLocaleString()}`;
      el.recoveryBanner.hidden = false;
    } catch { /* IndexedDB may be unavailable in private/restricted contexts */ }
  }

  function hideRecoveryBanner() {
    state.recovery.available = false;
    if (el.recoveryBanner) el.recoveryBanner.hidden = true;
  }

  function dismissRecoverySnapshot() {
    state.recovery.dismissed = true;
    hideRecoveryBanner();
  }

  async function clearRecoverySnapshot() {
    if (!window.SignalDockPersistence) return;
    try {
      await window.SignalDockPersistence.clearRecovery();
      state.recovery.datasetDirty = false;
      hideRecoveryBanner();
      updateAutosaveStatus();
      toast("Local recovery snapshot cleared.");
    } catch (error) {
      toast(`Could not clear recovery snapshot: ${error.message || error}`, "error", 6500);
    }
  }

  async function clearSearchCache() {
    try {
      if (!window.SignalDockSearchCache) { toast("Search cache module is unavailable in this context.", "error"); return; }
      await window.SignalDockSearchCache.clear();
      state.searchIndex.cacheHit = false;
      state.searchIndex.cacheSegments = 0;
      updateDiagnostics();
      toast("Local search index cache cleared.");
    } catch (error) { toast(`Could not clear search cache: ${error.message || error}`, "error", 6500); }
  }

  function updateAutosaveStatus() {
    if (!el.autosaveStatus) return;
    if (state.settings.autosave === false) { el.autosaveStatus.textContent = "Autosave disabled."; return; }
    if (!state.entries.length) { el.autosaveStatus.textContent = "Autosave ready · no logs loaded."; return; }
    if (!window.SignalDockPersistence) { el.autosaveStatus.textContent = "IndexedDB recovery unavailable in this browser."; return; }
    const eligibility = window.SignalDockPersistence.autosaveEligibility(state.entries);
    el.autosaveStatus.textContent = eligibility.allowed
      ? `Eligible · ~${utils().formatBytes(eligibility.estimatedBytes)} estimated snapshot`
      : eligibility.reason;
  }

  async function restoreRecoverySnapshot() {
    if (!window.SignalDockPersistence) return;
    setProcessing(true, "Restoring local recovery…", "Reading IndexedDB snapshot");
    try {
      const recovery = await window.SignalDockPersistence.loadRecovery();
      if (!recovery?.parsed) throw new Error("No recovery snapshot is available.");
      await restoreWorkspacePayload(recovery.parsed, `Recovery · ${new Date(recovery.metadata.savedAt).toLocaleString()}`);
      hideRecoveryBanner();
      toast(`Recovered ${state.entries.length.toLocaleString()} local entries.`);
    } catch (error) {
      toast(`Could not restore recovery snapshot: ${error.message || error}`, "error", 7500);
    } finally { setProcessing(false); }
  }

  async function restoreWorkspacePayload(payload, label = "workspace") {
    stopLiveTail();
    state.entries = [];
    state.filterEntries = [];
    state.filteredIndexes = [];
    state.selectedId = null;
    state.correlatedIndexes = [];
    state.traceIndexes = [];
    appendParsedEntries(payload.entries || []);
    state.loadedBytes = Number(payload.workspace?.loadedBytes) || 0;
    state.inputFileCount = Number(payload.workspace?.inputFileCount) || 1;
    state.settings = Object.assign(state.settings, payload.workspace?.settings || {});
    const restoredInvestigation = payload.workspace?.investigation || window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] };
    state.investigation = window.SignalDockInvestigation?.normalize?.(restoredInvestigation) || restoredInvestigation;
    const restoredCase = payload.workspace?.caseFile || window.SignalDockCaseWorkspace?.empty?.(state.investigation?.title || "Investigation") || { title: state.investigation?.title || "Investigation", status: "open", severity: "none", findings: [] };
    state.caseFile = window.SignalDockCaseWorkspace?.normalize?.(restoredCase) || restoredCase;
    state.caseCheckpoints = window.SignalDockCaseCheckpoints?.normalizeList?.(payload.workspace?.caseCheckpoints || []) || [];
    try { state.baselineSnapshot = payload.workspace?.baselineSnapshot ? window.SignalDockBaselineManager?.normalize?.(payload.workspace.baselineSnapshot) : state.baselineSnapshot; } catch { state.baselineSnapshot = null; }
    state.activeProjectId = String(payload.workspace?.activeProjectId || state.activeProjectId || "");
    if (state.activeProjectId) utils().saveJson("signaldock-active-project-v1", state.activeProjectId);
    applySettings();
    rebuildFilterIndex();
    refreshFilters();
    setControlsEnabled(true);
    syncWorkerIndex();

    const view = payload.workspace?.view || {};
    el.queryInput.value = String(view.query || "");
    el.levelFilter.value = Array.from(el.levelFilter.options).some((option) => option.value === view.level) ? view.level : "";
    el.sourceFilter.value = Array.from(el.sourceFilter.options).some((option) => option.value === view.source) ? view.source : "";
    el.timeFilter.value = Array.from(el.timeFilter.options).some((option) => option.value === view.timeRange) ? view.timeRange : "";
    el.sortFilter.value = Array.from(el.sortFilter.options).some((option) => option.value === view.sortMode) ? view.sortMode : "original";
    state.pageSize = [50, 100, 250, 500, 1000].includes(Number(view.pageSize)) ? Number(view.pageSize) : 100;
    el.pageSize.value = String(state.pageSize);
    state.renderMode = view.renderMode === "virtual" ? "virtual" : "paged";
    if (el.renderMode) el.renderMode.value = state.renderMode;
    state.serviceMapGroupBy = window.SignalDockServiceMap?.GROUP_MODES?.includes(view.serviceMapGroupBy) ? view.serviceMapGroupBy : "service";
    if (el.serviceMapGroupBy) el.serviceMapGroupBy.value = state.serviceMapGroupBy;
    state.inspectorTab = ["details", "context", "correlations", "trace", "raw", "json"].includes(view.inspectorTab) ? view.inspectorTab : "details";
    syncLevelChips(el.levelFilter.value);
    applyFilters(true);
    if (Number.isInteger(view.selectedGlobalIndex) && state.entries[view.selectedGlobalIndex]) selectEntry(`sd-${view.selectedGlobalIndex}`);
    state.recovery.datasetDirty = false;
    if (label) el.loadedMeta.title = label;
  }



  function formatMetricMs(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return number < 10 ? `${number.toFixed(1)} ms` : `${Math.round(number)} ms`;
  }

  function updateDiagnostics() {
    if (!el.diagnosticsGrid || !window.SignalDockPerformance) return;
    const snapshot = profiler().snapshot();
    el.diagnosticsGrid.replaceChildren();
    const rows = [
      ["Dataset", `${state.entries.length.toLocaleString()} entries`],
      ["Filtered", `${state.filteredIndexes.length.toLocaleString()} entries`],
      ["Filter last / p95", `${formatMetricMs(snapshot.metrics.filter?.lastMs)} / ${formatMetricMs(snapshot.metrics.filter?.p95Ms)}`],
      ["Table render last / p95", `${formatMetricMs(snapshot.metrics["table-render"]?.lastMs)} / ${formatMetricMs(snapshot.metrics["table-render"]?.p95Ms)}`],
      ["Table mode", state.renderMode === "virtual" && canUseVirtualTable() ? `Windowed · ${state.virtual.end - state.virtual.start} DOM rows${state.virtual.compressed ? " · compressed scale" : ""}` : `Paged · ${state.pageSize} rows`],
      ["Parser last / p95", `${formatMetricMs(snapshot.metrics.parse?.lastMs)} / ${formatMetricMs(snapshot.metrics.parse?.p95Ms)}`],
      ["Long tasks", `${snapshot.longTasks.toLocaleString()} · max ${formatMetricMs(snapshot.longestTaskMs)}`],
      ["Filter engine", state.lastEngine],
      ["Search index", state.searchIndex.enabled ? `${state.searchIndex.tokens.toLocaleString()} tokens · ${state.searchIndex.mode}${["indexed","disk-indexed"].includes(state.searchIndex.mode) ? ` · ${state.searchIndex.candidateCount.toLocaleString()} candidates` : ""}` : (state.searchIndex.mode === "building" ? "Building…" : "Linear fallback")],
      ["Search cache", state.searchIndex.cacheHit ? `Disk-backed restore · ${state.searchIndex.cacheSegments || 0} buckets` : state.searchIndex.cacheEligible ? `Eligible · ${state.searchIndex.cacheSegments || 0} local buckets` : "Not active"],
      ["Exception groups", `${state.exceptionGroups?.length || 0} fingerprints`],
      ["Case", `${state.caseFile?.status || "open"} · ${state.caseFile?.severity || "none"} · ${state.caseFile?.findings?.length || 0} findings`],
      ["Investigation", `${state.investigation?.items?.length || 0} evidence items`],
      ["Recovery", window.SignalDockPersistence ? "IndexedDB chunked-v1" : "Unavailable"]
    ];
    if (snapshot.memory?.usedJSHeapBytes) rows.splice(6, 0, ["JS heap", `${utils().formatBytes(snapshot.memory.usedJSHeapBytes)} / ${utils().formatBytes(snapshot.memory.jsHeapLimitBytes)}`]);
    rows.forEach(([label, value]) => {
      const row = document.createElement("div"); const dt = document.createElement("span"); dt.textContent = label; const dd = document.createElement("strong"); dd.textContent = value; row.append(dt, dd); el.diagnosticsGrid.appendChild(row);
    });
  }

  async function copyDiagnostics() {
    const recovery = await window.SignalDockPersistence?.recoveryInfo?.().catch(() => null);
    const payload = {
      app: "SignalDock",
      version: APP_VERSION,
      generatedAt: new Date().toISOString(),
      dataset: { entries: state.entries.length, filtered: state.filteredIndexes.length, loadedBytes: state.loadedBytes, sources: state.summary.sources?.length || 0, services: state.summary.services?.length || 0 },
      engines: { filter: state.lastEngine, workerAvailable: state.workerAvailable, workerReady: state.workerReady, searchIndex: state.searchIndex },
      capabilities: { indexedDB: Boolean(window.indexedDB), fileSystemAccess: typeof window.showOpenFilePicker === "function", performanceMemory: Boolean(performance.memory) },
      recovery,
      performance: profiler()?.snapshot?.() || null
    };
    try {
      await utils().copyText(JSON.stringify(payload, null, 2));
      toast("Support details copied.");
    } catch { toast("Could not copy support details.", "error"); }
  }

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
