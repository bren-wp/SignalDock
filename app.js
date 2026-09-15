(function () {
  "use strict";

  const STORAGE_VIEWS = "signaldock-saved-views-v3";
  const STORAGE_SETTINGS = "signaldock-settings-v10";
  const APP_VERSION = "2.7.0";
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

  const el = {};
  const $ = (id) => document.getElementById(id);
  const utils = () => window.SignalDockUtils;
  const engine = () => window.SignalDockQueryEngine;
  const profiler = () => window.SignalDockPerformance;
  const traceAnalyzer = () => window.SignalDockTraceAnalysis;
  const parserProfiles = () => window.SignalDockParserProfiles;
  const paletteEngine = () => window.SignalDockCommandPalette;

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
      queryLibraryDialog: $("queryLibraryDialog"), queryLibraryName: $("queryLibraryName"), queryLibraryFolder: $("queryLibraryFolder"), queryLibraryTags: $("queryLibraryTags"), queryLibraryDescription: $("queryLibraryDescription"), queryLibraryFavorite: $("queryLibraryFavorite"), queryLibrarySaveButton: $("queryLibrarySaveButton"), queryLibraryExportButton: $("queryLibraryExportButton"), queryLibraryImportButton: $("queryLibraryImportButton"), queryLibraryFileInput: $("queryLibraryFileInput"), queryLibraryList: $("queryLibraryList"), closeQueryLibraryButton: $("closeQueryLibraryButton"), queryLibrarySearch: $("queryLibrarySearch"), queryLibraryFolderFilter: $("queryLibraryFolderFilter"), queryLibraryManageFolder: $("queryLibraryManageFolder"), queryLibraryRenameFolder: $("queryLibraryRenameFolder"), queryLibraryRenameFolderButton: $("queryLibraryRenameFolderButton"), queryLibraryDeleteFolderButton: $("queryLibraryDeleteFolderButton"),
      baselineChangeCount: $("baselineChangeCount"), baselineDialog: $("baselineDialog"), baselineMeta: $("baselineMeta"), baselineName: $("baselineName"), captureBaselineButton: $("captureBaselineButton"), captureFilteredBaselineButton: $("captureFilteredBaselineButton"), exportBaselineButton: $("exportBaselineButton"), importBaselineButton: $("importBaselineButton"), baselineFileInput: $("baselineFileInput"), baselineSummary: $("baselineSummary"), baselineServiceBody: $("baselineServiceBody"), baselineDependencyBody: $("baselineDependencyBody"), baselineTraceBody: $("baselineTraceBody"), closeBaselineButton: $("closeBaselineButton"),
      projectCount: $("projectCount"), projectDialog: $("projectDialog"), projectName: $("projectName"), projectDescription: $("projectDescription"), createProjectButton: $("createProjectButton"), projectLinkFilesButton: $("projectLinkFilesButton"), projectCapabilityMeta: $("projectCapabilityMeta"), exportProjectsButton: $("exportProjectsButton"), importProjectsButton: $("importProjectsButton"), projectsFileInput: $("projectsFileInput"), activeProjectMeta: $("activeProjectMeta"), projectList: $("projectList"), closeProjectButton: $("closeProjectButton"),
      caseCheckpointLabel: $("caseCheckpointLabel"), addCaseCheckpointButton: $("addCaseCheckpointButton"), caseCheckpoints: $("caseCheckpoints"),
      diagnosticsGrid: $("diagnosticsGrid"), copyDiagnosticsButton: $("copyDiagnosticsButton"), commandPaletteButton: $("commandPaletteButton"), commandPaletteDialog: $("commandPaletteDialog"), commandPaletteInput: $("commandPaletteInput"), commandPaletteList: $("commandPaletteList"), closeCommandPaletteButton: $("closeCommandPaletteButton"),
      investigationCount: $("investigationCount"), investigationDialog: $("investigationDialog"), investigationTitle: $("investigationTitle"), investigationSummary: $("investigationSummary"), investigationStats: $("investigationStats"), investigationList: $("investigationList"), investigationTimeline: $("investigationTimeline"), investigationTimelineMeta: $("investigationTimelineMeta"), closeInvestigationButton: $("closeInvestigationButton"), exportInvestigationBundleButton: $("exportInvestigationBundleButton"), exportInvestigationMarkdownButton: $("exportInvestigationMarkdownButton"), exportInvestigationJsonButton: $("exportInvestigationJsonButton"), importInvestigationJsonButton: $("importInvestigationJsonButton"), investigationFileInput: $("investigationFileInput"), clearInvestigationButton: $("clearInvestigationButton"), addEvidenceButton: $("addEvidenceButton"),
      caseWorkspaceStats: $("caseWorkspaceStats"), caseTimelineFilter: $("caseTimelineFilter"), caseTimelineMeta: $("caseTimelineMeta"), caseTimelineList: $("caseTimelineList"), caseStatus: $("caseStatus"), caseSeverity: $("caseSeverity"), caseHypothesis: $("caseHypothesis"), caseImpact: $("caseImpact"), caseNextSteps: $("caseNextSteps"), addCaseFindingButton: $("addCaseFindingButton"), exportCaseMarkdownButton: $("exportCaseMarkdownButton"), exportCaseJsonButton: $("exportCaseJsonButton"), importCaseJsonButton: $("importCaseJsonButton"), caseFileInput: $("caseFileInput"), caseFindings: $("caseFindings"), addCaseMilestoneButton: $("addCaseMilestoneButton"), caseMilestones: $("caseMilestones"), addCaseAttachmentButton: $("addCaseAttachmentButton"), caseAttachmentInput: $("caseAttachmentInput"), caseAttachments: $("caseAttachments"), caseActivityMeta: $("caseActivityMeta"), caseActivityList: $("caseActivityList"),
      exceptionGroupCount: $("exceptionGroupCount"), exceptionDialog: $("exceptionDialog"), exceptionSummary: $("exceptionSummary"), exceptionTrend: $("exceptionTrend"), exceptionList: $("exceptionList"), closeExceptionButton: $("closeExceptionButton"), exceptionResetButton: $("exceptionResetButton"),
      healthIssueCount: $("healthIssueCount"), healthDialog: $("healthDialog"), healthSummary: $("healthSummary"), healthTableBody: $("healthTableBody"), closeHealthButton: $("closeHealthButton"), healthResetButton: $("healthResetButton"),
      processing: $("processing"), processingTitle: $("processingTitle"), processingDetail: $("processingDetail"), toastRegion: $("toastRegion")
    });

    ensureFoundationUi();
    Object.assign(el, {
      queryLibraryBulkCount: $("queryLibraryBulkCount"), queryLibraryBulkFolder: $("queryLibraryBulkFolder"), queryLibraryBulkSelectVisible: $("queryLibraryBulkSelectVisible"), queryLibraryBulkFavorite: $("queryLibraryBulkFavorite"), queryLibraryBulkUnfavorite: $("queryLibraryBulkUnfavorite"), queryLibraryBulkMove: $("queryLibraryBulkMove"), queryLibraryBulkExport: $("queryLibraryBulkExport"), queryLibraryBulkDelete: $("queryLibraryBulkDelete"), queryLibraryBulkClear: $("queryLibraryBulkClear"),
      baselineHistoryList: $("baselineHistoryList"), baselineHistoryExportButton: $("baselineHistoryExportButton"), baselineHistoryImportButton: $("baselineHistoryImportButton"), baselineHistoryFileInput: $("baselineHistoryFileInput"), baselineCompareBase: $("baselineCompareBase"), baselineCompareCurrent: $("baselineCompareCurrent"), compareSavedBaselinesButton: $("compareSavedBaselinesButton")
    });

    state.savedViews = utils().loadJson(STORAGE_VIEWS, null) || utils().loadJson("signaldock-saved-views-v2", null) || utils().loadJson("signaldock-saved-views-v1", []);
    state.settings = Object.assign(state.settings, utils().loadJson("signaldock-settings-v1", {}), utils().loadJson("signaldock-settings-v2", {}), utils().loadJson("signaldock-settings-v3", {}), utils().loadJson("signaldock-settings-v5", {}), utils().loadJson("signaldock-settings-v6", {}), utils().loadJson("signaldock-settings-v8", {}), utils().loadJson(STORAGE_SETTINGS, {}));
    state.investigation = window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] };
    state.caseFile = window.SignalDockCaseWorkspace?.empty?.("Investigation") || { title: "Investigation", status: "open", severity: "none", findings: [] };
    state.queryLibrary = window.SignalDockQueryLibrary?.load?.() || [];
    state.baselineHistory = window.SignalDockBaselineManager?.loadHistory?.() || [];
    state.projects = window.SignalDockProjectManager?.load?.() || [];
    state.activeProjectId = String(utils().loadJson("signaldock-active-project-v1", "") || "");
    state.caseCheckpoints = window.SignalDockCaseCheckpoints?.normalizeList?.([]) || [];
    renderProjects();
    applySettings();
    refreshSavedParserProfiles();
    profiler()?.observeLongTasks?.();
    scheduleDatasetAutosave = utils().debounce(() => autosaveDataset(), 1400);
    scheduleViewAutosave = utils().debounce(() => autosaveView(), 450);
    bindEvents();
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

    document.querySelectorAll("[data-inspector-tab]").forEach((button) => button.addEventListener("click", () => {
      state.inspectorTab = button.dataset.inspectorTab;
      renderInspectorTab();
      scheduleViewAutosave();
    }));
    el.closeInspector.addEventListener("click", closeInspector);
    el.copyButton.addEventListener("click", copySelectedRaw);
    el.filterBySourceButton.addEventListener("click", filterBySelectedSource);
    el.filterByServiceButton.addEventListener("click", filterBySelectedService);
    el.addEvidenceButton?.addEventListener("click", addSelectedEvidence);
    el.closeInvestigationButton?.addEventListener("click", closeInvestigation);
    el.exportInvestigationBundleButton?.addEventListener("click", exportInvestigationBundle);
    el.exportInvestigationMarkdownButton?.addEventListener("click", exportInvestigationMarkdown);
    el.exportInvestigationJsonButton?.addEventListener("click", exportInvestigationJson);
    el.importInvestigationJsonButton?.addEventListener("click", () => el.investigationFileInput?.click());
    el.investigationFileInput?.addEventListener("change", importInvestigationJson);
    el.clearInvestigationButton?.addEventListener("click", clearInvestigation);
    el.investigationTitle?.addEventListener("input", persistInvestigationMeta);
    el.investigationSummary?.addEventListener("input", persistInvestigationMeta);
    el.investigationList?.addEventListener("click", onInvestigationClick);
    el.investigationList?.addEventListener("change", onInvestigationEdit);
    [el.caseStatus, el.caseSeverity].forEach((control) => control?.addEventListener("change", persistCaseMeta));
    [el.caseHypothesis, el.caseImpact, el.caseNextSteps].forEach((control) => control?.addEventListener("input", persistCaseMeta));
    el.addCaseFindingButton?.addEventListener("click", addCaseFinding);
    el.exportCaseMarkdownButton?.addEventListener("click", exportCaseMarkdown);
    el.exportCaseJsonButton?.addEventListener("click", exportCaseJson);
    el.importCaseJsonButton?.addEventListener("click", () => el.caseFileInput?.click());
    el.caseFileInput?.addEventListener("change", importCaseJson);
    el.caseFindings?.addEventListener("input", onCaseFindingEdit);
    el.caseFindings?.addEventListener("change", onCaseFindingEdit);
    el.caseFindings?.addEventListener("click", onCaseFindingClick);
    el.addCaseMilestoneButton?.addEventListener("click", addCaseMilestone);
    el.caseMilestones?.addEventListener("click", onCaseMilestoneClick);
    el.caseMilestones?.addEventListener("change", onCaseMilestoneEdit);
    el.caseMilestones?.addEventListener("input", onCaseMilestoneEdit);
    el.addCaseAttachmentButton?.addEventListener("click", () => el.caseAttachmentInput?.click());
    el.caseAttachmentInput?.addEventListener("change", addCaseAttachmentMetadata);
    el.caseAttachments?.addEventListener("click", onCaseAttachmentClick);
    el.caseAttachments?.addEventListener("input", onCaseAttachmentEdit);
    el.closeExceptionButton?.addEventListener("click", closeExceptions);
    el.exceptionResetButton?.addEventListener("click", () => { state.exceptionViewFingerprint = ""; renderExceptions(); });
    el.exceptionList?.addEventListener("click", onExceptionClick);
    el.closeHealthButton?.addEventListener("click", closeHealth);
    el.healthResetButton?.addEventListener("click", () => { state.healthScopeFiltered = false; renderHealth(false); });
    el.healthTableBody?.addEventListener("click", onHealthClick);
    el.closeServiceMatrixButton?.addEventListener("click", closeServiceMatrix);
    el.serviceMatrixResetButton?.addEventListener("click", () => { state.serviceMatrixScopeFiltered = false; renderServiceMatrix(false); });
    el.serviceMatrixBody?.addEventListener("click", onServiceMatrixClick);
    el.closeServiceHeatmapButton?.addEventListener("click", closeServiceHeatmap);
    el.serviceHeatmapResetButton?.addEventListener("click", () => { state.serviceHeatmapScopeFiltered = false; renderServiceHeatmap(false); });
    el.serviceHeatmapBody?.addEventListener("click", onServiceHeatmapClick);
    el.closeServiceTrendsButton?.addEventListener("click", closeServiceTrends);
    el.serviceTrendsResetButton?.addEventListener("click", () => { state.serviceTrendsScopeFiltered = false; renderServiceTrends(false); });
    el.serviceTrendsSplit?.addEventListener("change", () => { state.serviceTrendsSplit = Number(el.serviceTrendsSplit.value) || 0.5; renderServiceTrends(); });
    el.serviceTrendsBody?.addEventListener("click", onServiceTrendsClick);
    el.closeTraceExplorerButton?.addEventListener("click", closeTraceExplorer);
    el.traceExplorerResetButton?.addEventListener("click", () => { state.traceExplorerScopeFiltered = false; renderTraceExplorer(false); });
    el.traceExplorerBody?.addEventListener("click", onTraceExplorerClick);
    el.traceCompareButton?.addEventListener("click", openTraceComparison);
    el.closeTraceCompareButton?.addEventListener("click", closeTraceComparison);
    el.closeTraceOutlierButton?.addEventListener("click", closeTraceOutliers);
    el.traceOutlierResetButton?.addEventListener("click", () => { state.traceOutlierScopeFiltered = false; renderTraceOutliers(false); });
    el.traceOutlierBody?.addEventListener("click", onTraceOutlierClick);
    el.closeQueryLibraryButton?.addEventListener("click", closeQueryLibrary);
    el.queryLibrarySaveButton?.addEventListener("click", saveCurrentQueryToLibrary);
    el.queryLibraryExportButton?.addEventListener("click", exportQueryLibrary);
    el.queryLibraryImportButton?.addEventListener("click", () => el.queryLibraryFileInput?.click());
    el.queryLibraryFileInput?.addEventListener("change", importQueryLibrary);
    el.queryLibraryList?.addEventListener("click", onQueryLibraryClick);
    el.queryLibraryList?.addEventListener("change", onQueryLibraryChange);
    el.queryLibrarySearch?.addEventListener("input", () => { state.queryLibrarySearch = el.queryLibrarySearch.value || ""; renderQueryLibrary(); });
    el.queryLibraryFolderFilter?.addEventListener("change", () => { state.queryLibraryFolderFilter = el.queryLibraryFolderFilter.value || "*"; renderQueryLibrary(); });
    el.queryLibraryRenameFolderButton?.addEventListener("click", renameQueryLibraryFolder);
    el.queryLibraryDeleteFolderButton?.addEventListener("click", moveQueryLibraryFolderToGeneral);
    el.queryLibraryBulkSelectVisible?.addEventListener("click", selectVisibleQueries);
    el.queryLibraryBulkFavorite?.addEventListener("click", () => bulkUpdateQueries({ favorite: true }, "Selected queries favorited."));
    el.queryLibraryBulkUnfavorite?.addEventListener("click", () => bulkUpdateQueries({ favorite: false }, "Selected queries unfavorited."));
    el.queryLibraryBulkMove?.addEventListener("click", moveSelectedQueries);
    el.queryLibraryBulkExport?.addEventListener("click", exportSelectedQueries);
    el.queryLibraryBulkDelete?.addEventListener("click", deleteSelectedQueries);
    el.queryLibraryBulkClear?.addEventListener("click", () => { state.queryLibrarySelection = []; renderQueryLibrary(); });
    el.caseTimelineFilter?.addEventListener("change", () => { state.caseTimelineFilter = el.caseTimelineFilter.value || "all"; renderCaseUnifiedTimeline(); });
    el.caseTimelineList?.addEventListener("click", onCaseTimelineClick);

    el.closeBaselineButton?.addEventListener("click", closeBaseline);
    el.captureBaselineButton?.addEventListener("click", () => captureBaseline(false));
    el.captureFilteredBaselineButton?.addEventListener("click", () => captureBaseline(true));
    el.exportBaselineButton?.addEventListener("click", exportBaseline);
    el.importBaselineButton?.addEventListener("click", () => el.baselineFileInput?.click());
    el.baselineFileInput?.addEventListener("change", importBaseline);
    el.baselineServiceBody?.addEventListener("click", onBaselineServiceClick);
    el.baselineDependencyBody?.addEventListener("click", onBaselineDependencyClick);
    el.baselineHistoryList?.addEventListener("click", onBaselineHistoryClick);
    el.baselineHistoryExportButton?.addEventListener("click", exportBaselineHistory);
    el.baselineHistoryImportButton?.addEventListener("click", () => el.baselineHistoryFileInput?.click());
    el.baselineHistoryFileInput?.addEventListener("change", importBaselineHistory);
    el.compareSavedBaselinesButton?.addEventListener("click", compareSavedBaselines);
    el.baselineCompareBase?.addEventListener("change", syncBaselineHistorySelection);
    el.baselineCompareCurrent?.addEventListener("change", syncBaselineHistorySelection);
    el.closeProjectButton?.addEventListener("click", closeProjects);
    el.createProjectButton?.addEventListener("click", createProject);
    el.projectLinkFilesButton?.addEventListener("click", linkAndLoadProjectFiles);
    el.exportProjectsButton?.addEventListener("click", exportProjects);
    el.importProjectsButton?.addEventListener("click", () => el.projectsFileInput?.click());
    el.projectsFileInput?.addEventListener("change", importProjects);
    el.projectList?.addEventListener("click", onProjectListClick);
    el.addCaseCheckpointButton?.addEventListener("click", createCaseCheckpoint);
    el.caseCheckpoints?.addEventListener("click", onCaseCheckpointClick);

    document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item === button));
      const target = button.dataset.nav;
      if (target === "search") el.queryInput.focus();
      if (target === "map") openServiceMap();
      if (target === "matrix") openServiceMatrix();
      if (target === "heatmap") openServiceHeatmap();
      if (target === "trends") openServiceTrends();
      if (target === "baseline") openBaseline();
      if (target === "traces") openTraceExplorer();
      if (target === "outliers") openTraceOutliers();
      if (target === "health") openHealth();
      if (target === "investigation") openInvestigation();
      if (target === "exceptions") openExceptions();
      if (target === "projects") openProjects();
      if (target === "settings") openSettings();
      if (target === "live") startLiveTail();
      if (target === "saved") openQueryLibrary();
    }));

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
    el.closeServiceMapButton?.addEventListener("click", closeServiceMap);
    el.serviceMapDialog?.addEventListener("close", () => {
      document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
    });
    el.healthDialog?.addEventListener("close", () => {
      document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
    });
    el.serviceMatrixDialog?.addEventListener("close", () => { document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs")); });
    el.serviceHeatmapDialog?.addEventListener("close", () => { document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs")); });
    el.serviceTrendsDialog?.addEventListener("close", () => { document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs")); });
    el.baselineDialog?.addEventListener("close", () => { document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs")); });
    el.projectDialog?.addEventListener("close", () => { document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs")); });
    el.traceExplorerDialog?.addEventListener("close", () => { document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs")); });
    el.traceCompareDialog?.addEventListener("close", () => { if (el.traceExplorerDialog?.open) return; document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs")); });
    el.traceOutlierDialog?.addEventListener("close", () => { document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs")); });
    el.queryLibraryDialog?.addEventListener("close", () => { document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs")); });
    el.investigationDialog?.addEventListener("close", () => {
      document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
    });
    el.exceptionDialog?.addEventListener("close", () => {
      document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
    });
    el.serviceMapResetButton?.addEventListener("click", () => renderServiceMap(null));
    el.serviceMapGroupBy?.addEventListener("change", () => { state.serviceMapGroupBy = el.serviceMapGroupBy.value || "service"; renderServiceMap(); });
    el.serviceMapList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-map-service]");
      if (!button) return;
      closeServiceMap();
      applyMapNodeFilter(button);
    });
    el.serviceMapCanvas?.addEventListener("click", (event) => {
      const node = event.target.closest("[data-map-service]");
      if (!node) return;
      closeServiceMap();
      applyMapNodeFilter(node);
    });
    el.serviceMapCanvas?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const node = event.target.closest("[data-map-service]");
      if (!node) return;
      event.preventDefault();
      closeServiceMap();
      applyMapNodeFilter(node);
    });

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
      toast("Live tail requires a browser with the File System Access API (Chromium-based browsers).", "error", 6500);
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
      if (state.activeProjectId && window.SignalDockProjectManager?.touchDataset) { for (const fileMeta of projectFiles) state.projects = window.SignalDockProjectManager.touchDataset(state.projects, state.activeProjectId, fileMeta); renderProjects(); }
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
    const traceIds = new Set((state.traceExplorerData?.rows || []).map((row) => row.traceId));
    state.traceCompareSelection = state.traceCompareSelection.filter((id) => traceIds.has(id)).slice(-2);
    if (el.traceCompareButton) { el.traceCompareButton.disabled = state.traceCompareSelection.length !== 2; el.traceCompareButton.textContent = `Compare selected (${state.traceCompareSelection.length}/2)`; }
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
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); icon.setAttribute("class", "icon");
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

  function renderInspectorTab() {
    document.querySelectorAll("[data-inspector-tab]").forEach((button) => {
      const active = button.dataset.inspectorTab === state.inspectorTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
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

  function openServiceMatrix() {
    if (!window.SignalDockServiceMatrix || !el.serviceMatrixDialog) return;
    if (!state.entries.length) { toast("Load logs before opening the service matrix."); return; }
    state.serviceMatrixScopeFiltered = true;
    renderServiceMatrix(true);
    closeCompetingDialogs("serviceMatrixDialog");
    showDialogSafely(el.serviceMatrixDialog);
  }

  function closeServiceMatrix() {
    if (!el.serviceMatrixDialog) return;
    if (typeof el.serviceMatrixDialog.close === "function" && el.serviceMatrixDialog.open) el.serviceMatrixDialog.close(); else el.serviceMatrixDialog.removeAttribute("open");
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
  }

  function renderServiceMatrix(useFiltered = state.serviceMatrixScopeFiltered) {
    if (!window.SignalDockServiceMatrix || !el.serviceMatrixBody) return;
    state.serviceMatrixScopeFiltered = Boolean(useFiltered);
    const scopedIndexes = state.serviceMatrixScopeFiltered && state.filteredIndexes.length && state.filteredIndexes.length < state.entries.length ? state.filteredIndexes : null;
    const matrix = scopedIndexes ? window.SignalDockServiceMatrix.build(state.entries, scopedIndexes) : (state.serviceMatrixData || window.SignalDockServiceMatrix.build(state.entries));
    if (el.serviceMatrixMeta) el.serviceMatrixMeta.textContent = `${state.serviceMatrixScopeFiltered && scopedIndexes ? "Current filtered result" : "All loaded logs"} · explicit parent-span relationships only.`;
    if (el.serviceMatrixSummary) {
      el.serviceMatrixSummary.replaceChildren();
      [["Services", matrix.summary.services], ["Edges", matrix.summary.edges], ["Calls", matrix.summary.calls], ["Errors", matrix.summary.errors], ["Timed spans", matrix.summary.timed]].forEach(([label, value]) => {
        const item = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = Number(value).toLocaleString(); const span = document.createElement("span"); span.textContent = label; item.append(strong, span); el.serviceMatrixSummary.appendChild(item);
      });
    }
    el.serviceMatrixBody.replaceChildren();
    if (!matrix.rows.length) {
      const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 9; td.className = "investigation-empty"; td.textContent = "No cross-service parent-span edges were found in this scope."; tr.appendChild(td); el.serviceMatrixBody.appendChild(tr); return;
    }
    matrix.rows.slice(0, 750).forEach((row) => {
      const tr = document.createElement("tr");
      const source = document.createElement("td"); source.textContent = row.source;
      const target = document.createElement("td"); target.textContent = row.target;
      const calls = document.createElement("td"); calls.textContent = row.calls.toLocaleString();
      const rate = document.createElement("td"); rate.textContent = `${(row.errorRate * 100).toFixed(row.errorRate < .01 ? 2 : 1)}%`; if (row.errors) rate.className = "matrix-error";
      const median = document.createElement("td"); median.textContent = row.medianMs === null ? "—" : formatDuration(row.medianMs);
      const p95 = document.createElement("td"); p95.textContent = row.p95Ms === null ? "—" : formatDuration(row.p95Ms);
      const max = document.createElement("td"); max.textContent = row.maxMs === null ? "—" : formatDuration(row.maxMs);
      const traces = document.createElement("td"); traces.textContent = row.traces.toLocaleString();
      const action = document.createElement("td");
      const from = document.createElement("button"); from.type = "button"; from.className = "button button--ghost button--small"; from.dataset.matrixService = row.source; from.textContent = "From";
      const to = document.createElement("button"); to.type = "button"; to.className = "button button--ghost button--small"; to.dataset.matrixService = row.target; to.textContent = "To";
      action.append(from, to); tr.append(source, target, calls, rate, median, p95, max, traces, action); el.serviceMatrixBody.appendChild(tr);
    });
  }

  function onServiceMatrixClick(event) {
    const button = event.target.closest("[data-matrix-service]"); if (!button) return;
    closeServiceMatrix(); filterByServiceValue(button.dataset.matrixService || "");
  }

  function openServiceHeatmap() {
    if (!window.SignalDockServiceHeatmap || !el.serviceHeatmapDialog) return;
    if (!state.entries.length) { toast("Load trace/span data before opening the dependency heatmap."); return; }
    state.serviceHeatmapScopeFiltered = true; renderServiceHeatmap(true); closeCompetingDialogs("serviceHeatmapDialog"); showDialogSafely(el.serviceHeatmapDialog);
  }

  function closeServiceHeatmap() {
    if (!el.serviceHeatmapDialog) return;
    if (typeof el.serviceHeatmapDialog.close === "function" && el.serviceHeatmapDialog.open) el.serviceHeatmapDialog.close(); else el.serviceHeatmapDialog.removeAttribute("open");
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
  }

  function renderServiceHeatmap(useFiltered = state.serviceHeatmapScopeFiltered) {
    if (!window.SignalDockServiceHeatmap || !el.serviceHeatmapBody) return;
    state.serviceHeatmapScopeFiltered = Boolean(useFiltered);
    const scopedIndexes = state.serviceHeatmapScopeFiltered && state.filteredIndexes.length && state.filteredIndexes.length < state.entries.length ? state.filteredIndexes : null;
    const data = scopedIndexes ? window.SignalDockServiceHeatmap.build(state.entries, scopedIndexes, { bucketCount: 12 }) : (state.serviceHeatmapData || window.SignalDockServiceHeatmap.build(state.entries, null, { bucketCount: 12 }));
    if (el.serviceHeatmapMeta) el.serviceHeatmapMeta.textContent = `${state.serviceHeatmapScopeFiltered && scopedIndexes ? "Current filtered result" : "All loaded logs"} · ${data.buckets.length} real-time buckets · explicit parent-span edges only.`;
    if (el.serviceHeatmapSummary) {
      el.serviceHeatmapSummary.replaceChildren();
      [["Edges", data.summary.edges], ["Calls", data.summary.calls], ["Errors", data.summary.errors], ["Timed calls", data.summary.timedCalls], ["Buckets", data.buckets.length]].forEach(([label, value]) => { const item = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = Number(value).toLocaleString(); const span = document.createElement("span"); span.textContent = label; item.append(strong, span); el.serviceHeatmapSummary.appendChild(item); });
    }
    el.serviceHeatmapBody.replaceChildren();
    if (!data.rows.length) { const empty = document.createElement("div"); empty.className = "investigation-empty"; empty.textContent = "No timestamped cross-service parent-span edges were found in this scope."; el.serviceHeatmapBody.appendChild(empty); return; }
    const scale = document.createElement("div"); scale.className = "dependency-heatmap-scale"; const scaleLabel=document.createElement("span"); scaleLabel.textContent="Time window"; const scaleRange=document.createElement("strong"); scaleRange.textContent=`${new Date(data.summary.startMs).toLocaleString()} → ${new Date(data.summary.endMs).toLocaleString()} · ${data.buckets.length} buckets`; scale.append(scaleLabel,scaleRange); el.serviceHeatmapBody.appendChild(scale);
    const maxCalls = Math.max(1, ...data.rows.flatMap((row) => row.buckets.map((bucket) => bucket.calls)));
    data.rows.slice(0, 250).forEach((row) => {
      const line = document.createElement("div"); line.className = "dependency-heatmap-row";
      const label = document.createElement("button"); label.type = "button"; label.className = "dependency-heatmap-label"; label.dataset.heatmapService = row.target; label.innerHTML = `<strong></strong><small></small>`; label.querySelector("strong").textContent = `${row.source} → ${row.target}`; label.querySelector("small").textContent = `${row.calls.toLocaleString()} calls · ${row.errors.toLocaleString()} errors`;
      const cells = document.createElement("div"); cells.className = "dependency-heatmap-cells";
      row.buckets.forEach((bucket, index) => { const cell = document.createElement("button"); cell.type = "button"; cell.className = "dependency-heatmap-cell"; const intensity = bucket.calls ? Math.max(.12, bucket.calls / maxCalls) : 0; const heatLevel = bucket.calls ? Math.max(1, Math.min(5, Math.ceil(intensity * 5))) : 0; if (heatLevel) cell.classList.add(`heat-${heatLevel}`); cell.classList.toggle("has-error", bucket.errors > 0); cell.title = `${new Date(data.buckets[index].startMs).toLocaleString()} · ${bucket.calls} calls · ${bucket.errors} errors${bucket.p95Ms === null ? "" : ` · p95 ${formatDuration(bucket.p95Ms)}`}`; cell.dataset.heatmapService = row.target; cells.appendChild(cell); });
      line.append(label, cells); el.serviceHeatmapBody.appendChild(line);
    });
  }

  function onServiceHeatmapClick(event) { const button = event.target.closest("[data-heatmap-service]"); if (!button) return; closeServiceHeatmap(); filterByServiceValue(button.dataset.heatmapService || ""); }

  function serviceTrendSplitMs(indexes) {
    const selected = Array.isArray(indexes) ? indexes : null; let min = Infinity; let max = -Infinity; let count = 0;
    const scan = selected || state.entries.keys();
    for (const index of scan) { const value = Number(state.entries[index]?.timestampMs); if (!Number.isFinite(value)) continue; count += 1; if (value < min) min = value; if (value > max) max = value; }
    if (count < 2) return null;
    const fraction = Math.max(0.1, Math.min(0.9, Number(state.serviceTrendsSplit) || 0.5));
    return min + ((max - min) * fraction);
  }

  function openServiceTrends() {
    if (!window.SignalDockServiceTrends || !el.serviceTrendsDialog) return;
    if (!state.entries.length) { toast("Load timestamped trace/span data before comparing dependency periods."); return; }
    state.serviceTrendsScopeFiltered = true; if (el.serviceTrendsSplit) el.serviceTrendsSplit.value = String(state.serviceTrendsSplit || 0.5); renderServiceTrends(true); closeCompetingDialogs("serviceTrendsDialog"); showDialogSafely(el.serviceTrendsDialog);
  }

  function closeServiceTrends() {
    if (!el.serviceTrendsDialog) return;
    if (typeof el.serviceTrendsDialog.close === "function" && el.serviceTrendsDialog.open) el.serviceTrendsDialog.close(); else el.serviceTrendsDialog.removeAttribute("open");
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
  }

  function renderServiceTrends(useFiltered = state.serviceTrendsScopeFiltered) {
    if (!window.SignalDockServiceTrends || !el.serviceTrendsBody) return;
    state.serviceTrendsScopeFiltered = Boolean(useFiltered);
    const scopedIndexes = state.serviceTrendsScopeFiltered && state.filteredIndexes.length && state.filteredIndexes.length < state.entries.length ? state.filteredIndexes : null;
    const splitMs = serviceTrendSplitMs(scopedIndexes);
    const data = window.SignalDockServiceTrends.compare(state.entries, scopedIndexes, { splitMs });
    if (!scopedIndexes && Number(state.serviceTrendsSplit) === 0.5) state.serviceTrendsData = data;
    if (el.serviceTrendsMeta) el.serviceTrendsMeta.textContent = `${state.serviceTrendsScopeFiltered && scopedIndexes ? "Current filtered result" : "All loaded logs"} · explicit parent-span edges only.`;
    if (el.serviceTrendsWindow) el.serviceTrendsWindow.textContent = data.windows ? `${new Date(data.windows.before.startMs).toLocaleString()} → ${new Date(data.windows.before.endMs).toLocaleString()}  vs  ${new Date(data.windows.after.startMs).toLocaleString()} → ${new Date(data.windows.after.endMs).toLocaleString()}` : "Not enough timestamped dependency data for two periods.";
    if (el.serviceTrendsSummary) {
      el.serviceTrendsSummary.replaceChildren();
      [["Edges",data.summary.edges],["Changed",data.summary.changed],["New",data.summary.newEdges],["Disappeared",data.summary.disappearedEdges],["Degrading",data.summary.degrading]].forEach(([label,value])=>{const item=document.createElement("div");const strong=document.createElement("strong");strong.textContent=Number(value||0).toLocaleString();const span=document.createElement("span");span.textContent=label;item.append(strong,span);el.serviceTrendsSummary.appendChild(item);});
    }
    el.serviceTrendsBody.replaceChildren();
    if (!data.rows.length) { const tr=document.createElement("tr");const td=document.createElement("td");td.colSpan=8;td.className="investigation-empty";td.textContent="No timestamped cross-service dependency edges were found across both comparison periods.";tr.appendChild(td);el.serviceTrendsBody.appendChild(tr);return; }
    data.rows.slice(0,500).forEach((row)=>{
      const tr=document.createElement("tr");
      const dependency=document.createElement("td");dependency.textContent=`${row.source} → ${row.target}`;
      const trend=document.createElement("td");const pill=document.createElement("span");pill.className=`trend-pill trend-pill--${row.trend}`;pill.textContent=row.trend;trend.appendChild(pill);
      const before=document.createElement("td");before.textContent=`${row.before.calls} calls · ${row.before.errors} err`;
      const after=document.createElement("td");after.textContent=`${row.after.calls} calls · ${row.after.errors} err`;
      const calls=document.createElement("td");calls.textContent=`${row.deltaCalls>=0?"+":""}${row.deltaCalls}`;
      const errors=document.createElement("td");errors.textContent=`${row.deltaErrors>=0?"+":""}${row.deltaErrors}`;
      const p95=document.createElement("td");p95.textContent=row.deltaP95Ms===null?"—":`${row.deltaP95Ms>=0?"+":"-"}${formatDuration(Math.abs(row.deltaP95Ms))}`;
      const action=document.createElement("td");const button=document.createElement("button");button.type="button";button.className="button button--ghost button--small";button.dataset.trendService=row.target;button.textContent="Filter target";action.appendChild(button);
      tr.append(dependency,trend,before,after,calls,errors,p95,action);el.serviceTrendsBody.appendChild(tr);
    });
  }

  function onServiceTrendsClick(event) { const button=event.target.closest("[data-trend-service]"); if(!button)return; closeServiceTrends(); filterByServiceValue(button.dataset.trendService||""); }

  function openTraceExplorer() {
    if (!window.SignalDockTraceExplorer || !el.traceExplorerDialog) return;
    if (!state.entries.length) { toast("Load trace/span data before opening Trace Explorer."); return; }
    state.traceExplorerScopeFiltered = true; renderTraceExplorer(true); closeCompetingDialogs("traceExplorerDialog"); showDialogSafely(el.traceExplorerDialog);
  }

  function closeTraceExplorer() {
    if (!el.traceExplorerDialog) return;
    if (typeof el.traceExplorerDialog.close === "function" && el.traceExplorerDialog.open) el.traceExplorerDialog.close(); else el.traceExplorerDialog.removeAttribute("open");
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
  }

  function renderTraceExplorer(useFiltered = state.traceExplorerScopeFiltered) {
    if (!window.SignalDockTraceExplorer || !el.traceExplorerBody) return;
    state.traceExplorerScopeFiltered = Boolean(useFiltered);
    const scopedIndexes = state.traceExplorerScopeFiltered && state.filteredIndexes.length && state.filteredIndexes.length < state.entries.length ? state.filteredIndexes : null;
    const data = scopedIndexes ? window.SignalDockTraceExplorer.buildWindow(state.entries, scopedIndexes, { limit: 1000 }) : (state.traceExplorerData || window.SignalDockTraceExplorer.buildWindow(state.entries, null, { limit: 1000 }));
    if (el.traceExplorerMeta) el.traceExplorerMeta.textContent = `${state.traceExplorerScopeFiltered && scopedIndexes ? "Current filtered result" : "All loaded logs"} · explicit trace IDs only${data.summary.truncated ? ` · showing ${data.summary.returned.toLocaleString()} of ${data.summary.traces.toLocaleString()} ranked traces` : ""}.`;
    if (el.traceExplorerSummary) {
      el.traceExplorerSummary.replaceChildren();
      [["Traces", data.summary.traces], ["With errors", data.summary.errors], ["Incomplete", data.summary.incomplete], ["Services", data.summary.services]].forEach(([label, value]) => { const item = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = Number(value).toLocaleString(); const span = document.createElement("span"); span.textContent = label; item.append(strong, span); el.traceExplorerSummary.appendChild(item); });
    }
    el.traceExplorerBody.replaceChildren();
    if (!data.rows.length) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 8; td.className = "investigation-empty"; td.textContent = "No explicit trace IDs were found in this scope."; tr.appendChild(td); el.traceExplorerBody.appendChild(tr); return; }
    data.rows.slice(0, 1000).forEach((row) => {
      const tr = document.createElement("tr");
      const id = document.createElement("td"); const code = document.createElement("code"); code.textContent = row.traceId; code.title = row.traceId; id.appendChild(code);
      const services = document.createElement("td"); services.textContent = row.services.slice(0, 4).join(", ") + (row.services.length > 4 ? ` +${row.services.length - 4}` : "");
      const spans = document.createElement("td"); spans.textContent = row.spans.toLocaleString();
      const errors = document.createElement("td"); errors.textContent = row.errors.toLocaleString(); if (row.errors) errors.className = "matrix-error";
      const events = document.createElement("td"); events.textContent = row.events.toLocaleString();
      const duration = document.createElement("td"); duration.textContent = row.durationMs === null ? "—" : formatDuration(row.durationMs);
      const coverage = document.createElement("td"); coverage.textContent = `${Math.round(row.parentCoverage * 100)}%`; coverage.className = row.parentCoverage < 1 ? "trace-coverage-partial" : "";
      const action = document.createElement("td");
      const button = document.createElement("button"); button.type = "button"; button.className = "button button--ghost button--small"; button.dataset.traceExplorerId = row.traceId; button.dataset.traceSampleIndex = String(row.sampleIndex); button.textContent = "Open";
      const compare = document.createElement("button"); compare.type = "button"; compare.className = "button button--ghost button--small trace-compare-select"; compare.dataset.traceCompareId = row.traceId; compare.textContent = state.traceCompareSelection.includes(row.traceId) ? "Selected" : "Compare"; compare.classList.toggle("is-selected", state.traceCompareSelection.includes(row.traceId));
      action.append(button, compare);
      tr.append(id, services, spans, errors, events, duration, coverage, action); el.traceExplorerBody.appendChild(tr);
    });
  }

  function onTraceExplorerClick(event) {
    const compareButton = event.target.closest("[data-trace-compare-id]");
    if (compareButton) {
      const traceId = compareButton.dataset.traceCompareId || ""; if (!traceId) return;
      const existing = state.traceCompareSelection.indexOf(traceId);
      if (existing >= 0) state.traceCompareSelection.splice(existing, 1); else { if (state.traceCompareSelection.length >= 2) state.traceCompareSelection.shift(); state.traceCompareSelection.push(traceId); }
      if (el.traceCompareButton) { el.traceCompareButton.disabled = state.traceCompareSelection.length !== 2; el.traceCompareButton.textContent = `Compare selected (${state.traceCompareSelection.length}/2)`; }
      renderTraceExplorer(state.traceExplorerScopeFiltered); return;
    }
    const button = event.target.closest("[data-trace-explorer-id]"); if (!button) return;
    const traceId = button.dataset.traceExplorerId || ""; const index = Number(button.dataset.traceSampleIndex);
    closeTraceExplorer();
    if (Number.isInteger(index) && state.entries[index]) { selectEntry(state.entries[index].id); state.inspectorTab = "trace"; renderInspector(); entryRowIntoView(index); }
    else if (traceId) filterByCorrelation("trace", traceId);
  }

  function openTraceComparison() {
    if (!window.SignalDockTraceCompare || !el.traceCompareDialog || state.traceCompareSelection.length !== 2) return;
    try {
      const result = window.SignalDockTraceCompare.compare(state.entries, state.traceCompareSelection[0], state.traceCompareSelection[1]);
      renderTraceComparison(result); closeCompetingDialogs("traceCompareDialog"); showDialogSafely(el.traceCompareDialog);
    } catch (error) { toast(error.message || String(error), "error", 6500); }
  }

  function closeTraceComparison() { if (!el.traceCompareDialog) return; if (typeof el.traceCompareDialog.close === "function" && el.traceCompareDialog.open) el.traceCompareDialog.close(); else el.traceCompareDialog.removeAttribute("open"); }

  function renderTraceComparison(result) {
    if (!el.traceCompareBody) return; el.traceCompareBody.replaceChildren();
    const metrics = [["Entries","entries"],["Spans","spans"],["Services","serviceCount"],["Errors","errors"],["Warnings","warnings"],["Span events","events"],["Trace duration","durationMs"],["Avg span","avgSpanMs"],["Parent coverage","parentCoverage"]];
    const header = document.createElement("div"); header.className = "trace-compare-summary";
    [result.left, result.right].forEach((side, index) => { const card = document.createElement("article"); const title = document.createElement("strong"); title.textContent = index ? "Trace B" : "Trace A"; const code = document.createElement("code"); code.textContent = side.traceId; const small = document.createElement("small"); small.textContent = side.services.join(", ") || "No service labels"; card.append(title, code, small); header.appendChild(card); });
    el.traceCompareBody.appendChild(header);
    const table = document.createElement("div"); table.className = "trace-compare-metrics";
    metrics.forEach(([label,key]) => { const row = document.createElement("div"); const l=document.createElement("strong"); l.textContent=label; const a=document.createElement("span"); const b=document.createElement("span"); const d=document.createElement("span"); const format=(v)=> key.includes("duration")||key==="avgSpanMs" ? (v===null?"—":formatDuration(v)) : key==="parentCoverage" ? `${Math.round((v||0)*100)}%` : Number(v||0).toLocaleString(); a.textContent=format(result.left[key]); b.textContent=format(result.right[key]); const delta=result.delta[key]; d.textContent=delta===null?"—": key==="parentCoverage" ? `${delta>=0?"+":""}${Math.round(delta*100)}pp` : key.includes("duration")||key==="avgSpanMs" ? `${delta>=0?"+":""}${formatDuration(Math.abs(delta))}${delta<0?" faster":""}` : `${delta>=0?"+":""}${Number(delta).toLocaleString()}`; d.className = delta > 0 ? "delta-positive" : delta < 0 ? "delta-negative" : ""; row.append(l,a,b,d); table.appendChild(row); });
    el.traceCompareBody.appendChild(table);
    const services = document.createElement("section"); services.className="trace-compare-services"; services.innerHTML = `<strong>Service set difference</strong><p></p>`; services.querySelector("p").textContent = `Shared: ${result.services.shared.join(", ") || "—"} · Only A: ${result.services.leftOnly.join(", ") || "—"} · Only B: ${result.services.rightOnly.join(", ") || "—"}`; el.traceCompareBody.appendChild(services);
  }

  function openTraceOutliers() {
    if (!window.SignalDockTraceOutliers || !el.traceOutlierDialog) return;
    if (!state.entries.length) { toast("Load trace/span data before ranking outliers."); return; }
    state.traceOutlierScopeFiltered = true; renderTraceOutliers(true); closeCompetingDialogs("traceOutlierDialog"); showDialogSafely(el.traceOutlierDialog);
  }

  function closeTraceOutliers() {
    if (!el.traceOutlierDialog) return;
    if (typeof el.traceOutlierDialog.close === "function" && el.traceOutlierDialog.open) el.traceOutlierDialog.close(); else el.traceOutlierDialog.removeAttribute("open");
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
  }

  function renderTraceOutliers(useFiltered = state.traceOutlierScopeFiltered) {
    if (!window.SignalDockTraceOutliers || !el.traceOutlierBody) return;
    state.traceOutlierScopeFiltered = Boolean(useFiltered);
    const scoped = state.traceOutlierScopeFiltered && state.filteredIndexes.length && state.filteredIndexes.length < state.entries.length ? state.filteredIndexes.map((index)=>state.entries[index]).filter(Boolean) : state.entries;
    const data = scoped === state.entries ? (state.traceOutlierData || window.SignalDockTraceOutliers.rank(scoped,{limit:250})) : window.SignalDockTraceOutliers.rank(scoped,{limit:250});
    if (el.traceOutlierMeta) el.traceOutlierMeta.textContent = `${state.traceOutlierScopeFiltered && scoped !== state.entries ? "Current filtered result" : "All loaded logs"} · robust duration baseline + explicit errors/service breadth.`;
    if (el.traceOutlierSummary) {
      el.traceOutlierSummary.replaceChildren();
      [["Traces",data.totalTraces],["Ranked",data.rows.length],["Timed",data.baseline.timedTraces],["Median duration",data.baseline.medianDurationMs===null?"—":formatDuration(data.baseline.medianDurationMs)]].forEach(([label,value])=>{const item=document.createElement("div");const strong=document.createElement("strong");strong.textContent=typeof value==="number"?value.toLocaleString():String(value);const span=document.createElement("span");span.textContent=label;item.append(strong,span);el.traceOutlierSummary.appendChild(item);});
    }
    el.traceOutlierBody.replaceChildren();
    if (!data.rows.length) { const tr=document.createElement("tr");const td=document.createElement("td");td.colSpan=7;td.className="investigation-empty";td.textContent="No trace has enough measured latency/error signal to rank as an outlier in this scope.";tr.appendChild(td);el.traceOutlierBody.appendChild(tr);return; }
    data.rows.forEach((row)=>{const tr=document.createElement("tr");const id=document.createElement("td");const code=document.createElement("code");code.textContent=row.traceId;code.title=row.traceId;id.appendChild(code);const score=document.createElement("td");score.className="trace-outlier-score";score.textContent=row.score.toFixed(2);const duration=document.createElement("td");duration.textContent=row.durationMs===null?"—":formatDuration(row.durationMs);const errors=document.createElement("td");errors.textContent=row.errors.toLocaleString();if(row.errors)errors.className="matrix-error";const services=document.createElement("td");services.textContent=`${row.serviceCount} · ${row.services.slice(0,3).join(", ")}${row.services.length>3?` +${row.services.length-3}`:""}`;const reasons=document.createElement("td");reasons.className="trace-outlier-reasons";(row.reasons.length?row.reasons:["ranked by measured trace shape"]).forEach((reason)=>{const tag=document.createElement("span");tag.textContent=reason;reasons.appendChild(tag);});const action=document.createElement("td");const button=document.createElement("button");button.type="button";button.className="button button--primary button--small";button.dataset.outlierTrace=row.traceId;button.textContent="Open trace";action.appendChild(button);tr.append(id,score,duration,errors,services,reasons,action);el.traceOutlierBody.appendChild(tr);});
  }

  function onTraceOutlierClick(event) { const button=event.target.closest("[data-outlier-trace]"); if(!button)return; const traceId=button.dataset.outlierTrace||""; closeTraceOutliers(); if(!traceId)return; el.queryInput.value=`trace:${traceId}`; applyFilters(true); const first=state.entries.find((entry)=>entry.correlations?.trace===traceId); if(first){selectEntry(first.id); setTimeout(()=>{state.inspectorTab="trace";renderInspector();},0);} }

  function makeUiButton(id, label, className = "button button--ghost button--small") {
    const button = document.createElement("button"); button.type = "button"; button.id = id; button.className = className; button.textContent = label; return button;
  }

  function ensureFoundationUi() {
    const queryList = $("queryLibraryList");
    if (queryList && !$("queryLibraryBulkBar")) {
      const bar = document.createElement("div"); bar.id = "queryLibraryBulkBar"; bar.className = "query-library-bulkbar";
      const count = document.createElement("strong"); count.id = "queryLibraryBulkCount"; count.textContent = "0 selected";
      const folder = document.createElement("select"); folder.id = "queryLibraryBulkFolder"; folder.setAttribute("aria-label", "Bulk destination folder");
      bar.append(count, makeUiButton("queryLibraryBulkSelectVisible", "Select visible"), folder, makeUiButton("queryLibraryBulkMove", "Move"), makeUiButton("queryLibraryBulkFavorite", "Favorite"), makeUiButton("queryLibraryBulkUnfavorite", "Unfavorite"), makeUiButton("queryLibraryBulkExport", "Export selected"), makeUiButton("queryLibraryBulkDelete", "Delete selected"), makeUiButton("queryLibraryBulkClear", "Clear selection"));
      queryList.parentNode.insertBefore(bar, queryList);
    }
    const baselineToolbar = document.querySelector("#baselineDialog .baseline-toolbar");
    if (baselineToolbar && !$("baselineHistoryList")) {
      const section = document.createElement("section"); section.className = "baseline-history";
      const head = document.createElement("div"); head.className = "baseline-history__head";
      const copy = document.createElement("div"); const eyebrow = document.createElement("span"); eyebrow.textContent = "LOCAL BASELINE HISTORY"; const title = document.createElement("strong"); title.textContent = "Saved aggregate snapshots"; copy.append(eyebrow, title);
      const actions = document.createElement("div"); actions.append(makeUiButton("baselineHistoryExportButton", "Export history"), makeUiButton("baselineHistoryImportButton", "Import history"));
      const input = document.createElement("input"); input.id = "baselineHistoryFileInput"; input.type = "file"; input.accept = ".json,.sdbaselines"; input.hidden = true; actions.appendChild(input); head.append(copy, actions);
      const compare = document.createElement("div"); compare.className = "baseline-history__compare";
      const baseLabel = document.createElement("label"); const baseSpan = document.createElement("span"); baseSpan.textContent = "Baseline"; const baseSelect = document.createElement("select"); baseSelect.id = "baselineCompareBase"; baseLabel.append(baseSpan, baseSelect);
      const currentLabel = document.createElement("label"); const currentSpan = document.createElement("span"); currentSpan.textContent = "Current snapshot"; const currentSelect = document.createElement("select"); currentSelect.id = "baselineCompareCurrent"; currentLabel.append(currentSpan, currentSelect);
      compare.append(baseLabel, currentLabel, makeUiButton("compareSavedBaselinesButton", "Compare saved baselines", "button button--primary button--small"));
      const list = document.createElement("div"); list.id = "baselineHistoryList"; list.className = "baseline-history__list";
      section.append(head, compare, list); baselineToolbar.insertAdjacentElement("afterend", section);
    }
  }

  function openQueryLibrary() {
    if (!window.SignalDockQueryLibrary || !el.queryLibraryDialog) return;
    state.queryLibrary = window.SignalDockQueryLibrary.load(); renderQueryLibrary(); closeCompetingDialogs("queryLibraryDialog"); showDialogSafely(el.queryLibraryDialog);
  }

  function closeQueryLibrary() {
    if (!el.queryLibraryDialog) return;
    if (typeof el.queryLibraryDialog.close === "function" && el.queryLibraryDialog.open) el.queryLibraryDialog.close(); else el.queryLibraryDialog.removeAttribute("open");
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
  }

  function renderQueryLibraryBulk(folderNames, visible) {
    const ids = new Set(state.queryLibrary.map((item) => item.id)); state.queryLibrarySelection = state.queryLibrarySelection.filter((id) => ids.has(id));
    if (el.queryLibraryBulkCount) el.queryLibraryBulkCount.textContent = `${state.queryLibrarySelection.length.toLocaleString()} selected`;
    if (el.queryLibraryBulkFolder) { const current = el.queryLibraryBulkFolder.value || "General"; const names = folderNames.length ? folderNames : ["General"]; el.queryLibraryBulkFolder.replaceChildren(...names.map((name) => new Option(name, name))); el.queryLibraryBulkFolder.value = names.includes(current) ? current : (names.includes("General") ? "General" : names[0]); }
    const hasSelection = state.queryLibrarySelection.length > 0;
    [el.queryLibraryBulkFavorite, el.queryLibraryBulkUnfavorite, el.queryLibraryBulkMove, el.queryLibraryBulkExport, el.queryLibraryBulkDelete, el.queryLibraryBulkClear].forEach((button) => { if (button) button.disabled = !hasSelection; });
    if (el.queryLibraryBulkSelectVisible) el.queryLibraryBulkSelectVisible.disabled = !visible.length;
  }

  function renderQueryLibrary() {
    if (!el.queryLibraryList || !window.SignalDockQueryLibrary) return;
    state.queryLibrary = window.SignalDockQueryLibrary.normalize(state.queryLibrary); if (el.savedCount) el.savedCount.textContent = state.queryLibrary.length.toLocaleString();
    const folderRows = window.SignalDockQueryLibrary.folders(state.queryLibrary); const folderNames = folderRows.map((item) => item.name); if (!folderNames.includes("General")) folderNames.unshift("General");
    if (el.queryLibraryFolderFilter) { const current = state.queryLibraryFolderFilter || "*"; el.queryLibraryFolderFilter.replaceChildren(new Option("All folders", "*"), ...folderRows.map((item) => new Option(`${item.name} (${item.count})`, item.name))); el.queryLibraryFolderFilter.value = folderRows.some((item) => item.name === current) || current === "*" ? current : "*"; state.queryLibraryFolderFilter = el.queryLibraryFolderFilter.value; }
    if (el.queryLibraryManageFolder) { const current = el.queryLibraryManageFolder.value || folderNames[0]; el.queryLibraryManageFolder.replaceChildren(...folderNames.map((name) => new Option(name, name))); el.queryLibraryManageFolder.value = folderNames.includes(current) ? current : folderNames[0]; }
    if (el.queryLibrarySearch && el.queryLibrarySearch.value !== state.queryLibrarySearch) el.queryLibrarySearch.value = state.queryLibrarySearch || "";
    const visible = window.SignalDockQueryLibrary.search(state.queryLibrary, state.queryLibrarySearch, state.queryLibraryFolderFilter); renderQueryLibraryBulk(folderNames, visible); el.queryLibraryList.replaceChildren();
    if (!visible.length) { const empty = document.createElement("div"); empty.className = "case-findings__empty"; empty.textContent = state.queryLibrary.length ? "No reusable queries match the current library search/filter." : "No reusable queries saved yet."; el.queryLibraryList.appendChild(empty); return; }
    let activeFolder = "";
    visible.forEach((item) => {
      if (item.folder !== activeFolder) { activeFolder = item.folder; const heading = document.createElement("div"); heading.className = "query-library-folder"; const strong = document.createElement("strong"); strong.textContent = activeFolder; const count = document.createElement("span"); count.textContent = `${visible.filter((candidate) => candidate.folder === activeFolder).length} visible`; heading.append(strong, count); el.queryLibraryList.appendChild(heading); }
      const card = document.createElement("article"); card.className = "query-library-item"; card.classList.toggle("is-favorite", item.favorite); card.classList.toggle("is-selected", state.queryLibrarySelection.includes(item.id));
      const select = document.createElement("input"); select.type = "checkbox"; select.className = "query-library-select"; select.dataset.queryLibrarySelect = item.id; select.checked = state.queryLibrarySelection.includes(item.id); select.setAttribute("aria-label", `Select ${item.name}`);
      const copy = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = `${item.favorite ? "★ " : ""}${item.name}`; const code = document.createElement("code"); code.textContent = item.query || "(no text query)"; const small = document.createElement("small"); const usage = item.useCount ? `used ${item.useCount}${item.lastUsedAt ? ` · last ${new Date(item.lastUsedAt).toLocaleString()}` : ""}` : "never applied"; small.textContent = [item.folder, item.description, item.tags.length ? item.tags.join(" · ") : "", item.level || "", item.timeRange || "", usage].filter(Boolean).join(" · "); copy.append(strong, code, small);
      const actions = document.createElement("div"); const favorite = makeUiButton("", item.favorite ? "Unfavorite" : "Favorite"); favorite.dataset.queryLibraryAction = "favorite"; favorite.dataset.queryLibraryId = item.id; const duplicate = makeUiButton("", "Duplicate"); duplicate.dataset.queryLibraryAction = "duplicate"; duplicate.dataset.queryLibraryId = item.id; const move = document.createElement("select"); move.className = "query-library-move"; move.dataset.queryLibraryMove = item.id; move.title = "Move query to folder"; move.replaceChildren(...folderNames.map((name) => new Option(name, name))); move.value = item.folder; const apply = makeUiButton("", "Apply", "button button--primary button--small"); apply.dataset.queryLibraryAction = "apply"; apply.dataset.queryLibraryId = item.id; const remove = makeUiButton("", "Remove"); remove.dataset.queryLibraryAction = "remove"; remove.dataset.queryLibraryId = item.id; actions.append(favorite, duplicate, move, apply, remove); card.append(select, copy, actions); el.queryLibraryList.appendChild(card);
    });
  }

  function saveCurrentQueryToLibrary() {
    if (!window.SignalDockQueryLibrary) return; const name = el.queryLibraryName?.value.trim() || buildViewName() || "Reusable query";
    try { state.queryLibrary = window.SignalDockQueryLibrary.upsert(state.queryLibrary, { name, folder: el.queryLibraryFolder?.value || "General", favorite: Boolean(el.queryLibraryFavorite?.checked), description: el.queryLibraryDescription?.value || "", tags: el.queryLibraryTags?.value || "", query: el.queryInput.value.trim(), level: el.levelFilter.value, source: el.sourceFilter.value, timeRange: el.timeFilter.value, sortMode: el.sortFilter.value }); if (el.queryLibraryName) el.queryLibraryName.value = ""; if (el.queryLibraryFolder) el.queryLibraryFolder.value = ""; if (el.queryLibraryFavorite) el.queryLibraryFavorite.checked = false; if (el.queryLibraryDescription) el.queryLibraryDescription.value = ""; if (el.queryLibraryTags) el.queryLibraryTags.value = ""; renderQueryLibrary(); toast(`Saved query “${name}”.`); } catch (error) { toast(error.message || String(error), "error", 6500); }
  }

  function onQueryLibraryClick(event) {
    const button = event.target.closest("[data-query-library-action]"); if (!button) return; const item = state.queryLibrary.find((candidate) => candidate.id === button.dataset.queryLibraryId); if (!item) return;
    if (button.dataset.queryLibraryAction === "remove") { state.queryLibrary = window.SignalDockQueryLibrary.remove(state.queryLibrary, item.id); state.queryLibrarySelection = state.queryLibrarySelection.filter((id) => id !== item.id); renderQueryLibrary(); return; }
    if (button.dataset.queryLibraryAction === "favorite") { state.queryLibrary = window.SignalDockQueryLibrary.toggleFavorite(state.queryLibrary, item.id); renderQueryLibrary(); return; }
    if (button.dataset.queryLibraryAction === "duplicate") { try { state.queryLibrary = window.SignalDockQueryLibrary.duplicate(state.queryLibrary, item.id); renderQueryLibrary(); toast(`Duplicated query “${item.name}”.`); } catch (error) { toast(error.message || String(error), "error"); } return; }
    state.queryLibrary = window.SignalDockQueryLibrary.markUsed(state.queryLibrary, item.id); el.queryInput.value = item.query || ""; el.levelFilter.value = Array.from(el.levelFilter.options).some((option) => option.value === item.level) ? item.level : ""; el.sourceFilter.value = Array.from(el.sourceFilter.options).some((option) => option.value === item.source) ? item.source : ""; el.timeFilter.value = Array.from(el.timeFilter.options).some((option) => option.value === item.timeRange) ? item.timeRange : ""; el.sortFilter.value = Array.from(el.sortFilter.options).some((option) => option.value === item.sortMode) ? item.sortMode : "original"; syncLevelChips(el.levelFilter.value); closeQueryLibrary(); applyFilters(true); toast(`Applied query “${item.name}”.`);
  }

  function onQueryLibraryChange(event) {
    const checkbox = event.target.closest("[data-query-library-select]"); if (checkbox) { const id = checkbox.dataset.queryLibrarySelect; state.queryLibrarySelection = checkbox.checked ? [...new Set([...state.queryLibrarySelection, id])] : state.queryLibrarySelection.filter((value) => value !== id); renderQueryLibrary(); return; }
    const select = event.target.closest("[data-query-library-move]"); if (!select || !window.SignalDockQueryLibrary) return; state.queryLibrary = window.SignalDockQueryLibrary.moveToFolder(state.queryLibrary, select.dataset.queryLibraryMove, select.value || "General"); renderQueryLibrary();
  }
  function selectVisibleQueries() { const visible = window.SignalDockQueryLibrary.search(state.queryLibrary, state.queryLibrarySearch, state.queryLibraryFolderFilter); state.queryLibrarySelection = [...new Set([...state.queryLibrarySelection, ...visible.map((item) => item.id)])]; renderQueryLibrary(); }
  function bulkUpdateQueries(patch, message) { if (!state.queryLibrarySelection.length) return; state.queryLibrary = window.SignalDockQueryLibrary.bulkUpdate(state.queryLibrary, state.queryLibrarySelection, patch); renderQueryLibrary(); if (message) toast(message); }
  function moveSelectedQueries() { if (!el.queryLibraryBulkFolder?.value) return; bulkUpdateQueries({ folder: el.queryLibraryBulkFolder.value }, `Moved ${state.queryLibrarySelection.length} selected queries.`); }
  function deleteSelectedQueries() { if (!state.queryLibrarySelection.length || !window.confirm(`Delete ${state.queryLibrarySelection.length} selected reusable queries?`)) return; state.queryLibrary = window.SignalDockQueryLibrary.bulkRemove(state.queryLibrary, state.queryLibrarySelection); state.queryLibrarySelection = []; renderQueryLibrary(); toast("Selected queries deleted."); }
  async function exportSelectedQueries() { if (!state.queryLibrarySelection.length) return; const text = window.SignalDockQueryLibrary.exportSelected(state.queryLibrary, state.queryLibrarySelection); const name = `signaldock-query-selection-${new Date().toISOString().slice(0,10)}.json`; if (window.SignalDockStorageAdapter?.saveText) await window.SignalDockStorageAdapter.saveText({ name, text, mime: "application/json;charset=utf-8" }); else utils().downloadParts(name, [text], "application/json;charset=utf-8"); toast(`Exported ${state.queryLibrarySelection.length} selected queries.`); }
  function renameQueryLibraryFolder() { if (!window.SignalDockQueryLibrary || !el.queryLibraryManageFolder || !el.queryLibraryRenameFolder) return; const from = el.queryLibraryManageFolder.value || "General"; const to = el.queryLibraryRenameFolder.value.trim(); if (!to) { toast("Enter a new folder name.", "error"); return; } state.queryLibrary = window.SignalDockQueryLibrary.renameFolder(state.queryLibrary, from, to); state.queryLibraryFolderFilter = to; el.queryLibraryRenameFolder.value = ""; renderQueryLibrary(); toast(`Renamed query folder “${from}” to “${to}”.`); }
  function moveQueryLibraryFolderToGeneral() { if (!window.SignalDockQueryLibrary || !el.queryLibraryManageFolder) return; const folder = el.queryLibraryManageFolder.value || "General"; if (folder === "General") { toast("General is the fallback folder."); return; } state.queryLibrary = window.SignalDockQueryLibrary.deleteFolder(state.queryLibrary, folder, "General"); state.queryLibraryFolderFilter = "*"; renderQueryLibrary(); toast(`Moved queries from “${folder}” to General.`); }
  async function exportQueryLibrary() { if (!window.SignalDockQueryLibrary) return; const name = `signaldock-query-library-${new Date().toISOString().slice(0,10)}.json`; const text = window.SignalDockQueryLibrary.exportJson(state.queryLibrary); if (window.SignalDockStorageAdapter?.saveText) await window.SignalDockStorageAdapter.saveText({ name, text, mime: "application/json;charset=utf-8" }); else utils().downloadParts(name, [text], "application/json;charset=utf-8"); toast("Query library exported."); }
  async function importQueryLibrary(event) { const file = event.target.files?.[0]; if (!file || !window.SignalDockQueryLibrary) return; try { state.queryLibrary = window.SignalDockQueryLibrary.importJson(await file.text(), state.queryLibrary); renderQueryLibrary(); toast(`Imported ${state.queryLibrary.length.toLocaleString()} query library item${state.queryLibrary.length === 1 ? "" : "s"}.`); } catch (error) { toast(`Could not import query library: ${error.message || error}`, "error", 6500); } finally { event.target.value = ""; } }

  function formatDelta(value, suffix = "") { if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—"; const number = Number(value); const sign = number > 0 ? "+" : ""; return `${sign}${Math.abs(number) < 1 && suffix === "%" ? (number * 100).toFixed(1) : number.toFixed(Math.abs(number) >= 100 ? 0 : 1)}${suffix}`; }
  function currentBaselineSnapshot(scopeFiltered = false) { if (!window.SignalDockBaselineManager || !state.entries.length) return null; return window.SignalDockBaselineManager.snapshot(state.entries, scopeFiltered ? state.filteredIndexes : null, { appVersion: APP_VERSION, name: el.baselineName?.value?.trim() || "Current dataset", scope: scopeFiltered ? "filtered" : "all" }); }
  function openBaseline() { closeCompetingDialogs("baselineDialog"); renderBaseline(); showDialogSafely(el.baselineDialog); }
  function closeBaseline() { if (el.baselineDialog?.open) el.baselineDialog.close(); else el.baselineDialog?.removeAttribute("open"); }
  function baselineProjectName(projectId) { return state.projects.find((project) => project.id === projectId)?.name || "Unassigned"; }
  function syncBaselineHistorySelection() { state.baselineHistorySelection = { baseId: el.baselineCompareBase?.value || "", currentId: el.baselineCompareCurrent?.value || "" }; if (el.compareSavedBaselinesButton) el.compareSavedBaselinesButton.disabled = !state.baselineHistorySelection.baseId || !state.baselineHistorySelection.currentId || state.baselineHistorySelection.baseId === state.baselineHistorySelection.currentId; }
  function renderBaselineHistory() {
    if (!window.SignalDockBaselineManager || !el.baselineHistoryList) return; state.baselineHistory = window.SignalDockBaselineManager.normalizeHistory(state.baselineHistory); const items = state.baselineHistory;
    const previousBase = state.baselineHistorySelection.baseId || el.baselineCompareBase?.value || ""; const previousCurrent = state.baselineHistorySelection.currentId || el.baselineCompareCurrent?.value || ""; const options = () => [new Option("Choose saved baseline…", ""), ...items.map((item) => new Option(`${item.baseline.name} · ${baselineProjectName(item.projectId)} · ${item.baseline.entries.toLocaleString()} entries`, item.id))];
    if (el.baselineCompareBase) { el.baselineCompareBase.replaceChildren(...options()); el.baselineCompareBase.value = items.some((item) => item.id === previousBase) ? previousBase : (items[1]?.id || ""); }
    if (el.baselineCompareCurrent) { el.baselineCompareCurrent.replaceChildren(...options()); el.baselineCompareCurrent.value = items.some((item) => item.id === previousCurrent) ? previousCurrent : (items[0]?.id || ""); }
    syncBaselineHistorySelection(); el.baselineHistoryList.replaceChildren();
    if (!items.length) { const empty = document.createElement("div"); empty.className = "case-findings__empty"; empty.textContent = "No saved baselines yet. Captured and imported baselines will appear here."; el.baselineHistoryList.appendChild(empty); return; }
    items.forEach((item) => { const row = document.createElement("article"); row.className = `baseline-history-row${state.baselineSnapshot?.id === item.baseline.id ? " is-active" : ""}`; const copy = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = item.baseline.name; const small = document.createElement("small"); small.textContent = `${item.baseline.entries.toLocaleString()} entries · ${item.baseline.scope} · ${baselineProjectName(item.projectId)} · ${new Date(item.savedAt).toLocaleString()}${item.tags.length ? ` · ${item.tags.join(" · ")}` : ""}`; copy.append(strong, small); const actions = document.createElement("div"); [["use", "Use"], ["rename", "Rename"], ["remove", "Remove"]].forEach(([action, label]) => { const button = makeUiButton("", label, action === "use" ? "button button--primary button--small" : "button button--ghost button--small"); button.dataset.baselineHistoryAction = action; button.dataset.baselineHistoryId = item.id; actions.appendChild(button); }); row.append(copy, actions); el.baselineHistoryList.appendChild(row); });
  }
  function addBaselineToHistory(baseline, meta = {}) { state.baselineHistory = window.SignalDockBaselineManager.addToHistory(state.baselineHistory, baseline, { projectId: state.activeProjectId || "", ...meta }); if (state.activeProjectId && window.SignalDockProjectManager?.attachBaseline) state.projects = window.SignalDockProjectManager.attachBaseline(state.projects, state.activeProjectId, { id: baseline.id, name: baseline.name, capturedAt: baseline.capturedAt, tags: meta.tags || [] }); }
  function captureBaseline(filtered = false) { if (!state.entries.length) { toast("Load logs before capturing a baseline."); return; } if (filtered && !state.filteredIndexes.length) { toast("The current filters contain no entries to capture."); return; } state.baselineSnapshot = currentBaselineSnapshot(filtered); state.baselineComparison = null; addBaselineToHistory(state.baselineSnapshot); if (el.baselineName) el.baselineName.value = state.baselineSnapshot.name; renderBaseline(); renderProjects(); scheduleDatasetAutosave(); toast(`Captured ${filtered ? "filtered " : ""}baseline · ${state.baselineSnapshot.entries.toLocaleString()} entries.`); }
  async function exportBaseline() { if (!state.baselineSnapshot || !window.SignalDockBaselineManager) { toast("Capture or import a baseline first."); return; } const text = window.SignalDockBaselineManager.exportJson(state.baselineSnapshot); const safe = (state.baselineSnapshot.name || "baseline").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "") || "baseline"; if (window.SignalDockStorageAdapter?.saveText) await window.SignalDockStorageAdapter.saveText({ name: `${safe}.sdbaseline`, mime: "application/json;charset=utf-8", text }); else utils().downloadParts(`${safe}.sdbaseline`, [text], "application/json;charset=utf-8"); toast("Baseline exported without raw logs."); }
  async function importBaseline(event) { const file = event.target.files?.[0]; if (!file || !window.SignalDockBaselineManager) return; try { state.baselineSnapshot = window.SignalDockBaselineManager.parse(await file.text()); addBaselineToHistory(state.baselineSnapshot, { description: `Imported from ${file.name}` }); if (el.baselineName) el.baselineName.value = state.baselineSnapshot.name; renderBaseline(); renderProjects(); scheduleDatasetAutosave(); toast(`Imported baseline “${state.baselineSnapshot.name}”.`); } catch (error) { toast(`Could not import baseline: ${error.message || error}`, "error", 7000); } finally { event.target.value = ""; } }
  async function exportBaselineHistory() { const text = window.SignalDockBaselineManager.exportHistory(state.baselineHistory); const name = `signaldock-baselines-${new Date().toISOString().slice(0,10)}.sdbaselines`; if (window.SignalDockStorageAdapter?.saveText) await window.SignalDockStorageAdapter.saveText({ name, text, mime: "application/json;charset=utf-8" }); else utils().downloadParts(name, [text], "application/json;charset=utf-8"); toast(`Exported ${state.baselineHistory.length} saved baselines.`); }
  async function importBaselineHistory(event) { const file = event.target.files?.[0]; if (!file) return; try { state.baselineHistory = window.SignalDockBaselineManager.importHistory(await file.text(), state.baselineHistory); renderBaselineHistory(); toast(`Baseline history now contains ${state.baselineHistory.length} snapshots.`); } catch (error) { toast(`Could not import baseline history: ${error.message || error}`, "error", 7000); } finally { event.target.value = ""; } }
  function onBaselineHistoryClick(event) { const button = event.target.closest("[data-baseline-history-action]"); if (!button) return; const id = button.dataset.baselineHistoryId; const item = state.baselineHistory.find((candidate) => candidate.id === id); if (!item) return; if (button.dataset.baselineHistoryAction === "use") { state.baselineSnapshot = item.baseline; if (el.baselineName) el.baselineName.value = item.baseline.name; renderBaseline(); return; } if (button.dataset.baselineHistoryAction === "remove") { state.baselineHistory = window.SignalDockBaselineManager.removeFromHistory(state.baselineHistory, id); renderBaselineHistory(); toast("Saved baseline removed from local history."); return; } if (button.dataset.baselineHistoryAction === "rename") { const name = window.prompt("Rename saved baseline:", item.baseline.name); if (!name?.trim()) return; state.baselineHistory = window.SignalDockBaselineManager.renameInHistory(state.baselineHistory, id, name); if (state.baselineSnapshot?.id === item.baseline.id) state.baselineSnapshot = state.baselineHistory.find((candidate) => candidate.id === id)?.baseline || state.baselineSnapshot; renderBaseline(); } }
  function renderBaselineComparisonResult(comparison, currentSnapshot, baselineSnapshot, label = "") { state.baselineComparison = comparison; const regression = window.SignalDockTraceRegression?.compare?.(currentSnapshot, baselineSnapshot) || { rows: [], summary: { regressed: 0 } }; const sum = comparison.summary; el.baselineSummary.textContent = `${label ? `${label} · ` : ""}${currentSnapshot.name}: ${sum.currentEntries.toLocaleString()} vs ${baselineSnapshot.name}: ${sum.baselineEntries.toLocaleString()} entries · ${sum.serviceChanges} service changes · ${sum.dependencyChanges} dependency changes · ${regression.summary.regressed || 0} regressed trace sets`; if (el.baselineChangeCount) el.baselineChangeCount.textContent = String((sum.serviceChanges || 0) + (regression.summary.regressed || 0)); el.baselineServiceBody.replaceChildren(); comparison.services.slice(0, 80).forEach((row) => { const tr = document.createElement("tr"); [row.service, formatDelta(row.entryDelta), formatDelta(row.errorRateDelta, "%"), formatDelta(row.p95Delta, " ms")].forEach((value) => { const td = document.createElement("td"); td.textContent = value; tr.appendChild(td); }); const action = document.createElement("td"); const button = makeUiButton("", "Filter"); button.dataset.baselineService = row.service; action.appendChild(button); tr.appendChild(action); el.baselineServiceBody.appendChild(tr); }); el.baselineDependencyBody.replaceChildren(); comparison.dependencies.slice(0, 80).forEach((row) => { const tr = document.createElement("tr"); [`${row.from} → ${row.to}`, formatDelta(row.callDelta), formatDelta(row.errorRateDelta, "%"), formatDelta(row.p95Delta, " ms")].forEach((value) => { const td = document.createElement("td"); td.textContent = value; tr.appendChild(td); }); const action = document.createElement("td"); const button = makeUiButton("", "Filter target"); button.dataset.baselineDependencyTo = row.to; action.appendChild(button); tr.appendChild(action); el.baselineDependencyBody.appendChild(tr); }); el.baselineTraceBody.replaceChildren(); regression.rows.slice(0, 80).forEach((row) => { const tr = document.createElement("tr"); [row.signature, row.status, formatDelta(row.countDelta), formatDelta(row.p95Delta, " ms"), formatDelta(row.errorRateDelta, "%")].forEach((value) => { const td = document.createElement("td"); td.textContent = value; tr.appendChild(td); }); tr.dataset.status = row.status; el.baselineTraceBody.appendChild(tr); }); }
  function compareSavedBaselines() { syncBaselineHistorySelection(); const { baseId, currentId } = state.baselineHistorySelection; if (!baseId || !currentId || baseId === currentId) return; try { const comparison = window.SignalDockBaselineManager.compareById(state.baselineHistory, currentId, baseId); const current = state.baselineHistory.find((item) => item.id === currentId)?.baseline; const baseline = state.baselineHistory.find((item) => item.id === baseId)?.baseline; renderBaselineComparisonResult(comparison, current, baseline, "Saved baseline comparison"); } catch (error) { toast(error.message || String(error), "error"); } }
  function renderBaseline() { if (!el.baselineSummary) return; renderBaselineHistory(); const baseline = state.baselineSnapshot; if (!baseline) { el.baselineMeta.textContent = "Capture/import a baseline or choose one from local history."; el.baselineSummary.textContent = state.baselineHistory.length ? `${state.baselineHistory.length} saved baseline snapshots available.` : "No baseline loaded."; el.baselineServiceBody.replaceChildren(); el.baselineDependencyBody.replaceChildren(); el.baselineTraceBody.replaceChildren(); if (el.baselineChangeCount) el.baselineChangeCount.textContent = "0"; return; } el.baselineMeta.textContent = `${baseline.name} · ${baseline.entries.toLocaleString()} entries · captured ${baseline.capturedAt ? new Date(baseline.capturedAt).toLocaleString() : "locally"}`; if (!state.entries.length) { el.baselineSummary.textContent = "Baseline ready. Load another dataset to compare it."; return; } const current = currentBaselineSnapshot(false); renderBaselineComparisonResult(window.SignalDockBaselineManager.compare(current, baseline), current, baseline, "Current dataset comparison"); }
  function onBaselineServiceClick(event) { const button = event.target.closest("[data-baseline-service]"); if (!button) return; closeBaseline(); el.queryInput.value = `service:${quoteIfNeeded(button.dataset.baselineService)}`; applyFilters(true); }
  function onBaselineDependencyClick(event) { const button = event.target.closest("[data-baseline-dependency-to]"); if (!button) return; closeBaseline(); el.queryInput.value = `service:${quoteIfNeeded(button.dataset.baselineDependencyTo)}`; applyFilters(true); }

function openProjects() { closeCompetingDialogs("projectDialog"); renderProjects(); showDialogSafely(el.projectDialog); }
function closeProjects() { if (el.projectDialog?.open) el.projectDialog.close(); else el.projectDialog?.removeAttribute("open"); }
function persistActiveProject() { utils().saveJson("signaldock-active-project-v1", state.activeProjectId || ""); }
function createProject() { if (!window.SignalDockProjectManager) return; try { const result = window.SignalDockProjectManager.create(state.projects, { name: el.projectName.value, description: el.projectDescription.value }); state.projects = result.projects; state.activeProjectId = result.project.id; persistActiveProject(); el.projectName.value = ""; el.projectDescription.value = ""; renderProjects(); renderBaselineHistory(); toast(`Created project “${result.project.name}”.`); } catch (error) { toast(error.message || String(error), "error", 6500); } }

function projectHistoryButton(project, field, item, action, label, primary = false) {
  const button = makeUiButton("", label, primary ? "button button--primary button--small" : "button button--ghost button--small");
  button.dataset.projectHistoryAction = action; button.dataset.projectId = project.id; button.dataset.projectField = field; button.dataset.projectItemId = item.id;
  return button;
}

function projectHistorySection(project) {
  const details = document.createElement("details"); details.className = "project-history";
  const summary = document.createElement("summary"); summary.textContent = `${project.recentWorkspaces.length} sessions · ${project.recentDatasets.length} datasets · ${project.baselines.length} baselines · ${project.cases.length} cases`; details.appendChild(summary);
  const grid = document.createElement("div"); grid.className = "project-history__grid";
  const linkedSections = [["Recent workspaces", "recentWorkspaces", project.recentWorkspaces, (item) => `${item.name} · ${new Date(item.openedAt).toLocaleString()}`], ["Recent datasets", "recentDatasets", project.recentDatasets, (item) => `${item.name} · ${utils().formatBytes(item.size)}`]];
  linkedSections.forEach(([label, field, values, format]) => {
    const section = document.createElement("section"); const strong = document.createElement("strong"); strong.textContent = label; section.appendChild(strong);
    if (!values.length) { const small = document.createElement("small"); small.textContent = "No history yet"; section.appendChild(small); }
    else values.slice(0, 5).forEach((item) => {
      const row = document.createElement("div"); row.className = "project-history-item";
      const copy = document.createElement("div"); const small = document.createElement("small"); small.textContent = format(item); const badge = document.createElement("span"); badge.className = `project-link-state${item.handleRef ? " is-linked" : ""}`; badge.textContent = item.handleRef ? `Linked${item.reopenCount ? ` · reopened ${item.reopenCount}×` : ""}` : "Metadata only"; copy.append(small, badge);
      const actions = document.createElement("div");
      if (item.handleRef) actions.append(projectHistoryButton(project, field, item, "reopen", "Reopen", true), projectHistoryButton(project, field, item, "forget", "Forget link"));
      else actions.append(projectHistoryButton(project, field, item, "relink", "Relink"));
      row.append(copy, actions); section.appendChild(row);
    });
    grid.appendChild(section);
  });
  [["Baselines", project.baselines, (item) => `${item.name} · ${new Date(item.capturedAt).toLocaleString()}`], ["Cases", project.cases, (item) => `${item.title} · ${item.status}`]].forEach(([label, values, format]) => { const section = document.createElement("section"); const strong = document.createElement("strong"); strong.textContent = label; section.appendChild(strong); if (!values.length) { const small = document.createElement("small"); small.textContent = "No history yet"; section.appendChild(small); } else values.slice(0, 5).forEach((item) => { const small = document.createElement("small"); small.textContent = format(item); section.appendChild(small); }); grid.appendChild(section); });
  details.appendChild(grid); return details;
}

function renderProjects() {
  if (!el.projectList) return;
  state.projects = window.SignalDockProjectManager?.load?.() || state.projects || [];
  if (state.activeProjectId && !state.projects.some((project) => project.id === state.activeProjectId)) state.activeProjectId = "";
  if (el.projectCount) el.projectCount.textContent = String(state.projects.filter((project) => !project.archived).length);
  const active = state.projects.find((project) => project.id === state.activeProjectId);
  const bridgeCaps = window.SignalDockDesktopBridge?.capabilities?.() || { mode: "browser", filePicker: false, persistentHandles: false };
  if (el.projectLinkFilesButton) { el.projectLinkFilesButton.disabled = !active || active.archived || !bridgeCaps.filePicker; el.projectLinkFilesButton.title = !active ? "Activate a project first" : !bridgeCaps.filePicker ? "Persistent file linking is unavailable in this runtime" : "Choose local log files, load them and remember reopen access for this project"; }
  if (el.projectCapabilityMeta) el.projectCapabilityMeta.textContent = bridgeCaps.persistentHandles ? `${bridgeCaps.mode === "native" ? "Native" : "Browser"} capability mode · persistent local reopen available · links never leave this device` : `${bridgeCaps.mode === "native" ? "Native" : "Browser"} capability mode · metadata-only history in this runtime`;
  el.activeProjectMeta.textContent = active ? `Active · ${active.name} · ${active.recentDatasets.length} recent datasets · ${active.baselines.length} baselines${active.lastWorkspace ? ` · last session: ${active.lastWorkspace}` : ""}` : "No active project.";
  el.projectList.replaceChildren();
  if (!state.projects.length) { const empty = document.createElement("div"); empty.className = "case-findings__empty"; empty.textContent = "No local projects yet."; el.projectList.appendChild(empty); return; }
  state.projects.forEach((project) => { const row = document.createElement("article"); row.className = `project-row${project.id === state.activeProjectId ? " is-active" : ""}${project.archived ? " is-archived" : ""}`; const copy = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = `${project.name}${project.archived ? " · Archived" : ""}`; const small = document.createElement("small"); small.textContent = [project.description || "Metadata-only local project", project.tags.join(" · ")].filter(Boolean).join(" · "); copy.append(strong, small, projectHistorySection(project)); const actions = document.createElement("div"); [["activate", project.id === state.activeProjectId ? "Active" : "Activate"], ["duplicate", "Duplicate"], ["archive", project.archived ? "Unarchive" : "Archive"], ["delete", "Delete"]].forEach(([action, label]) => { const button = makeUiButton("", label); button.dataset.projectAction = action; button.dataset.projectId = project.id; button.disabled = action === "activate" && (project.id === state.activeProjectId || project.archived); actions.appendChild(button); }); row.append(copy, actions); el.projectList.appendChild(row); });
}

async function linkAndLoadProjectFiles() {
  const bridge = window.SignalDockDesktopBridge; const project = state.projects.find((item) => item.id === state.activeProjectId);
  if (!project || project.archived) { toast("Activate a non-archived project before linking local files.", "error"); return; }
  if (!bridge?.pickFiles) { toast("Persistent local file linking is unavailable in this runtime.", "error"); return; }
  try {
    const records = await bridge.pickFiles({ multiple: true, maxFiles: 64, persistHandle: true, projectId: project.id, idPrefix: "dataset", note: "SignalDock linked project dataset", types: [{ description: "SignalDock log datasets", accept: { "application/json": [".json", ".jsonl", ".ndjson"], "text/plain": [".log", ".txt"], "application/zip": [".zip"] } }] });
    if (!records.length) return;
    const projectItems = records.map((record) => ({ file: record.file, historyId: projectDatasetId(record.file), handleRef: record.handleRef, handleKind: "file" }));
    const result = await handleFiles(records.map((record) => record.file), { projectItems });
    const loaded = new Set(result?.loadedIds || []);
    for (const item of projectItems) if (item.handleRef && !loaded.has(item.historyId)) await bridge.forgetHandle(item.handleRef);
    renderProjects();
    if (loaded.size) toast(`Linked ${loaded.size} dataset${loaded.size === 1 ? "" : "s"} to “${project.name}”.`);
  } catch (error) { toast(`Could not link local files: ${error.message || error}`, "error", 7000); }
}

async function relinkProjectHistoryItem(project, field, item) {
  const bridge = window.SignalDockDesktopBridge;
  if (!bridge?.pickFiles) { toast("Persistent local file linking is unavailable in this runtime.", "error"); return; }
  const records = await bridge.pickFiles({ multiple: false, maxFiles: 1, persistHandle: true, projectId: project.id, idPrefix: `relink-${item.id}`, note: `SignalDock relink: ${item.name}` });
  if (!records.length) return;
  const record = records[0];
  const mismatch = record.file.name !== item.name || (item.size && Number(record.file.size) !== Number(item.size));
  if (mismatch && !window.confirm(`The selected file does not match the saved name/size for “${item.name}”. Link it anyway?`)) { if (record.handleRef) await bridge.forgetHandle(record.handleRef); return; }
  state.projects = window.SignalDockProjectManager.linkHistoryHandle(state.projects, project.id, field, item.id, record.handleRef, "file");
  renderProjects(); toast(`Relinked “${item.name}”.`);
}

async function reopenProjectHistoryItem(project, field, item) {
  const bridge = window.SignalDockDesktopBridge;
  if (!item.handleRef || !bridge?.reopenFile) { toast("This history entry has no local reopen link.", "error"); return; }
  try {
    const record = await bridge.reopenFile(item.handleRef, { requestPermission: true });
    if (field === "recentWorkspaces") {
      await restoreWorkspace(record.file);
      state.activeProjectId = project.id; persistActiveProject();
      state.projects = window.SignalDockProjectManager.markHistoryReopened(state.projects, project.id, field, item.id);
    } else {
      const result = await handleFiles([record.file], { projectItems: [{ file: record.file, historyId: item.id, handleRef: item.handleRef, handleKind: "file" }] });
      if (!(result?.loadedIds || []).includes(item.id)) return;
      state.projects = window.SignalDockProjectManager.markHistoryReopened(state.projects, project.id, field, item.id);
    }
    renderProjects(); renderBaselineHistory(); toast(`Reopened “${item.name}” locally.`);
  } catch (error) { toast(`Could not reopen “${item.name}”: ${error.message || error}`, "error", 7500); }
}

async function onProjectHistoryAction(button) {
  const project = state.projects.find((item) => item.id === button.dataset.projectId); const field = button.dataset.projectField; const item = project?.[field]?.find((entry) => entry.id === button.dataset.projectItemId);
  if (!project || !item || !["recentWorkspaces", "recentDatasets"].includes(field)) return;
  const action = button.dataset.projectHistoryAction;
  if (action === "reopen") { await reopenProjectHistoryItem(project, field, item); return; }
  if (action === "relink") { try { await relinkProjectHistoryItem(project, field, item); } catch (error) { toast(`Could not relink “${item.name}”: ${error.message || error}`, "error", 7000); } return; }
  if (action === "forget") { try { if (item.handleRef) await window.SignalDockDesktopBridge?.forgetHandle?.(item.handleRef); state.projects = window.SignalDockProjectManager.unlinkHistoryHandle(state.projects, project.id, field, item.id); renderProjects(); toast(`Forgot the local reopen link for “${item.name}”.`); } catch (error) { toast(`Could not forget local link: ${error.message || error}`, "error"); } }
}

async function onProjectListClick(event) {
  const historyButton = event.target.closest("[data-project-history-action]"); if (historyButton) { await onProjectHistoryAction(historyButton); return; }
  const button = event.target.closest("[data-project-action]"); if (!button || !window.SignalDockProjectManager) return; const id = button.dataset.projectId; const project = state.projects.find((item) => item.id === id); if (!project) return;
  if (button.dataset.projectAction === "activate") { state.activeProjectId = id; persistActiveProject(); renderProjects(); renderBaselineHistory(); toast(`Active project: ${project.name}.`); return; }
  if (button.dataset.projectAction === "duplicate") { const result = window.SignalDockProjectManager.duplicate(state.projects, id); state.projects = result.projects; state.activeProjectId = result.project.id; persistActiveProject(); renderProjects(); toast(`Duplicated project as “${result.project.name}” without copying local file capabilities.`); return; }
  if (button.dataset.projectAction === "archive") { state.projects = window.SignalDockProjectManager.archive(state.projects, id, !project.archived); if (!project.archived && state.activeProjectId === id) { state.activeProjectId = ""; persistActiveProject(); } renderProjects(); return; }
  if (button.dataset.projectAction === "delete" && window.confirm(`Delete local project metadata “${project.name}”? Log files are not affected; saved reopen permissions for this project will also be forgotten.`)) { try { await window.SignalDockDesktopBridge?.forgetProjectHandles?.(id); } catch { /* metadata removal must remain possible */ } state.projects = window.SignalDockProjectManager.remove(state.projects, id); if (state.activeProjectId === id) { state.activeProjectId = ""; persistActiveProject(); } renderProjects(); renderBaselineHistory(); }
}
  async function exportProjects() { if (!window.SignalDockProjectManager) return; const text = window.SignalDockProjectManager.exportJson(state.projects, state.activeProjectId); if (window.SignalDockStorageAdapter?.saveText) await window.SignalDockStorageAdapter.saveText({ name: "signaldock-projects.sdprojects", mime: "application/json;charset=utf-8", text }); else utils().downloadParts("signaldock-projects.sdprojects", [text], "application/json;charset=utf-8"); toast("Project metadata exported."); }
  async function importProjects(event) { const file = event.target.files?.[0]; if (!file || !window.SignalDockProjectManager) return; try { const result = window.SignalDockProjectManager.importJson(await file.text()); state.projects = result.projects; state.activeProjectId = result.activeId && result.projects.some((project) => project.id === result.activeId) ? result.activeId : ""; persistActiveProject(); renderProjects(); renderBaselineHistory(); toast(`Imported ${state.projects.length} project records.`); } catch (error) { toast(`Could not import projects: ${error.message || error}`, "error", 7000); } finally { event.target.value = ""; } }

  function createCaseCheckpoint() { if (!window.SignalDockCaseCheckpoints) return; const checkpoint = window.SignalDockCaseCheckpoints.create(state.caseFile, state.investigation, { label: el.caseCheckpointLabel?.value?.trim() || "" }); state.caseCheckpoints = window.SignalDockCaseCheckpoints.add(state.caseCheckpoints, checkpoint); if (el.caseCheckpointLabel) el.caseCheckpointLabel.value = ""; renderCaseCheckpoints(); scheduleDatasetAutosave(); toast("Case checkpoint created."); }
  function checkpointChangeRow(label, value) { const row = document.createElement("span"); const strong = document.createElement("strong"); strong.textContent = label; row.append(strong, document.createTextNode(` ${value}`)); return row; }
  function renderCaseCheckpoints() { if (!el.caseCheckpoints || !window.SignalDockCaseCheckpoints) return; state.caseCheckpoints = window.SignalDockCaseCheckpoints.normalizeList(state.caseCheckpoints); el.caseCheckpoints.replaceChildren(); if (!state.caseCheckpoints.length) { const empty = document.createElement("div"); empty.className = "case-findings__empty"; empty.textContent = "No case checkpoints yet."; el.caseCheckpoints.appendChild(empty); return; } [...state.caseCheckpoints].reverse().forEach((checkpoint) => { const diff = window.SignalDockCaseCheckpoints.diff(checkpoint, state.caseFile, state.investigation); const row = document.createElement("article"); row.className = "checkpoint-row"; const copy = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = checkpoint.label; const small = document.createElement("small"); small.textContent = `${new Date(checkpoint.createdAt).toLocaleString()} · ${diff.summary.changedSections} changed sections · evidence +${diff.evidenceAdded.length}/-${diff.evidenceRemoved.length}`; copy.append(strong, small); const details = document.createElement("details"); details.className = "checkpoint-diff"; const summary = document.createElement("summary"); summary.textContent = diff.summary.changedSections ? "Review changes since checkpoint" : "No structural changes since checkpoint"; details.appendChild(summary); const changes = document.createElement("div"); changes.className = "checkpoint-diff__grid"; Object.entries(diff.fields).forEach(([field, values]) => changes.appendChild(checkpointChangeRow(field, `${values.before || "—"} → ${values.after || "—"}`))); if (diff.summary.findingChanges) changes.appendChild(checkpointChangeRow("Findings", `+${diff.findings.added.length} / -${diff.findings.removed.length}`)); if (diff.summary.milestoneChanges) changes.appendChild(checkpointChangeRow("Milestones", `+${diff.milestones.added.length} / -${diff.milestones.removed.length}`)); if (diff.summary.attachmentChanges) changes.appendChild(checkpointChangeRow("Attachments", `+${diff.attachments.added.length} / -${diff.attachments.removed.length}`)); if (diff.summary.evidenceChanges) changes.appendChild(checkpointChangeRow("Evidence", `+${diff.evidenceAdded.length} / -${diff.evidenceRemoved.length}`)); if (!changes.childElementCount) changes.appendChild(checkpointChangeRow("State", "No changed fields or collection membership")); details.appendChild(changes); copy.appendChild(details); const actions = document.createElement("div"); [["restore", "Restore case"], ["remove", "Remove"]].forEach(([action, label]) => { const button = makeUiButton("", label); button.dataset.checkpointAction = action; button.dataset.checkpointId = checkpoint.id; actions.appendChild(button); }); row.append(copy, actions); el.caseCheckpoints.appendChild(row); }); }
  function onCaseCheckpointClick(event) { const button = event.target.closest("[data-checkpoint-action]"); if (!button || !window.SignalDockCaseCheckpoints) return; const checkpoint = state.caseCheckpoints.find((item) => item.id === button.dataset.checkpointId); if (!checkpoint) return; if (button.dataset.checkpointAction === "remove") { state.caseCheckpoints = window.SignalDockCaseCheckpoints.remove(state.caseCheckpoints, checkpoint.id); renderCaseCheckpoints(); scheduleDatasetAutosave(); return; } if (button.dataset.checkpointAction === "restore") { state.caseFile = window.SignalDockCaseWorkspace?.normalize?.(checkpoint.caseFile) || checkpoint.caseFile; state.caseFile = window.SignalDockCaseWorkspace?.appendActivity?.(state.caseFile, "case.checkpoint.restored", { label: "Case checkpoint restored", detail: checkpoint.label }) || state.caseFile; if (el.caseStatus) el.caseStatus.value = state.caseFile.status || "open"; if (el.caseSeverity) el.caseSeverity.value = state.caseFile.severity || "none"; if (el.caseHypothesis) el.caseHypothesis.value = state.caseFile.hypothesis || ""; if (el.caseImpact) el.caseImpact.value = state.caseFile.impact || ""; if (el.caseNextSteps) el.caseNextSteps.value = state.caseFile.nextSteps || ""; renderCaseWorkspace(); renderCaseCheckpoints(); scheduleDatasetAutosave(); toast(`Restored case state from “${checkpoint.label}”.`); } }

  function openHealth() {
    if (!window.SignalDockServiceHealth || !el.healthDialog) return;
    if (!state.entries.length) { toast("Load logs before opening observed health."); return; }
    state.healthScopeFiltered = true;
    renderHealth(true);
    closeCompetingDialogs("healthDialog");
    showDialogSafely(el.healthDialog);
  }

  function closeHealth() {
    if (!el.healthDialog) return;
    if (typeof el.healthDialog.close === "function" && el.healthDialog.open) el.healthDialog.close();
    else el.healthDialog.removeAttribute("open");
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
  }

  function renderHealth(useFiltered = state.healthScopeFiltered) {
    if (!el.healthTableBody || !window.SignalDockServiceHealth) return;
    state.healthScopeFiltered = Boolean(useFiltered);
    const subset = state.healthScopeFiltered && state.filteredIndexes.length && state.filteredIndexes.length < state.entries.length
      ? state.filteredIndexes.map((index) => state.entries[index]).filter(Boolean)
      : state.entries;
    const health = window.SignalDockServiceHealth.analyze(subset);
    if (el.healthSummary) {
      el.healthSummary.replaceChildren();
      [["Critical", health.summary.critical], ["Degraded", health.summary.degraded], ["Watch", health.summary.watch], ["Quiet", health.summary.quiet]].forEach(([label, value]) => {
        const item = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = Number(value).toLocaleString(); const span = document.createElement("span"); span.textContent = label; item.append(strong, span); el.healthSummary.appendChild(item);
      });
    }
    el.healthTableBody.replaceChildren();
    if (!health.rows.length) {
      const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 9; td.className = "investigation-empty"; td.textContent = "No named services were observed in this dataset."; tr.appendChild(td); el.healthTableBody.appendChild(tr); return;
    }
    health.rows.slice(0, 500).forEach((row) => {
      const tr = document.createElement("tr");
      const service = document.createElement("td"); const strong = document.createElement("strong"); strong.textContent = row.service; service.appendChild(strong);
      const status = document.createElement("td"); const badge = document.createElement("span"); badge.className = `health-status health-status--${row.status}`; badge.textContent = row.status; status.appendChild(badge);
      const entries = document.createElement("td"); entries.textContent = row.total.toLocaleString();
      const errorRate = document.createElement("td"); errorRate.textContent = `${(row.errorRate * 100).toFixed(row.errorRate < .01 ? 2 : 1)}%`;
      const warnings = document.createElement("td"); warnings.textContent = `${row.warnings.toLocaleString()} · ${(row.warningRate * 100).toFixed(1)}%`;
      const exceptions = document.createElement("td"); exceptions.textContent = row.exceptionGroups.toLocaleString();
      const p95 = document.createElement("td"); p95.textContent = row.p95DurationMs === null ? "—" : formatDuration(row.p95DurationMs);
      const delta = document.createElement("td"); const diff = row.recentErrors - row.previousErrors; delta.textContent = diff > 0 ? `+${diff}` : String(diff); delta.title = `${row.recentErrors} recent errors vs ${row.previousErrors} previous-window errors`;
      const action = document.createElement("td"); const button = document.createElement("button"); button.type = "button"; button.className = "button button--ghost button--small"; button.dataset.healthService = row.service; button.textContent = "Filter"; action.appendChild(button);
      tr.append(service, status, entries, errorRate, warnings, exceptions, p95, delta, action); el.healthTableBody.appendChild(tr);
    });
  }

  function onHealthClick(event) {
    const button = event.target.closest("[data-health-service]");
    if (!button) return;
    const service = button.dataset.healthService || "";
    if (!service) return;
    closeHealth();
    filterByServiceValue(service);
  }

  function openExceptions() {
    if (!window.SignalDockExceptionGroups || !el.exceptionDialog) return;
    const queryMatch = String(el.queryInput?.value || "").match(/(?:^|\s)(?:exception|fingerprint):([^\s]+)/i);
    state.exceptionViewFingerprint = queryMatch?.[1]?.toLowerCase() || "";
    renderExceptions();
    closeCompetingDialogs("exceptionDialog");
    showDialogSafely(el.exceptionDialog);
  }

  function closeExceptions() {
    if (!el.exceptionDialog) return;
    if (typeof el.exceptionDialog.close === "function" && el.exceptionDialog.open) el.exceptionDialog.close();
    else el.exceptionDialog.removeAttribute("open");
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
  }

  function renderExceptions() {
    if (!el.exceptionList || !window.SignalDockExceptionGroups) return;
    const groups = Array.isArray(state.exceptionGroups) ? state.exceptionGroups : [];
    const visible = state.exceptionViewFingerprint ? groups.filter((group) => group.fingerprint === state.exceptionViewFingerprint) : groups;
    const summary = window.SignalDockExceptionGroups.summary(groups);
    if (el.exceptionSummary) {
      el.exceptionSummary.replaceChildren();
      [["Groups", summary.groups], ["Occurrences", summary.occurrences], ["Errors", summary.errors], ["Fatal", summary.fatal]].forEach(([label, value]) => {
        const item = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = Number(value).toLocaleString(); const span = document.createElement("span"); span.textContent = label; item.append(strong, span); el.exceptionSummary.appendChild(item);
      });
    }
    renderExceptionTrend();
    el.exceptionList.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("div"); empty.className = "investigation-empty"; empty.textContent = groups.length ? "No exception group matches this view." : "No recurring exceptions detected in the loaded logs."; el.exceptionList.appendChild(empty); return;
    }
    visible.slice(0, 500).forEach((group) => {
      const card = document.createElement("article"); card.className = "exception-item"; card.dataset.exceptionFingerprint = group.fingerprint;
      const head = document.createElement("div"); head.className = "exception-item__head";
      const identity = document.createElement("div"); const title = document.createElement("strong"); title.textContent = group.type || "Exception-like failure"; const code = document.createElement("code"); code.textContent = group.fingerprint; identity.append(title, code);
      const count = document.createElement("em"); count.textContent = `${group.count.toLocaleString()} occurrence${group.count === 1 ? "" : "s"}`;
      const trend = state.exceptionTrends?.groups?.get?.(group.fingerprint);
      if (trend) { const badge = document.createElement("span"); badge.className = `exception-trend-badge exception-trend-badge--${trend.trend}`; badge.textContent = trend.trend; badge.title = `${trend.recent} recent vs ${trend.previous} previous window`; identity.appendChild(badge); }
      head.append(identity, count);
      const signature = document.createElement("p"); signature.className = "exception-item__signature"; signature.textContent = group.signature || "Normalized exception signature";
      const meta = document.createElement("div"); meta.className = "exception-item__meta";
      const topService = group.services?.[0]?.[0] || "—"; const topSource = group.sources?.[0]?.[0] || "—";
      const range = group.firstTimestampMs !== null && group.lastTimestampMs !== null ? `${new Date(group.firstTimestampMs).toLocaleString()} → ${new Date(group.lastTimestampMs).toLocaleString()}` : "No timestamp range";
      [["Service", topService], ["Source", utils().shortSource(topSource)], ["Severity", `${group.fatal ? `${group.fatal} fatal · ` : ""}${group.errors} errors`], ["Observed", range]].forEach(([label, value]) => { const row = document.createElement("span"); row.textContent = `${label}: ${value}`; meta.appendChild(row); });
      if (trend) { const row = document.createElement("span"); row.textContent = `Trend: ${trend.recent} recent · ${trend.previous} previous`; meta.appendChild(row); }
      const actions = document.createElement("div"); actions.className = "exception-item__actions";
      [["filter", "Filter logs"], ["open", "Open sample"], ["pin", "Pin sample"]].forEach(([action, label]) => { const button = document.createElement("button"); button.type = "button"; button.className = "button button--ghost button--small"; button.dataset.exceptionAction = action; button.dataset.exceptionFingerprint = group.fingerprint; button.textContent = label; actions.appendChild(button); });
      card.append(head, signature, meta, actions); el.exceptionList.appendChild(card);
    });
    if (groups.length > 500 && !state.exceptionViewFingerprint) { const note = document.createElement("p"); note.className = "exception-list-note"; note.textContent = `Showing 500 of ${groups.length.toLocaleString()} groups. Filter a fingerprint from the query bar for focused analysis.`; el.exceptionList.appendChild(note); }
  }

  function renderExceptionTrend() {
    if (!el.exceptionTrend) return;
    const trend = state.exceptionTrends;
    el.exceptionTrend.replaceChildren();
    if (!trend?.groups?.size) {
      const empty = document.createElement("div"); empty.className = "exception-trend__empty"; empty.textContent = "Timestamped recurring failures will show trend analysis here."; el.exceptionTrend.appendChild(empty); return;
    }
    const wrap = document.createElement("div"); wrap.className = "exception-trend__summary";
    [["Spiking", trend.summary.spiking], ["Rising", trend.summary.rising], ["Stable", trend.summary.stable], ["Falling", trend.summary.falling]].forEach(([label, value]) => { const chip = document.createElement("span"); chip.className = "exception-trend__chip"; const strong = document.createElement("strong"); strong.textContent = Number(value).toLocaleString(); chip.append(strong, document.createTextNode(` ${label}`)); wrap.appendChild(chip); });
    const windowChip = document.createElement("span"); windowChip.className = "exception-trend__chip"; windowChip.textContent = `Comparison window: ${formatDuration(trend.windowMs)}`; wrap.appendChild(windowChip);
    el.exceptionTrend.appendChild(wrap);
  }

  function onExceptionClick(event) {
    const button = event.target.closest("[data-exception-action]");
    if (!button) return;
    const fingerprint = button.dataset.exceptionFingerprint || "";
    const group = state.exceptionGroups.find((item) => item.fingerprint === fingerprint);
    if (!group) return;
    if (button.dataset.exceptionAction === "filter") {
      const clean = el.queryInput.value.replace(/(?:^|\s)(?:exception|fingerprint):[^\s]+/gi, " ").trim();
      el.queryInput.value = `${clean}${clean ? " " : ""}exception:${fingerprint}`;
      closeExceptions(); applyFilters(true); toast(`Filtered to exception ${fingerprint}.`); return;
    }
    const sampleIndex = group.sampleIndexes?.find((index) => Number.isInteger(index) && state.entries[index]);
    const entry = Number.isInteger(sampleIndex) ? state.entries[sampleIndex] : null;
    if (!entry) { toast("No sample entry from this exception group is available.", "error"); return; }
    if (button.dataset.exceptionAction === "pin") {
      const result = window.SignalDockInvestigation?.add?.(state.investigation, entry, `Representative sample from ${fingerprint}`, ["exception", fingerprint]);
      if (result) { state.investigation = result.notebook; if (result.added) { const pinned = state.investigation.items.find((item) => item.entryId === entry.id); recordCaseActivity("evidence.pinned", "Exception evidence pinned", `${fingerprint} · ${(entry.message || "").slice(0, 160)}`, { evidenceId: pinned?.id || "" }); } updateStats(); scheduleViewAutosave(); if (state.settings.autosave !== false) scheduleDatasetAutosave(); toast(result.added ? "Exception sample added to investigation." : "This sample is already pinned."); }
      return;
    }
    closeExceptions(); selectEntry(entry.id); entryRowIntoView(entry.globalIndex);
  }

  function openInvestigation() {
    if (!window.SignalDockInvestigation || !el.investigationDialog) return;
    state.investigation = window.SignalDockInvestigation.normalize(state.investigation);
    state.caseFile = window.SignalDockCaseWorkspace?.normalize?.(state.caseFile) || state.caseFile;
    el.investigationTitle.value = state.investigation.title || "Investigation";
    el.investigationSummary.value = state.investigation.summary || "";
    if (el.caseStatus) el.caseStatus.value = state.caseFile?.status || "open";
    if (el.caseSeverity) el.caseSeverity.value = state.caseFile?.severity || "none";
    if (el.caseHypothesis) el.caseHypothesis.value = state.caseFile?.hypothesis || "";
    if (el.caseImpact) el.caseImpact.value = state.caseFile?.impact || "";
    if (el.caseNextSteps) el.caseNextSteps.value = state.caseFile?.nextSteps || "";
    renderInvestigation();
    closeCompetingDialogs("investigationDialog");
    showDialogSafely(el.investigationDialog);
  }

  function closeInvestigation() {
    if (!el.investigationDialog) return;
    if (typeof el.investigationDialog.close === "function" && el.investigationDialog.open) el.investigationDialog.close();
    else el.investigationDialog.removeAttribute("open");
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
  }

  function persistInvestigationMeta() {
    if (!window.SignalDockInvestigation || !state.investigation) return;
    state.investigation = window.SignalDockInvestigation.normalize(Object.assign({}, state.investigation, {
      title: el.investigationTitle?.value || "Investigation",
      summary: el.investigationSummary?.value || "",
      updatedAt: new Date().toISOString()
    }));
    if (window.SignalDockCaseWorkspace) state.caseFile = window.SignalDockCaseWorkspace.updateMeta(state.caseFile, { title: state.investigation.title, summary: state.investigation.summary });
    updateStats();
    scheduleViewAutosave();
    if (state.settings.autosave !== false) scheduleDatasetAutosave();
  }

  function addSelectedEvidence() {
    const entry = selectedEntry();
    if (!entry || !window.SignalDockInvestigation) return;
    const result = window.SignalDockInvestigation.add(state.investigation, entry);
    state.investigation = result.notebook;
    if (result.added) { const pinned = state.investigation.items.find((item) => item.entryId === entry.id); recordCaseActivity("evidence.pinned", "Evidence pinned", `${entry.level} · ${entry.service || "—"} · ${(entry.message || "").slice(0, 160)}`, { evidenceId: pinned?.id || "" }); }
    updateStats();
    renderInspector();
    if (el.investigationDialog?.open) renderInvestigation();
    scheduleViewAutosave();
    if (state.settings.autosave !== false) scheduleDatasetAutosave();
    toast(result.added ? "Added log entry to investigation." : "This log entry is already pinned as evidence.");
  }

  function renderInvestigation() {
    if (!el.investigationList || !window.SignalDockInvestigation) return;
    state.investigation = window.SignalDockInvestigation.normalize(state.investigation);
    const summary = window.SignalDockInvestigation.summarize(state.investigation);
    el.investigationStats.textContent = `${summary.items.toLocaleString()} evidence item${summary.items === 1 ? "" : "s"} · ${summary.services.toLocaleString()} services · ${summary.tags.toLocaleString()} tags${summary.exceptionGroups ? ` · ${summary.exceptionGroups} exception groups` : ""}`;
    renderCaseWorkspace();
    renderInvestigationTimeline();
    el.investigationList.replaceChildren();
    if (!state.investigation.items.length) {
      const empty = document.createElement("div"); empty.className = "investigation-empty"; empty.textContent = "No evidence pinned yet. Select a log entry and choose Add evidence."; el.investigationList.appendChild(empty); return;
    }
    state.investigation.items.forEach((item, index) => {
      const card = document.createElement("article"); card.className = "investigation-item"; card.dataset.investigationId = item.id;
      const head = document.createElement("div"); head.className = "investigation-item__head";
      const identity = document.createElement("div");
      const badge = document.createElement("span"); badge.className = `level-badge level-${String(item.level || "UNKNOWN").toUpperCase()}`; badge.textContent = item.level || "UNKNOWN";
      const title = document.createElement("strong"); title.textContent = `${item.service || "—"} · ${item.source ? utils().shortSource(item.source) : "source"}`;
      const time = document.createElement("small"); time.textContent = item.timestamp ? utils().formatTime(item.timestamp) : `Evidence ${index + 1}`;
      identity.append(badge, title, time);
      const actions = document.createElement("div");
      const open = document.createElement("button"); open.type = "button"; open.className = "button button--ghost button--small"; open.dataset.investigationAction = "open"; open.dataset.investigationId = item.id; open.textContent = "Open";
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button button--ghost button--small"; remove.dataset.investigationAction = "remove"; remove.dataset.investigationId = item.id; remove.textContent = "Remove";
      actions.append(open, remove); head.append(identity, actions);
      const message = document.createElement("p"); message.className = "investigation-item__message"; message.textContent = item.message || "(empty message)";
      const fingerprint = item.fingerprint ? document.createElement("code") : null; if (fingerprint) { fingerprint.className = "investigation-item__fingerprint"; fingerprint.textContent = item.fingerprint; fingerprint.title = "Normalized exception fingerprint"; }
      const fields = document.createElement("div"); fields.className = "investigation-item__fields";
      const noteLabel = document.createElement("label"); const noteSpan = document.createElement("span"); noteSpan.textContent = "Note"; const note = document.createElement("textarea"); note.rows = 2; note.maxLength = 8000; note.value = item.note || ""; note.dataset.investigationNote = item.id; note.placeholder = "Why is this entry important?"; noteLabel.append(noteSpan, note);
      const tagLabel = document.createElement("label"); const tagSpan = document.createElement("span"); tagSpan.textContent = "Tags"; const tags = document.createElement("input"); tags.type = "text"; tags.value = (item.tags || []).join(", "); tags.dataset.investigationTags = item.id; tags.placeholder = "auth, regression, incident-42"; tagLabel.append(tagSpan, tags);
      fields.append(noteLabel, tagLabel); card.append(head, message); if (fingerprint) card.appendChild(fingerprint); card.append(fields); el.investigationList.appendChild(card);
    });
  }

  function recordCaseActivity(type, label, detail = "", options = {}) {
    if (!window.SignalDockCaseWorkspace?.appendActivity) return;
    state.caseFile = window.SignalDockCaseWorkspace.appendActivity(state.caseFile, type, { label, detail, findingId: options.findingId || "", evidenceId: options.evidenceId || "" });
  }

  function renderCaseActivity() {
    if (!el.caseActivityList) return;
    const activity = Array.isArray(state.caseFile?.activity) ? [...state.caseFile.activity].sort((a, b) => String(b.at).localeCompare(String(a.at))) : [];
    if (el.caseActivityMeta) el.caseActivityMeta.textContent = `${activity.length.toLocaleString()} event${activity.length === 1 ? "" : "s"}`;
    el.caseActivityList.replaceChildren();
    if (!activity.length) { const empty = document.createElement("div"); empty.className = "case-findings__empty"; empty.textContent = "Case changes will appear here."; el.caseActivityList.appendChild(empty); return; }
    activity.slice(0, 120).forEach((item) => {
      const row = document.createElement("article"); row.className = "case-activity__item";
      const dot = document.createElement("i"); dot.setAttribute("aria-hidden", "true");
      const copy = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = item.label || item.type || "Case activity"; const small = document.createElement("small"); const when = Date.parse(item.at); small.textContent = Number.isFinite(when) ? new Date(when).toLocaleString() : item.at || ""; copy.append(strong, small); if (item.detail) { const p = document.createElement("p"); p.textContent = item.detail; copy.appendChild(p); } row.append(dot, copy); el.caseActivityList.appendChild(row);
    });
  }

  function renderCaseUnifiedTimeline() {
    if (!el.caseTimelineList || !window.SignalDockCaseTimeline) return;
    const timeline = window.SignalDockCaseTimeline.build(state.caseFile || {}, state.investigation || {}, { limit: 1000 });
    const filter = state.caseTimelineFilter || "all"; if (el.caseTimelineFilter && el.caseTimelineFilter.value !== filter) el.caseTimelineFilter.value = filter;
    const rows = filter === "all" ? timeline.items : timeline.items.filter((item)=>item.type===filter);
    if (el.caseTimelineMeta) el.caseTimelineMeta.textContent = timeline.summary.total ? `${timeline.summary.total} timed events · ${timeline.summary.evidence} evidence · ${timeline.summary.milestones} milestones · ${timeline.summary.activity} activity` : "No timestamped case events.";
    el.caseTimelineList.replaceChildren();
    if (!rows.length) { const empty=document.createElement("div");empty.className="case-findings__empty";empty.textContent="No timeline items match this view.";el.caseTimelineList.appendChild(empty);return; }
    [...rows].reverse().slice(0,300).forEach((item)=>{const row=document.createElement("article");row.className="case-timeline-item";row.dataset.type=item.type;if(item.evidenceId)row.dataset.evidenceId=item.evidenceId;const time=document.createElement("time");time.dateTime=item.at;time.textContent=new Date(item.timestampMs).toLocaleString();const dot=document.createElement("i");dot.setAttribute("aria-hidden","true");const copy=document.createElement("div");copy.className="case-timeline-item__copy";const strong=document.createElement("strong");strong.textContent=`${item.type[0].toUpperCase()+item.type.slice(1)} · ${item.title}`;const small=document.createElement("small");small.textContent=[item.state,item.detail].filter(Boolean).join(" · ");copy.append(strong,small);row.append(time,dot,copy);el.caseTimelineList.appendChild(row);});
  }

  function onCaseTimelineClick(event) { const row=event.target.closest("[data-evidence-id]"); if(!row)return; const item=state.investigation?.items?.find((candidate)=>candidate.id===row.dataset.evidenceId); if(!item)return; const entry=state.entries.find((candidate)=>candidate.id===item.entryId); if(!entry)return; closeInvestigation(); selectEntry(entry.id); entryRowIntoView(entry.globalIndex); }

  function persistCaseMeta() {
    if (!window.SignalDockCaseWorkspace) return;
    const previousStatus = state.caseFile?.status || "open";
    const previousSeverity = state.caseFile?.severity || "none";
    state.caseFile = window.SignalDockCaseWorkspace.updateMeta(state.caseFile, {
      title: el.investigationTitle?.value || state.investigation?.title || "Investigation",
      summary: el.investigationSummary?.value || state.investigation?.summary || "",
      status: el.caseStatus?.value || "open",
      severity: el.caseSeverity?.value || "none",
      hypothesis: el.caseHypothesis?.value || "",
      impact: el.caseImpact?.value || "",
      nextSteps: el.caseNextSteps?.value || ""
    });
    if (state.caseFile.status !== previousStatus) recordCaseActivity("case.status", "Case status changed", `${previousStatus} → ${state.caseFile.status}`);
    if (state.caseFile.severity !== previousSeverity) recordCaseActivity("case.severity", "Case severity changed", `${previousSeverity} → ${state.caseFile.severity}`);
    renderCaseWorkspace(false);
    scheduleViewAutosave();
    if (state.settings.autosave !== false) scheduleDatasetAutosave();
  }

  function renderCaseWorkspace(rebuild = true) {
    if (!window.SignalDockCaseWorkspace || !el.caseFindings) return;
    state.caseFile = window.SignalDockCaseWorkspace.pruneEvidenceLinks(state.caseFile, state.investigation?.items || []);
    const summary = window.SignalDockCaseWorkspace.summarize(state.caseFile, state.investigation?.items || []);
    if (el.caseWorkspaceStats) el.caseWorkspaceStats.textContent = `${summary.findings} findings · ${summary.confirmed} confirmed · ${summary.linkedEvidence} linked evidence`;
    renderCaseActivity();
    renderCaseUnifiedTimeline();
    renderCaseMilestones();
    renderCaseAttachments();
    if (!rebuild) return;
    el.caseFindings.replaceChildren();
    if (!state.caseFile.findings.length) {
      const empty = document.createElement("div"); empty.className = "case-findings__empty"; empty.textContent = "No findings yet. Add a finding when evidence supports or disproves a hypothesis."; el.caseFindings.appendChild(empty); return;
    }
    const evidence = Array.isArray(state.investigation?.items) ? state.investigation.items : [];
    state.caseFile.findings.forEach((finding) => {
      const card = document.createElement("article"); card.className = "case-finding"; card.dataset.caseFindingId = finding.id;
      const top = document.createElement("div"); top.className = "case-finding__top";
      const title = document.createElement("input"); title.type = "text"; title.maxLength = 180; title.value = finding.title || ""; title.dataset.caseField = "title"; title.dataset.caseFindingId = finding.id; title.setAttribute("aria-label", "Finding title");
      const stateSelect = document.createElement("select"); stateSelect.dataset.caseField = "state"; stateSelect.dataset.caseFindingId = finding.id; [["open","Open"],["confirmed","Confirmed"],["dismissed","Dismissed"]].forEach(([value,label]) => { const option = new Option(label,value); stateSelect.add(option); }); stateSelect.value = finding.state;
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button button--ghost button--small"; remove.dataset.caseAction = "remove"; remove.dataset.caseFindingId = finding.id; remove.textContent = "Remove";
      top.append(title, stateSelect, remove);
      const body = document.createElement("textarea"); body.rows = 2; body.maxLength = 12000; body.value = finding.body || ""; body.dataset.caseField = "body"; body.dataset.caseFindingId = finding.id; body.placeholder = "What did the evidence establish?";
      const meta = document.createElement("div"); meta.className = "case-finding__meta";
      const tagLabel = document.createElement("label"); tagLabel.append(document.createTextNode("Tags")); const tags = document.createElement("input"); tags.type = "text"; tags.value = (finding.tags || []).join(", "); tags.dataset.caseField = "tags"; tags.dataset.caseFindingId = finding.id; tags.placeholder = "root-cause, auth, regression"; tagLabel.appendChild(tags);
      const evidenceLabel = document.createElement("label"); evidenceLabel.append(document.createTextNode("Linked evidence")); const select = document.createElement("select"); select.multiple = true; select.dataset.caseField = "evidenceIds"; select.dataset.caseFindingId = finding.id; evidence.forEach((item, index) => { const option = new Option(`${index + 1}. ${item.level} · ${item.service || "—"} · ${(item.message || "").slice(0, 80)}`, item.id); option.selected = finding.evidenceIds.includes(item.id); select.add(option); }); evidenceLabel.appendChild(select);
      meta.append(tagLabel, evidenceLabel); card.append(top, body, meta); el.caseFindings.appendChild(card);
    });
  }

  function addCaseFinding() {
    if (!window.SignalDockCaseWorkspace) return;
    const selected = selectedEntry();
    const pinned = selected ? state.investigation?.items?.find((item) => item.entryId === selected.id) : null;
    const result = window.SignalDockCaseWorkspace.addFinding(state.caseFile, { evidenceIds: pinned ? [pinned.id] : [] });
    state.caseFile = result.caseFile;
    recordCaseActivity("finding.added", "Finding added", result.finding.title || "New finding", { findingId: result.finding.id });
    renderCaseWorkspace();
    scheduleViewAutosave(); if (state.settings.autosave !== false) scheduleDatasetAutosave();
    toast("Case finding added.");
  }

  function onCaseFindingEdit(event) {
    if (!window.SignalDockCaseWorkspace) return;
    const target = event.target;
    const id = target.dataset.caseFindingId; const field = target.dataset.caseField;
    if (!id || !field) return;
    let value = target.value;
    if (field === "evidenceIds") value = [...target.selectedOptions].map((option) => option.value);
    state.caseFile = window.SignalDockCaseWorkspace.updateFinding(state.caseFile, id, { [field]: value });
    if (event.type === "change") recordCaseActivity("finding.updated", "Finding updated", `${field} changed`, { findingId: id });
    renderCaseWorkspace(false);
    scheduleViewAutosave(); if (state.settings.autosave !== false) scheduleDatasetAutosave();
  }

  function onCaseFindingClick(event) {
    const button = event.target.closest("[data-case-action]");
    if (!button || !window.SignalDockCaseWorkspace) return;
    const id = button.dataset.caseFindingId;
    if (button.dataset.caseAction === "remove") {
      const finding = state.caseFile?.findings?.find((item) => item.id === id);
      state.caseFile = window.SignalDockCaseWorkspace.removeFinding(state.caseFile, id);
      recordCaseActivity("finding.removed", "Finding removed", finding?.title || id, { findingId: id });
      renderCaseWorkspace(); scheduleViewAutosave(); if (state.settings.autosave !== false) scheduleDatasetAutosave();
    }
  }

  function renderCaseMilestones() {
    if (!el.caseMilestones || !window.SignalDockCaseWorkspace) return;
    state.caseFile = window.SignalDockCaseWorkspace.normalize(state.caseFile); el.caseMilestones.replaceChildren();
    if (!state.caseFile.milestones.length) { const empty=document.createElement("div"); empty.className="case-findings__empty"; empty.textContent="No milestones yet."; el.caseMilestones.appendChild(empty); return; }
    [...state.caseFile.milestones].sort((a,b)=>String(a.at).localeCompare(String(b.at))).forEach((item)=>{ const row=document.createElement("article"); row.className="case-milestone"; row.dataset.caseMilestoneId=item.id; const input=document.createElement("input"); input.value=item.title; input.dataset.caseMilestoneField="title"; input.maxLength=180; const status=document.createElement("select"); status.dataset.caseMilestoneField="status"; ["planned","reached","blocked"].forEach((value)=>{const opt=document.createElement("option"); opt.value=value; opt.textContent=value[0].toUpperCase()+value.slice(1); opt.selected=item.status===value; status.appendChild(opt);}); const at=document.createElement("input"); at.type="datetime-local"; at.dataset.caseMilestoneField="at"; const ms=Date.parse(item.at); if(Number.isFinite(ms)) at.value=new Date(ms-new Date(ms).getTimezoneOffset()*60000).toISOString().slice(0,16); const note=document.createElement("textarea"); note.rows=2; note.maxLength=4000; note.value=item.note||""; note.dataset.caseMilestoneField="note"; const remove=document.createElement("button"); remove.type="button"; remove.className="button button--ghost button--small"; remove.dataset.caseMilestoneAction="remove"; remove.textContent="Remove"; row.append(input,status,at,note,remove); el.caseMilestones.appendChild(row); });
  }

  function addCaseMilestone() {
    if (!window.SignalDockCaseWorkspace) return; const result=window.SignalDockCaseWorkspace.addMilestone(state.caseFile,{title:`Milestone ${(state.caseFile?.milestones?.length||0)+1}`,status:"planned",at:new Date().toISOString()}); state.caseFile=result.caseFile; recordCaseActivity("milestone.added","Milestone added",result.milestone.title); renderCaseMilestones(); renderCaseWorkspace(false); scheduleViewAutosave(); if(state.settings.autosave!==false) scheduleDatasetAutosave();
  }
  function onCaseMilestoneEdit(event){ const row=event.target.closest("[data-case-milestone-id]"); const field=event.target.dataset.caseMilestoneField; if(!row||!field||!window.SignalDockCaseWorkspace)return; let value=event.target.value; if(field==="at"&&value)value=new Date(value).toISOString(); state.caseFile=window.SignalDockCaseWorkspace.updateMilestone(state.caseFile,row.dataset.caseMilestoneId,{[field]:value}); if(event.type==="change")recordCaseActivity("milestone.updated","Milestone updated",`${field} changed`); scheduleViewAutosave(); if(state.settings.autosave!==false)scheduleDatasetAutosave(); }
  function onCaseMilestoneClick(event){ const button=event.target.closest("[data-case-milestone-action]"); const row=event.target.closest("[data-case-milestone-id]"); if(!button||!row||!window.SignalDockCaseWorkspace)return; const item=state.caseFile.milestones.find((v)=>v.id===row.dataset.caseMilestoneId); state.caseFile=window.SignalDockCaseWorkspace.removeMilestone(state.caseFile,row.dataset.caseMilestoneId); recordCaseActivity("milestone.removed","Milestone removed",item?.title||row.dataset.caseMilestoneId); renderCaseMilestones(); renderCaseWorkspace(false); scheduleViewAutosave(); if(state.settings.autosave!==false)scheduleDatasetAutosave(); }

  function renderCaseAttachments(){ if(!el.caseAttachments||!window.SignalDockCaseWorkspace)return; state.caseFile=window.SignalDockCaseWorkspace.normalize(state.caseFile); el.caseAttachments.replaceChildren(); if(!state.caseFile.attachments.length){const empty=document.createElement("div");empty.className="case-findings__empty";empty.textContent="No local file references yet.";el.caseAttachments.appendChild(empty);return;} state.caseFile.attachments.forEach((item)=>{const row=document.createElement("article");row.className="case-attachment";row.dataset.caseAttachmentId=item.id;const meta=document.createElement("div");const strong=document.createElement("strong");strong.textContent=item.name;const small=document.createElement("small");small.textContent=`${item.type||"unknown"} · ${utils().formatBytes(Number(item.size)||0)} · metadata only`;meta.append(strong,small);const note=document.createElement("input");note.value=item.note||"";note.maxLength=2000;note.placeholder="Why this local file matters";note.dataset.caseAttachmentField="note";const remove=document.createElement("button");remove.type="button";remove.className="button button--ghost button--small";remove.dataset.caseAttachmentAction="remove";remove.textContent="Remove";row.append(meta,note,remove);el.caseAttachments.appendChild(row);}); }
  async function addCaseAttachmentMetadata(event){const files=Array.from(event.target.files||[]);if(!files.length||!window.SignalDockCaseWorkspace)return;let added=0;for(const file of files){const result=window.SignalDockCaseWorkspace.addAttachmentMetadata(state.caseFile,file);state.caseFile=result.caseFile;if(result.added){added+=1;recordCaseActivity("attachment.added","Local file reference added",`${file.name} · ${utils().formatBytes(file.size)}`);}}renderCaseAttachments();renderCaseWorkspace(false);scheduleViewAutosave();if(state.settings.autosave!==false)scheduleDatasetAutosave();toast(`${added} local attachment reference${added===1?"":"s"} added. File contents were not stored.`);event.target.value="";}
  function onCaseAttachmentEdit(event){const row=event.target.closest("[data-case-attachment-id]");if(!row||!event.target.dataset.caseAttachmentField||!window.SignalDockCaseWorkspace)return;state.caseFile=window.SignalDockCaseWorkspace.updateAttachment(state.caseFile,row.dataset.caseAttachmentId,{note:event.target.value});scheduleViewAutosave();if(state.settings.autosave!==false)scheduleDatasetAutosave();}
  function onCaseAttachmentClick(event){const button=event.target.closest("[data-case-attachment-action]");const row=event.target.closest("[data-case-attachment-id]");if(!button||!row||!window.SignalDockCaseWorkspace)return;const item=state.caseFile.attachments.find((v)=>v.id===row.dataset.caseAttachmentId);state.caseFile=window.SignalDockCaseWorkspace.removeAttachment(state.caseFile,row.dataset.caseAttachmentId);recordCaseActivity("attachment.removed","Local file reference removed",item?.name||row.dataset.caseAttachmentId);renderCaseAttachments();renderCaseWorkspace(false);scheduleViewAutosave();if(state.settings.autosave!==false)scheduleDatasetAutosave();}

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
      recordCaseActivity("case.imported", "Case file imported", file.name || "Imported case");
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

  function renderInvestigationTimeline() {
    if (!el.investigationTimeline || !window.SignalDockInvestigation) return;
    const timeline = window.SignalDockInvestigation.timeline(state.investigation, { maxBuckets: 16 });
    el.investigationTimeline.replaceChildren();
    if (!timeline.buckets.length) {
      if (el.investigationTimelineMeta) el.investigationTimelineMeta.textContent = "No timed evidence";
      const empty = document.createElement("span"); empty.className = "investigation-timeline__empty"; empty.textContent = "Pin timestamped log entries to build the local evidence timeline."; el.investigationTimeline.appendChild(empty); return;
    }
    const max = Math.max(...timeline.buckets.map((bucket) => bucket.count), 1);
    if (el.investigationTimelineMeta) el.investigationTimelineMeta.textContent = `${new Date(timeline.start).toLocaleString()} → ${new Date(timeline.end).toLocaleString()}`;
    timeline.buckets.forEach((bucket) => {
      const bar = document.createElement("span"); bar.className = `investigation-timeline__bar${bucket.fatal ? " has-fatal" : bucket.errors ? " has-errors" : ""}`; bar.title = `${bucket.count} evidence item${bucket.count === 1 ? "" : "s"} · ${bucket.errors} errors · ${bucket.fatal} fatal`;
      bar.style.setProperty("--evidence-height", `${Math.max(8, Math.round((bucket.count / max) * 100))}%`); el.investigationTimeline.appendChild(bar);
    });
  }

  function onInvestigationClick(event) {
    const button = event.target.closest("[data-investigation-action]");
    if (!button || !window.SignalDockInvestigation) return;
    const id = button.dataset.investigationId;
    const item = state.investigation?.items?.find((candidate) => candidate.id === id);
    if (!item) return;
    if (button.dataset.investigationAction === "remove") {
      state.investigation = window.SignalDockInvestigation.remove(state.investigation, id);
      if (window.SignalDockCaseWorkspace) state.caseFile = window.SignalDockCaseWorkspace.pruneEvidenceLinks(state.caseFile, state.investigation.items);
      recordCaseActivity("evidence.removed", "Evidence removed", item.message || item.id, { evidenceId: id });
      renderInvestigation(); updateStats(); renderInspector(); scheduleViewAutosave(); if (state.settings.autosave !== false) scheduleDatasetAutosave(); return;
    }
    if (button.dataset.investigationAction === "open") {
      let entry = Number.isInteger(item.globalIndex) ? state.entries[item.globalIndex] : null;
      if (!entry || (item.entryId && entry.id !== item.entryId)) entry = state.entries.find((candidate) => candidate.id === item.entryId || (candidate.source === item.source && candidate.index === item.globalIndex));
      if (!entry) { toast("The referenced evidence log is not present in this workspace.", "error"); return; }
      closeInvestigation(); selectEntry(entry.id); entryRowIntoView(entry.globalIndex);
    }
  }

  function onInvestigationEdit(event) {
    if (!window.SignalDockInvestigation) return;
    const noteId = event.target.dataset.investigationNote;
    const tagId = event.target.dataset.investigationTags;
    const id = noteId || tagId;
    if (!id) return;
    state.investigation = window.SignalDockInvestigation.update(state.investigation, id, noteId ? { note: event.target.value } : { tags: event.target.value });
    renderInvestigation(); updateStats(); scheduleViewAutosave(); if (state.settings.autosave !== false) scheduleDatasetAutosave();
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

  function exportInvestigationBundle() {
    if (!window.SignalDockInvestigation) return;
    const text = window.SignalDockInvestigation.exportBundle(state.investigation, { appVersion: APP_VERSION, sourceLabel: el.loadedMeta?.textContent || "local-workspace", caseFile: window.SignalDockCaseWorkspace?.normalize?.(state.caseFile) || state.caseFile });
    utils().downloadParts(`signaldock-evidence-${new Date().toISOString().slice(0, 10)}.sdbundle`, [text], "application/json;charset=utf-8");
    toast("Self-contained evidence bundle exported.");
  }

  function exportInvestigationJson() {
    if (!window.SignalDockInvestigation) return;
    const text = window.SignalDockInvestigation.exportJson(state.investigation);
    utils().downloadParts(`signaldock-investigation-${new Date().toISOString().slice(0, 10)}.json`, [text], "application/json;charset=utf-8");
    toast("Investigation exported as JSON.");
  }

  function exportInvestigationMarkdown() {
    if (!window.SignalDockInvestigation) return;
    const text = window.SignalDockInvestigation.exportMarkdown(state.investigation);
    utils().downloadParts(`signaldock-investigation-${new Date().toISOString().slice(0, 10)}.md`, [text], "text/markdown;charset=utf-8");
    toast("Investigation exported as Markdown.");
  }

  async function importInvestigationJson(event) {
    const file = event.target.files?.[0];
    if (!file || !window.SignalDockInvestigation) return;
    try {
      const text = await file.text();
      let imported; let importedCase = null;
      try {
        const probe = JSON.parse(text);
        if (probe?.schema === window.SignalDockInvestigation.BUNDLE_SCHEMA) { const bundle = window.SignalDockInvestigation.importBundle(text); imported = bundle.investigation; importedCase = bundle.caseFile || null; }
        else imported = window.SignalDockInvestigation.importJson(text);
      } catch (error) { throw error; }
      const mergeResult = window.SignalDockInvestigation.merge ? window.SignalDockInvestigation.merge(state.investigation, imported) : { notebook: imported, added: imported.items.length, skipped: 0, idMap: {} };
      state.investigation = mergeResult.notebook;
      if (importedCase && window.SignalDockCaseWorkspace) {
        const remappedCase = window.SignalDockCaseWorkspace.normalize(importedCase);
        const idMap = mergeResult.idMap || {};
        remappedCase.findings.forEach((finding) => { finding.evidenceIds = finding.evidenceIds.map((id) => idMap[id] || id); });
        remappedCase.activity.forEach((activity) => { if (activity.evidenceId) activity.evidenceId = idMap[activity.evidenceId] || activity.evidenceId; });
        state.caseFile = window.SignalDockCaseWorkspace.merge ? window.SignalDockCaseWorkspace.merge(state.caseFile, remappedCase) : remappedCase;
      }
      if (window.SignalDockCaseWorkspace) state.caseFile = window.SignalDockCaseWorkspace.pruneEvidenceLinks(state.caseFile, state.investigation.items);
      recordCaseActivity("evidence.imported", "Investigation evidence merged", `${mergeResult.added} added · ${mergeResult.skipped} duplicate${mergeResult.skipped === 1 ? "" : "s"} skipped`);
      if (el.investigationTitle) el.investigationTitle.value = state.investigation.title || "Investigation";
      if (el.investigationSummary) el.investigationSummary.value = state.investigation.summary || "";
      renderInvestigation(); updateStats(); renderInspector(); scheduleViewAutosave(); if (state.settings.autosave !== false) scheduleDatasetAutosave();
      toast(`Merged investigation evidence. ${mergeResult.added.toLocaleString()} added, ${mergeResult.skipped.toLocaleString()} duplicate${mergeResult.skipped === 1 ? "" : "s"} skipped.`);
    } catch (error) { toast(`Could not import investigation: ${error.message || error}`, "error", 6500); }
    finally { event.target.value = ""; }
  }

  function clearInvestigation() {
    if (!state.investigation?.items?.length || !window.SignalDockInvestigation) return;
    if (!window.confirm("Clear all pinned evidence and notes from this investigation?")) return;
    const title = state.investigation.title; const summary = state.investigation.summary;
    state.investigation = window.SignalDockInvestigation.empty(); state.investigation.title = title || "Investigation"; state.investigation.summary = summary || "";
    if (window.SignalDockCaseWorkspace) state.caseFile = window.SignalDockCaseWorkspace.pruneEvidenceLinks(state.caseFile, []);
    recordCaseActivity("evidence.cleared", "Investigation evidence cleared", "All pinned evidence was removed from the local investigation.");
    renderInvestigation(); updateStats(); renderInspector(); scheduleViewAutosave(); if (state.settings.autosave !== false) scheduleDatasetAutosave();
    toast("Investigation evidence cleared.");
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

  function applyMapNodeFilter(node) {
    const kind = node?.dataset?.mapKind || "service";
    const value = node?.dataset?.mapService || "";
    const scopeKind = node?.dataset?.mapScopeKind || "";
    const scopeValue = node?.dataset?.mapScopeValue || "";
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
    renderProjects();
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
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); icon.setAttribute("class", "icon");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", "assets/icons.svg#bookmark"); icon.appendChild(use);
      const name = document.createElement("span"); name.textContent = view.name; name.title = view.name;
      const count = document.createElement("em"); count.textContent = view.level || view.timeRange || "VIEW";
      button.append(icon, name, count);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button icon-button--tiny";
      remove.dataset.deleteView = view.id;
      remove.title = `Delete ${view.name}`;
      const x = document.createElementNS("http://www.w3.org/2000/svg", "svg"); x.setAttribute("class", "icon");
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
      { id: "service-map", title: "Open service map", keywords: "topology trace dependencies", disabled: !state.entries.length, run: openServiceMap },
      { id: "service-matrix", title: "Open service latency matrix", keywords: "latency p95 edge errors dependency calls", disabled: !state.entries.length, run: openServiceMatrix },
      { id: "service-heatmap", title: "Open dependency heatmap", keywords: "time heatmap service dependency edge errors", disabled: !state.entries.length, run: openServiceHeatmap },
      { id: "service-trends", title: "Compare dependency periods", keywords: "trend service edge period delta calls errors p95", disabled: !state.entries.length, run: openServiceTrends },
      { id: "baseline", title: "Open cross-dataset baseline comparison", keywords: "baseline regression compare dataset service dependency", run: openBaseline },
      { id: "projects", title: "Open local project manager", keywords: "projects workspace metadata organize", run: openProjects },
      { id: "trace-explorer", title: "Open distributed trace explorer", keywords: "trace inventory spans coverage duration", disabled: !state.entries.length, run: openTraceExplorer },
      { id: "trace-outliers", title: "Rank trace outliers", keywords: "trace latency robust errors anomalies unusual", disabled: !state.entries.length, run: openTraceOutliers },
      { id: "query-library", title: "Open query library", keywords: "saved reusable searches filters presets", run: openQueryLibrary },
      { id: "health", title: "Open observed health", keywords: "health service errors warnings p95 exceptions", disabled: !state.entries.length, run: openHealth },
      { id: "investigation", title: "Open case & investigation workspace", keywords: "case evidence notes incident findings hypothesis bookmark", run: openInvestigation },
      { id: "case-report", title: "Export case report (Markdown)", keywords: "case report markdown findings health exceptions", run: exportCaseMarkdown },
      { id: "exceptions", title: "Open exception groups", keywords: "errors fingerprint recurring failure crash trends", disabled: !state.entries.length, run: openExceptions },
      { id: "add-evidence", title: "Add selected log to investigation", keywords: "evidence pin bookmark", disabled: !selectedEntry(), run: addSelectedEvidence },
      { id: "save-workspace", title: "Save workspace", keywords: "session sdsession bookmark", hint: "⇧⌘S", disabled: !state.entries.length, run: saveWorkspace },
      { id: "export", title: "Export current results", keywords: "download json ndjson", disabled: !state.filteredIndexes.length, run: exportFiltered },
      { id: "save-view", title: "Save current view", keywords: "filters preset", disabled: !state.entries.length, run: saveCurrentView },
      { id: "reset", title: "Reset filters", keywords: "clear query search", disabled: !state.entries.length, run: resetFilters },
      { id: "windowed", title: state.renderMode === "virtual" ? "Switch to paged table" : "Switch to windowed table", keywords: "virtual large performance viewport", disabled: !state.entries.length || state.settings.wrap || window.innerWidth < 780, run: () => { state.renderMode = state.renderMode === "virtual" ? "paged" : "virtual"; el.renderMode.value = state.renderMode; el.logTable.scrollTop = 0; renderTable(); scheduleViewAutosave(); } },
      { id: "live", title: state.tail.active ? "Stop live tail" : "Start local live tail", keywords: "follow file stream", run: startLiveTail },
      { id: "settings", title: "Open settings", keywords: "preferences parser performance recovery", run: openSettings },
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
    renderCommandPalette();
    showDialogSafely(el.commandPaletteDialog);
    requestAnimationFrame(() => el.commandPaletteInput.focus());
  }

  function closeCommandPalette() {
    if (!el.commandPaletteDialog) return;
    if (typeof el.commandPaletteDialog.close === "function" && el.commandPaletteDialog.open) el.commandPaletteDialog.close();
    else el.commandPaletteDialog.removeAttribute("open");
  }

  function renderCommandPalette() {
    if (!el.commandPaletteList) return;
    const commands = filteredCommands();
    state.commandPaletteIndex = Math.max(0, Math.min(state.commandPaletteIndex, Math.max(0, commands.length - 1)));
    el.commandPaletteList.replaceChildren();
    if (!commands.length) {
      const empty = document.createElement("p"); empty.className = "command-empty"; empty.textContent = "No matching commands."; el.commandPaletteList.appendChild(empty); return;
    }
    commands.forEach((command, index) => {
      const button = document.createElement("button"); button.type = "button"; button.className = `command-item${index === state.commandPaletteIndex ? " is-active" : ""}`; button.dataset.commandId = command.id; button.setAttribute("role", "option"); button.setAttribute("aria-selected", index === state.commandPaletteIndex ? "true" : "false"); button.disabled = Boolean(command.disabled);
      const copy = document.createElement("span"); const strong = document.createElement("strong"); strong.textContent = command.title; const small = document.createElement("small"); small.textContent = command.keywords || "SignalDock action"; copy.append(strong, small); button.appendChild(copy);
      if (command.hint) { const kbd = document.createElement("kbd"); kbd.textContent = command.hint; button.appendChild(kbd); }
      el.commandPaletteList.appendChild(button);
    });
    el.commandPaletteList.querySelector(".is-active")?.scrollIntoView?.({ block: "nearest" });
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


  function openServiceMap() {
    if (!state.entries.length) {
      toast("Load logs with service and trace/span metadata to build a service map.");
      return;
    }
    if (el.serviceMapGroupBy) el.serviceMapGroupBy.value = state.serviceMapGroupBy;
    closeCompetingDialogs("serviceMapDialog");
    renderServiceMap();
    showDialogSafely(el.serviceMapDialog);
  }

  function closeServiceMap() {
    if (!el.serviceMapDialog) return;
    if (typeof el.serviceMapDialog.close === "function" && el.serviceMapDialog.open) el.serviceMapDialog.close();
    else el.serviceMapDialog.removeAttribute("open");
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));
  }

  function renderServiceMap(indexes = state.filteredIndexes) {
    if (!window.SignalDockServiceMap || !el.serviceMapCanvas) return;
    const started = performance.now();
    const graph = window.SignalDockServiceMap.build(state.entries, indexes, { groupBy: state.serviceMapGroupBy });
    const layout = window.SignalDockServiceMap.layout(graph, 920, 500);
    state.serviceGraph = graph;
    el.serviceMapCanvas.replaceChildren();
    el.serviceMapSummary.replaceChildren();
    el.serviceMapList.replaceChildren();

    const summaryItems = [
      [state.serviceMapGroupBy === "service" ? "Services" : "Groups", state.serviceMapGroupBy === "service" ? graph.stats.services : graph.stats.groups],
      ["Explicit edges", graph.stats.edges],
      ["Traces", graph.stats.traces],
      ["Result entries", graph.stats.entries]
    ];
    summaryItems.forEach(([label, value]) => {
      const item = document.createElement("div");
      const strong = document.createElement("strong"); strong.textContent = Number(value).toLocaleString();
      const span = document.createElement("span"); span.textContent = label;
      item.append(strong, span); el.serviceMapSummary.appendChild(item);
    });

    const scopeLabel = indexes === null ? "All loaded logs" : "Current result set";
    el.serviceMapMeta.textContent = graph.stats.edges
      ? `${scopeLabel} · grouped by ${state.serviceMapGroupBy.replace(/-/g, " + ")} · ${graph.stats.visibleServices.toLocaleString()} visible group${graph.stats.visibleServices === 1 ? "" : "s"}${graph.stats.hiddenServices ? ` · ${graph.stats.hiddenServices} hidden by display cap` : ""}`
      : `No explicit cross-group parent-span relationships were found in ${scopeLabel.toLowerCase()} for this grouping.`;

    const svgNs = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(svgNs, "defs");
    const marker = document.createElementNS(svgNs, "marker");
    marker.setAttribute("id", "serviceArrow"); marker.setAttribute("viewBox", "0 0 10 10"); marker.setAttribute("refX", "8"); marker.setAttribute("refY", "5"); marker.setAttribute("markerWidth", "6"); marker.setAttribute("markerHeight", "6"); marker.setAttribute("orient", "auto-start-reverse");
    const arrow = document.createElementNS(svgNs, "path"); arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z"); arrow.setAttribute("class", "service-map-arrow"); marker.appendChild(arrow); defs.appendChild(marker); el.serviceMapCanvas.appendChild(defs);

    layout.edges.forEach((edge) => {
      const line = document.createElementNS(svgNs, "line");
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / distance;
      const uy = dy / distance;
      const x1 = edge.source.x + ux * (edge.source.radius + 4);
      const y1 = edge.source.y + uy * (edge.source.radius + 4);
      const x2 = edge.target.x - ux * (edge.target.radius + 8);
      const y2 = edge.target.y - uy * (edge.target.radius + 8);
      line.setAttribute("x1", x1); line.setAttribute("y1", y1); line.setAttribute("x2", x2); line.setAttribute("y2", y2);
      line.setAttribute("class", `service-map-edge${edge.errors ? " has-errors" : ""}`);
      line.setAttribute("marker-end", "url(#serviceArrow)");
      line.setAttribute("stroke-width", String(Math.min(5, 1.2 + Math.log2(edge.count + 1))));
      const title = document.createElementNS(svgNs, "title"); title.textContent = `${edge.from} → ${edge.to} · ${edge.count} span${edge.count === 1 ? "" : "s"}${edge.errors ? ` · ${edge.errors} errors` : ""}`; line.appendChild(title);
      el.serviceMapCanvas.appendChild(line);
    });

    layout.nodes.forEach((node) => {
      const group = document.createElementNS(svgNs, "g");
      group.setAttribute("class", `service-map-node${node.errors ? " has-errors" : ""}`);
      group.dataset.mapService = node.value || node.id;
      group.dataset.mapKind = node.kind || "service";
      group.dataset.mapScopeKind = node.scopeKind || "";
      group.dataset.mapScopeValue = node.scopeValue || "";
      group.setAttribute("role", "button"); group.setAttribute("tabindex", "0");
      const circle = document.createElementNS(svgNs, "circle"); circle.setAttribute("cx", node.x); circle.setAttribute("cy", node.y); circle.setAttribute("r", node.radius);
      const text = document.createElementNS(svgNs, "text"); text.setAttribute("x", node.x); text.setAttribute("y", node.y + node.radius + 17); text.setAttribute("text-anchor", "middle"); text.textContent = node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label;
      const count = document.createElementNS(svgNs, "text"); count.setAttribute("x", node.x); count.setAttribute("y", node.y + 4); count.setAttribute("text-anchor", "middle"); count.setAttribute("class", "service-map-node-count"); count.textContent = node.entries.toLocaleString();
      const title = document.createElementNS(svgNs, "title"); title.textContent = `${node.label} · ${node.entries} entries · ${node.traces} traces${node.errors ? ` · ${node.errors} errors` : ""}`;
      group.append(circle, count, text, title); el.serviceMapCanvas.appendChild(group);
    });

    graph.nodes.forEach((node) => {
      const button = document.createElement("button"); button.type = "button"; button.className = `service-map-item${node.errors ? " has-errors" : ""}`; button.dataset.mapService = node.value || node.id; button.dataset.mapKind = node.kind || "service"; button.dataset.mapScopeKind = node.scopeKind || ""; button.dataset.mapScopeValue = node.scopeValue || "";
      const name = document.createElement("strong"); name.textContent = node.label; name.title = node.label;
      const meta = document.createElement("span"); meta.textContent = `${node.entries.toLocaleString()} entries · ${node.traces.toLocaleString()} traces${node.errors ? ` · ${node.errors} errors` : ""}${node.durationMs ? ` · ${formatDuration(node.durationMs)}` : ""}`;
      button.append(name, meta); el.serviceMapList.appendChild(button);
    });
    profiler()?.record?.("service-map", performance.now() - started, { services: graph.stats.services, groups: graph.stats.groups, groupBy: state.serviceMapGroupBy, edges: graph.stats.edges, entries: graph.stats.entries });
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
      toast("Local diagnostics copied.");
    } catch { toast("Could not copy diagnostics.", "error"); }
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
