(function (root) {
  "use strict";

  const VERSION = 1;
  const DATASET_AUTOSAVE_DELAY_MS = 1400;
  const VIEW_AUTOSAVE_DELAY_MS = 450;

  function create(options = {}) {
    const state = options.state;
    const el = options.el || {};
    const appVersion = String(options.appVersion || "");
    const ownerDocument = options.ownerDocument || el.recoveryBanner?.ownerDocument || el.diagnosticsGrid?.ownerDocument || null;
    const requiredCallbacks = [
      "getWorkspaceState",
      "getViewState",
      "getRecoveryAvailability",
      "getAutosaveEligibility",
      "saveRecoveryDataset",
      "saveRecoveryView",
      "getRecoveryInfo",
      "loadRecovery",
      "clearRecovery",
      "clearSearchCache",
      "restoreWorkspacePayload",
      "setProcessing",
      "toast",
      "getPerformanceSnapshot",
      "copyText",
      "formatBytes",
      "canUseVirtualTable",
      "getCapabilitySnapshot"
    ];

    if (!state || typeof state !== "object") throw new Error("Recovery/diagnostics controller requires application state.");
    if (!appVersion) throw new Error("Recovery/diagnostics controller requires an application version.");
    if (!ownerDocument) throw new Error("Recovery/diagnostics controller requires a document context.");
    for (const name of requiredCallbacks) {
      if (typeof options[name] !== "function") throw new Error(`Recovery/diagnostics controller requires ${name}().`);
    }

    const getWorkspaceState = options.getWorkspaceState;
    const getViewState = options.getViewState;
    const getRecoveryAvailability = options.getRecoveryAvailability;
    const getAutosaveEligibility = options.getAutosaveEligibility;
    const saveRecoveryDataset = options.saveRecoveryDataset;
    const saveRecoveryView = options.saveRecoveryView;
    const getRecoveryInfo = options.getRecoveryInfo;
    const loadRecovery = options.loadRecovery;
    const clearRecovery = options.clearRecovery;
    const clearSearchCache = options.clearSearchCache;
    const restoreWorkspacePayload = options.restoreWorkspacePayload;
    const setProcessing = options.setProcessing;
    const toast = options.toast;
    const getPerformanceSnapshot = options.getPerformanceSnapshot;
    const copyText = options.copyText;
    const formatBytes = options.formatBytes;
    const canUseVirtualTable = options.canUseVirtualTable;
    const getCapabilitySnapshot = options.getCapabilitySnapshot;
    const timerHost = ownerDocument.defaultView || root;
    const setTimer = typeof options.setTimer === "function" ? options.setTimer : (typeof timerHost?.setTimeout === "function" ? timerHost.setTimeout.bind(timerHost) : null);
    const clearTimer = typeof options.clearTimer === "function" ? options.clearTimer : (typeof timerHost?.clearTimeout === "function" ? timerHost.clearTimeout.bind(timerHost) : null);

    if (!setTimer || !clearTimer) throw new Error("Recovery/diagnostics controller requires timer functions.");

    state.recovery = Object.assign({ available: false, saving: false, datasetDirty: false, dismissed: false }, state.recovery || {});
    state.searchIndex = Object.assign({ enabled: false, tokens: 0, postings: 0, truncated: false, elapsedMs: 0, mode: "linear", candidateCount: 0, cacheHit: false, cacheEligible: false, cacheSegments: 0 }, state.searchIndex || {});

    let bound = false;
    let datasetTimer = 0;
    let viewTimer = 0;
    const listeners = [];

    function listen(target, type, handler) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }

    function scheduleDatasetAutosave() {
      if (datasetTimer) clearTimer(datasetTimer);
      datasetTimer = setTimer(() => {
        datasetTimer = 0;
        void autosaveDataset();
      }, DATASET_AUTOSAVE_DELAY_MS);
    }

    function scheduleViewAutosave() {
      if (viewTimer) clearTimer(viewTimer);
      viewTimer = setTimer(() => {
        viewTimer = 0;
        void autosaveView();
      }, VIEW_AUTOSAVE_DELAY_MS);
    }

    function markDatasetForAutosave() {
      state.recovery.datasetDirty = true;
      if (state.settings?.autosave !== false) scheduleDatasetAutosave();
    }

    async function autosaveDataset() {
      if (!state.entries?.length || state.settings?.autosave === false || !getRecoveryAvailability() || state.recovery.saving) return;
      const eligibility = getAutosaveEligibility(state.entries);
      if (!eligibility?.allowed) {
        state.recovery.datasetDirty = false;
        return;
      }
      state.recovery.saving = true;
      try {
        const result = await saveRecoveryDataset(state.entries, getWorkspaceState(), appVersion);
        state.recovery.datasetDirty = !result?.allowed;
        if (result?.allowed) await saveRecoveryView(getViewState(), state.settings);
      } catch {
        // Recovery is best-effort and never blocks the workspace.
      } finally {
        state.recovery.saving = false;
      }
    }

    async function autosaveView() {
      if (!state.entries?.length || state.settings?.autosave === false || !getRecoveryAvailability() || state.recovery.datasetDirty) return;
      try {
        await saveRecoveryView(getViewState(), state.settings);
      } catch {
        // View recovery is best-effort.
      }
    }

    async function checkRecoverySnapshot() {
      if (!getRecoveryAvailability() || state.entries?.length || state.recovery.dismissed) return;
      try {
        const info = await getRecoveryInfo();
        if (!info?.entryCount) return;
        state.recovery.available = true;
        const chunkMeta = info.chunkCount > 1 ? ` · ${info.chunkCount.toLocaleString()} chunks` : "";
        if (el.recoveryMeta) el.recoveryMeta.textContent = `${info.entryCount.toLocaleString()} entries · ${formatBytes(info.byteSize)}${chunkMeta} · saved ${new Date(info.savedAt).toLocaleString()}`;
        if (el.recoveryBanner) el.recoveryBanner.hidden = false;
      } catch {
        // Recovery may be unavailable in restricted browser contexts.
      }
    }

    function hideRecoveryBanner() {
      state.recovery.available = false;
      if (el.recoveryBanner) el.recoveryBanner.hidden = true;
    }

    function dismissRecoverySnapshot() {
      state.recovery.dismissed = true;
      hideRecoveryBanner();
    }

    async function clearRecoverySnapshot(options = {}) {
      if (!getRecoveryAvailability()) return;
      try {
        await clearRecovery();
        state.recovery.datasetDirty = false;
        hideRecoveryBanner();
        updateAutosaveStatus();
        if (!options.silent) toast("Local recovery snapshot cleared.");
      } catch (error) {
        if (!options.silent) toast(`Could not clear recovery snapshot: ${error?.message || error}`, "error", 6500);
      }
    }

    async function clearSearchCacheAction() {
      try {
        const result = await clearSearchCache();
        if (result?.available === false) {
          toast("Search cache module is unavailable in this context.", "error");
          return;
        }
        state.searchIndex.cacheHit = false;
        state.searchIndex.cacheSegments = 0;
        updateDiagnostics();
        toast("Local search index cache cleared.");
      } catch (error) {
        toast(`Could not clear search cache: ${error?.message || error}`, "error", 6500);
      }
    }

    function updateAutosaveStatus() {
      if (!el.autosaveStatus) return;
      if (state.settings?.autosave === false) {
        el.autosaveStatus.textContent = "Autosave disabled.";
        return;
      }
      if (!state.entries?.length) {
        el.autosaveStatus.textContent = "Autosave ready · no logs loaded.";
        return;
      }
      if (!getRecoveryAvailability()) {
        el.autosaveStatus.textContent = "IndexedDB recovery unavailable in this browser.";
        return;
      }
      const eligibility = getAutosaveEligibility(state.entries);
      el.autosaveStatus.textContent = eligibility?.allowed
        ? `Eligible · ~${formatBytes(eligibility.estimatedBytes)} estimated snapshot`
        : (eligibility?.reason || "Recovery snapshot unavailable.");
    }

    async function restoreRecoverySnapshot() {
      if (!getRecoveryAvailability()) return;
      setProcessing(true, "Restoring local recovery…", "Reading IndexedDB snapshot");
      try {
        const recovery = await loadRecovery();
        if (!recovery?.parsed) throw new Error("No recovery snapshot is available.");
        await restoreWorkspacePayload(recovery.parsed, `Recovery · ${new Date(recovery.metadata?.savedAt || Date.now()).toLocaleString()}`);
        hideRecoveryBanner();
        toast(`Recovered ${(state.entries?.length || 0).toLocaleString()} local entries.`);
      } catch (error) {
        toast(`Could not restore recovery snapshot: ${error?.message || error}`, "error", 7500);
      } finally {
        setProcessing(false);
      }
    }

    function formatMetricMs(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return "—";
      return number < 10 ? `${number.toFixed(1)} ms` : `${Math.round(number)} ms`;
    }

    function updateDiagnostics() {
      if (!el.diagnosticsGrid) return;
      const snapshot = getPerformanceSnapshot() || {};
      const metrics = snapshot.metrics || {};
      const virtual = state.virtual || { start: 0, end: 0, compressed: false };
      const searchIndex = state.searchIndex || {};
      el.diagnosticsGrid.replaceChildren();
      const rows = [
        ["Dataset", `${(state.entries?.length || 0).toLocaleString()} entries`],
        ["Filtered", `${(state.filteredIndexes?.length || 0).toLocaleString()} entries`],
        ["Filter last / p95", `${formatMetricMs(metrics.filter?.lastMs)} / ${formatMetricMs(metrics.filter?.p95Ms)}`],
        ["Table render last / p95", `${formatMetricMs(metrics["table-render"]?.lastMs)} / ${formatMetricMs(metrics["table-render"]?.p95Ms)}`],
        ["Table mode", state.renderMode === "virtual" && canUseVirtualTable() ? `Windowed · ${Math.max(0, (virtual.end || 0) - (virtual.start || 0))} DOM rows${virtual.compressed ? " · compressed scale" : ""}` : `Paged · ${Number(state.pageSize) || 100} rows`],
        ["Parser last / p95", `${formatMetricMs(metrics.parse?.lastMs)} / ${formatMetricMs(metrics.parse?.p95Ms)}`],
        ["Long tasks", `${(Number(snapshot.longTasks) || 0).toLocaleString()} · max ${formatMetricMs(snapshot.longestTaskMs)}`],
        ["Filter engine", state.lastEngine || "idle"],
        ["Search index", searchIndex.enabled ? `${(Number(searchIndex.tokens) || 0).toLocaleString()} tokens · ${searchIndex.mode || "indexed"}${["indexed", "disk-indexed"].includes(searchIndex.mode) ? ` · ${(Number(searchIndex.candidateCount) || 0).toLocaleString()} candidates` : ""}` : (searchIndex.mode === "building" ? "Building…" : "Linear fallback")],
        ["Search cache", searchIndex.cacheHit ? `Disk-backed restore · ${searchIndex.cacheSegments || 0} buckets` : searchIndex.cacheEligible ? `Eligible · ${searchIndex.cacheSegments || 0} local buckets` : "Not active"],
        ["Exception groups", `${state.exceptionGroups?.length || 0} fingerprints`],
        ["Case", `${state.caseFile?.status || "open"} · ${state.caseFile?.severity || "none"} · ${state.caseFile?.findings?.length || 0} findings`],
        ["Investigation", `${state.investigation?.items?.length || 0} evidence items`],
        ["Recovery", getRecoveryAvailability() ? "IndexedDB chunked-v1" : "Unavailable"]
      ];
      if (snapshot.memory?.usedJSHeapBytes) rows.splice(6, 0, ["JS heap", `${formatBytes(snapshot.memory.usedJSHeapBytes)} / ${formatBytes(snapshot.memory.jsHeapLimitBytes)}`]);
      for (const [label, value] of rows) {
        const row = ownerDocument.createElement("div");
        const dt = ownerDocument.createElement("span");
        const dd = ownerDocument.createElement("strong");
        dt.textContent = label;
        dd.textContent = value;
        row.append(dt, dd);
        el.diagnosticsGrid.appendChild(row);
      }
    }

    async function copyDiagnostics() {
      let recovery = null;
      try {
        recovery = getRecoveryAvailability() ? await getRecoveryInfo() : null;
      } catch {
        recovery = null;
      }
      const payload = {
        app: "SignalDock",
        version: appVersion,
        generatedAt: new Date().toISOString(),
        dataset: {
          entries: state.entries?.length || 0,
          filtered: state.filteredIndexes?.length || 0,
          loadedBytes: Number(state.loadedBytes) || 0,
          sources: state.summary?.sources?.length || 0,
          services: state.summary?.services?.length || 0
        },
        engines: {
          filter: state.lastEngine || "idle",
          workerAvailable: Boolean(state.workerAvailable),
          workerReady: Boolean(state.workerReady),
          searchIndex: state.searchIndex
        },
        capabilities: getCapabilitySnapshot(),
        recovery,
        performance: getPerformanceSnapshot() || null
      };
      try {
        await copyText(JSON.stringify(payload, null, 2));
        toast("Support details copied.");
      } catch {
        toast("Could not copy support details.", "error");
      }
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(el.recoveryRestoreButton, "click", restoreRecoverySnapshot);
      listen(el.recoveryDismissButton, "click", dismissRecoverySnapshot);
      listen(el.clearRecoveryButton, "click", clearRecoverySnapshot);
      listen(el.clearSearchCacheButton, "click", clearSearchCacheAction);
      listen(el.copyDiagnosticsButton, "click", copyDiagnostics);
    }

    function destroy() {
      if (datasetTimer) clearTimer(datasetTimer);
      if (viewTimer) clearTimer(viewTimer);
      datasetTimer = 0;
      viewTimer = 0;
      while (listeners.length) {
        const [target, type, handler] = listeners.pop();
        target.removeEventListener(type, handler);
      }
      bound = false;
    }

    return Object.freeze({
      bind,
      destroy,
      markDatasetForAutosave,
      scheduleDatasetAutosave,
      scheduleViewAutosave,
      autosaveDataset,
      autosaveView,
      checkRecoverySnapshot,
      hideRecoveryBanner,
      dismissRecoverySnapshot,
      clearRecoverySnapshot,
      clearSearchCache: clearSearchCacheAction,
      updateAutosaveStatus,
      restoreRecoverySnapshot,
      updateDiagnostics,
      copyDiagnostics,
      formatMetricMs
    });
  }

  root.SignalDockRecoveryDiagnosticsController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
