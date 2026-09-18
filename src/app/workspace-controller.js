(function (root) {
  "use strict";

  const VERSION = 1;
  const MAX_WORKSPACE_BYTES = 500 * 1024 * 1024;
  const PAGE_SIZES = new Set([50, 100, 250, 500, 1000]);
  const INSPECTOR_TABS = new Set(["details", "context", "correlations", "trace", "raw", "json"]);

  function create(options = {}) {
    const {
      state,
      el,
      appVersion,
      ownerDocument = el?.workspaceSaveButton?.ownerDocument || root.document,
      prepareWorkspaceArchive,
      persistWorkspaceArchive,
      readAndParseWorkspace,
      normalizeWorkspaceSnapshot,
      normalizeWorkspaceDomain,
      persistActiveProjectId,
      isServiceMapGroupMode,
      getSelectedEntry,
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
      nowIso
    } = options;

    if (!state || !el || !ownerDocument) throw new Error("Workspace controller requires state, elements and document.");
    const required = {
      prepareWorkspaceArchive,
      persistWorkspaceArchive,
      readAndParseWorkspace,
      normalizeWorkspaceSnapshot,
      normalizeWorkspaceDomain,
      persistActiveProjectId,
      isServiceMapGroupMode,
      getSelectedEntry,
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
      nowIso
    };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== "function") throw new Error(`Workspace controller requires ${name}().`);
    }

    const listeners = [];
    let bound = false;

    function listen(target, type, handler) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }

    function selectHasValue(select, value) {
      return Array.from(select?.options || []).some((option) => option.value === value);
    }

    function currentViewState() {
      const selected = getSelectedEntry();
      return {
        query: el.queryInput?.value || "",
        level: el.levelFilter?.value || "",
        source: el.sourceFilter?.value || "",
        timeRange: el.timeFilter?.value || "",
        sortMode: el.sortFilter?.value || "original",
        pageSize: state.pageSize,
        renderMode: state.renderMode,
        serviceMapGroupBy: state.serviceMapGroupBy,
        selectedGlobalIndex: selected?.globalIndex ?? null,
        inspectorTab: state.inspectorTab
      };
    }

    function currentWorkspaceState() {
      return normalizeWorkspaceSnapshot({
        loadedBytes: state.loadedBytes,
        inputFileCount: state.inputFileCount,
        view: currentViewState(),
        settings: state.settings,
        investigation: state.investigation,
        caseFile: state.caseFile,
        caseCheckpoints: state.caseCheckpoints,
        baselineSnapshot: state.baselineSnapshot,
        activeProjectId: state.activeProjectId
      });
    }

    async function saveWorkspace() {
      if (!state.entries.length) return { mode: "empty" };

      const workspace = currentWorkspaceState();
      const archive = prepareWorkspaceArchive(state.entries, workspace, appVersion);
      if (!archive || !Array.isArray(archive.parts)) throw new Error("Workspace archive preparation failed.");

      const stamp = String(nowIso()).replace(/[:.]/g, "-").slice(0, 19);
      const filename = `signaldock-${stamp}.sdsession`;
      let saved;

      try {
        saved = await persistWorkspaceArchive({
          filename,
          parts: archive.parts,
          size: Math.max(0, Number(archive.size) || 0),
          workspace
        });
      } catch (error) {
        toast(`Could not save workspace: ${error.message || error}`, "error", 7500);
        return { mode: "error", error };
      }

      if (saved?.mode === "cancelled") {
        toast("Workspace save cancelled.");
        return saved;
      }

      toast(`Workspace saved with ${state.entries.length.toLocaleString()} entries${saved?.reopenLinked ? " · reopen link stored locally" : ""}.`);
      return saved || { mode: "saved" };
    }

    async function restoreWorkspace(file) {
      if (!file) return false;
      if (Number(file.size) > MAX_WORKSPACE_BYTES) {
        toast("Workspace is larger than the 500 MB session safety limit.", "error", 7000);
        return false;
      }

      setProcessing(true, "Opening workspace…", file.name || "workspace");
      try {
        const payload = await readAndParseWorkspace(file);
        await restoreWorkspacePayload(payload, file.name || "workspace");
        markDatasetForAutosave();
        toast(`Workspace restored · ${state.entries.length.toLocaleString()} entries.`);
        return true;
      } catch (error) {
        toast(`Could not open workspace: ${error.message || error}`, "error", 7500);
        return false;
      } finally {
        setProcessing(false);
      }
    }

    async function restoreWorkspacePayload(payload, label = "workspace") {
      const workspace = payload?.workspace || {};

      stopLiveTail();
      state.entries = [];
      state.filterEntries = [];
      state.filteredIndexes = [];
      state.selectedId = null;
      state.correlatedIndexes = [];
      state.traceIndexes = [];

      appendParsedEntries(payload?.entries || []);
      state.loadedBytes = Number(workspace.loadedBytes) || 0;
      state.inputFileCount = Number(workspace.inputFileCount) || 1;
      state.settings = Object.assign(state.settings, workspace.settings || {});

      const domain = normalizeWorkspaceDomain(workspace) || {};
      state.investigation = domain.investigation;
      state.caseFile = domain.caseFile;
      state.caseCheckpoints = Array.isArray(domain.caseCheckpoints) ? domain.caseCheckpoints : [];
      state.baselineSnapshot = domain.baselineSnapshot ?? null;
      state.activeProjectId = String(domain.activeProjectId || "");
      if (state.activeProjectId) persistActiveProjectId(state.activeProjectId);

      applySettings();
      rebuildFilterIndex();
      refreshFilters();
      setControlsEnabled(true);
      syncWorkerIndex();

      const view = workspace.view || {};
      if (el.queryInput) el.queryInput.value = String(view.query || "");
      if (el.levelFilter) el.levelFilter.value = selectHasValue(el.levelFilter, view.level) ? view.level : "";
      if (el.sourceFilter) el.sourceFilter.value = selectHasValue(el.sourceFilter, view.source) ? view.source : "";
      if (el.timeFilter) el.timeFilter.value = selectHasValue(el.timeFilter, view.timeRange) ? view.timeRange : "";
      if (el.sortFilter) el.sortFilter.value = selectHasValue(el.sortFilter, view.sortMode) ? view.sortMode : "original";

      state.pageSize = PAGE_SIZES.has(Number(view.pageSize)) ? Number(view.pageSize) : 100;
      if (el.pageSize) el.pageSize.value = String(state.pageSize);

      state.renderMode = view.renderMode === "virtual" ? "virtual" : "paged";
      if (el.renderMode) el.renderMode.value = state.renderMode;

      state.serviceMapGroupBy = isServiceMapGroupMode(view.serviceMapGroupBy) ? view.serviceMapGroupBy : "service";
      if (el.serviceMapGroupBy) el.serviceMapGroupBy.value = state.serviceMapGroupBy;

      state.inspectorTab = INSPECTOR_TABS.has(view.inspectorTab) ? view.inspectorTab : "details";
      syncLevelChips(el.levelFilter?.value || "");
      applyFilters(true);

      if (Number.isInteger(view.selectedGlobalIndex) && state.entries[view.selectedGlobalIndex]) {
        selectEntry(`sd-${view.selectedGlobalIndex}`);
      }

      if (state.recovery) state.recovery.datasetDirty = false;
      if (label && el.loadedMeta) el.loadedMeta.title = label;
      return true;
    }

    function onKeydown(event) {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "s" || !state.entries.length) return;
      event.preventDefault();
      void saveWorkspace();
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(el.workspaceSaveButton, "click", () => { void saveWorkspace(); });
      listen(ownerDocument, "keydown", onKeydown);
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
      currentViewState,
      currentWorkspaceState,
      saveWorkspace,
      restoreWorkspace,
      restoreWorkspacePayload
    });
  }

  root.SignalDockWorkspaceController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
