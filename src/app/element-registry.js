(function (root) {
  "use strict";

  const VERSION = 1;
  const ELEMENT_IDS = Object.freeze([
    "importButton", "fileInput", "dragOverlay", "queryInput", "levelFilter", "sourceFilter", "timeFilter", "sortFilter",
    "levelChips", "saveViewButton", "resetButton", "exportButton", "workspaceSaveButton", "clearAllButton", "fileTabs", "sourceList",
    "savedList", "savedCount", "navLogCount", "metricEntries", "metricErrors", "metricWarnings", "metricSources", "chipErrors",
    "chipWarnings", "loadedMeta", "timelineBars", "timelineTitle", "timelineStart", "timelineEnd", "timelineMeta", "logTable",
    "resultsSummary", "prevPage", "nextPage", "pageLabel", "pageSize", "renderMode", "inspector", "inspectorEmpty",
    "inspectorContent", "inspectorLevel", "inspectorTime", "inspectorMessage", "inspectorMeta", "detailsPane", "contextPane", "correlationsPane",
    "tracePane", "rawPane", "jsonPane", "closeInspector", "copyButton", "filterBySourceButton", "filterByServiceButton", "settingsDialog",
    "wrapToggle", "compactToggle", "unknownToggle", "workerToggle", "autosaveToggle", "parserProfile", "customParserFields", "customParserPattern",
    "customParserFlags", "savedParserProfile", "savedParserName", "saveParserProfileButton", "deleteParserProfileButton", "exportParserProfilesButton", "importParserProfilesButton", "parserProfilesFileInput",
    "recoveryBanner", "recoveryMeta", "recoveryRestoreButton", "recoveryDismissButton", "clearRecoveryButton", "clearSearchCacheButton", "autosaveStatus", "serviceMapCount",
    "serviceMapDialog", "serviceMapMeta", "serviceMapSummary", "serviceMapCanvas", "serviceMapList", "closeServiceMapButton", "serviceMapResetButton", "serviceMapGroupBy",
    "serviceMatrixCount", "serviceMatrixDialog", "serviceMatrixMeta", "serviceMatrixSummary", "serviceMatrixBody", "closeServiceMatrixButton", "serviceMatrixResetButton", "serviceHeatmapCount",
    "serviceHeatmapDialog", "serviceHeatmapMeta", "serviceHeatmapSummary", "serviceHeatmapBody", "closeServiceHeatmapButton", "serviceHeatmapResetButton", "serviceTrendsCount", "serviceTrendsDialog",
    "serviceTrendsMeta", "serviceTrendsSummary", "serviceTrendsBody", "serviceTrendsSplit", "serviceTrendsWindow", "closeServiceTrendsButton", "serviceTrendsResetButton", "traceExplorerCount",
    "traceExplorerDialog", "traceExplorerMeta", "traceExplorerSummary", "traceExplorerBody", "closeTraceExplorerButton", "traceExplorerResetButton", "traceCompareButton", "traceCompareDialog",
    "traceCompareBody", "closeTraceCompareButton", "traceOutlierCount", "traceOutlierDialog", "traceOutlierMeta", "traceOutlierSummary", "traceOutlierBody", "closeTraceOutlierButton",
    "traceOutlierResetButton", "queryLibraryDialog", "queryLibraryName", "queryLibraryFolder", "queryLibraryTags", "queryLibraryDescription", "queryLibraryFavorite", "queryLibrarySaveButton",
    "queryLibraryExportButton", "queryLibraryImportButton", "queryLibraryFileInput", "queryLibraryList", "closeQueryLibraryButton", "queryLibrarySearch", "queryLibraryFolderFilter", "queryLibraryManageFolder",
    "queryLibraryRenameFolder", "queryLibraryRenameFolderButton", "queryLibraryDeleteFolderButton", "queryLibraryBulkCount", "queryLibraryBulkFolder", "queryLibraryBulkSelectVisible", "queryLibraryBulkFavorite", "queryLibraryBulkUnfavorite",
    "queryLibraryBulkMove", "queryLibraryBulkExport", "queryLibraryBulkDelete", "queryLibraryBulkClear", "baselineChangeCount", "baselineDialog", "baselineMeta", "baselineName",
    "captureBaselineButton", "captureFilteredBaselineButton", "exportBaselineButton", "importBaselineButton", "baselineFileInput", "baselineSummary", "baselineServiceBody", "baselineDependencyBody",
    "baselineTraceBody", "closeBaselineButton", "baselineHistoryList", "baselineHistoryExportButton", "baselineHistoryImportButton", "baselineHistoryFileInput", "baselineCompareBase", "baselineCompareCurrent",
    "compareSavedBaselinesButton", "projectCount", "projectDialog", "projectName", "projectDescription", "createProjectButton", "projectLinkFilesButton", "projectCapabilityMeta",
    "exportProjectsButton", "importProjectsButton", "projectsFileInput", "activeProjectMeta", "projectList", "closeProjectButton", "caseCheckpointLabel", "addCaseCheckpointButton",
    "caseCheckpoints", "diagnosticsGrid", "copyDiagnosticsButton", "commandPaletteButton", "commandPaletteDialog", "commandPaletteInput", "commandPaletteList", "closeCommandPaletteButton",
    "investigationCount", "investigationDialog", "investigationTitle", "investigationSummary", "investigationStats", "investigationList", "investigationTimeline", "investigationTimelineMeta",
    "closeInvestigationButton", "exportInvestigationBundleButton", "exportInvestigationMarkdownButton", "exportInvestigationJsonButton", "importInvestigationJsonButton", "investigationFileInput", "clearInvestigationButton", "addEvidenceButton",
    "caseWorkspaceStats", "caseTimelineFilter", "caseTimelineMeta", "caseTimelineList", "caseStatus", "caseSeverity", "caseHypothesis", "caseImpact",
    "caseNextSteps", "addCaseFindingButton", "exportCaseMarkdownButton", "exportCaseJsonButton", "importCaseJsonButton", "caseFileInput", "caseFindings", "addCaseMilestoneButton",
    "caseMilestones", "addCaseAttachmentButton", "caseAttachmentInput", "caseAttachments", "caseActivityMeta", "caseActivityList", "exceptionGroupCount", "exceptionDialog",
    "exceptionSummary", "exceptionTrend", "exceptionList", "closeExceptionButton", "exceptionResetButton", "healthIssueCount", "healthDialog", "healthSummary",
    "healthTableBody", "closeHealthButton", "healthResetButton", "processing", "processingTitle", "processingDetail", "toastRegion"
  ]);

  function create(ownerDocument = root.document) {
    if (!ownerDocument?.getElementById) throw new Error("Element registry requires a document context.");
    const registry = {};
    for (const id of ELEMENT_IDS) registry[id] = ownerDocument.getElementById(id);
    return Object.freeze(registry);
  }

  root.SignalDockElementRegistry = Object.freeze({ VERSION, ELEMENT_IDS, create });
}(typeof self !== "undefined" ? self : window));
