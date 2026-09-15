(function (root) {
  "use strict";

  const VERSION = 1;
  const MIME_JSON = "application/json;charset=utf-8";

  function create(options = {}) {
    const {
      state,
      el,
      appVersion = "",
      getUtils,
      toast,
      quoteIfNeeded,
      applyFilters,
      closeCompetingDialogs,
      showDialogSafely,
      getProjectName,
      attachBaselineToActiveProject,
      renderProjects,
      scheduleDatasetAutosave,
      promptText = (message, value) => root.prompt?.(message, value)
    } = options;

    const requiredFunctions = {
      getUtils,
      toast,
      quoteIfNeeded,
      applyFilters,
      closeCompetingDialogs,
      showDialogSafely,
      getProjectName,
      attachBaselineToActiveProject,
      renderProjects,
      scheduleDatasetAutosave
    };
    if (!state || !el) throw new TypeError("Baseline controller requires state and element registries.");
    for (const [name, value] of Object.entries(requiredFunctions)) {
      if (typeof value !== "function") throw new TypeError(`Baseline controller requires ${name}().`);
    }
    if (!root.SignalDockBaselineManager) throw new Error("SignalDock Baseline Manager is unavailable.");

    const doc = el.baselineDialog?.ownerDocument || root.document;
    if (!doc) throw new Error("Baseline controller requires a document.");

    let bound = false;
    const listeners = [];

    function manager() {
      return root.SignalDockBaselineManager;
    }

    function listen(node, type, handler) {
      if (!node) return;
      node.addEventListener(type, handler);
      listeners.push([node, type, handler]);
    }

    function makeButton(label, className = "button button--ghost button--small") {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = className;
      button.textContent = label;
      return button;
    }

    function makeOption(label, value = label) {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }

    function formatDelta(value, suffix = "") {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
      const number = Number(value);
      const sign = number > 0 ? "+" : "";
      const rendered = Math.abs(number) < 1 && suffix === "%"
        ? (number * 100).toFixed(1)
        : number.toFixed(Math.abs(number) >= 100 ? 0 : 1);
      return `${sign}${rendered}${suffix}`;
    }

    function formatSavedAt(value) {
      const timestamp = Date.parse(String(value || ""));
      return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "Unknown time";
    }

    async function saveText(name, text) {
      if (root.SignalDockStorageAdapter?.saveText) {
        await root.SignalDockStorageAdapter.saveText({ name, text, mime: MIME_JSON });
        return;
      }
      getUtils().downloadParts(name, [text], MIME_JSON);
    }

    function currentSnapshot(scopeFiltered = false) {
      if (!state.entries.length) return null;
      return manager().snapshot(state.entries, scopeFiltered ? state.filteredIndexes : null, {
        appVersion,
        name: el.baselineName?.value?.trim() || "Current dataset",
        scope: scopeFiltered ? "filtered" : "all"
      });
    }

    function syncHistorySelection() {
      state.baselineHistorySelection = {
        baseId: el.baselineCompareBase?.value || "",
        currentId: el.baselineCompareCurrent?.value || ""
      };
      if (el.compareSavedBaselinesButton) {
        const { baseId, currentId } = state.baselineHistorySelection;
        el.compareSavedBaselinesButton.disabled = !baseId || !currentId || baseId === currentId;
      }
    }

    function renderHistory() {
      if (!el.baselineHistoryList) return;
      state.baselineHistory = manager().normalizeHistory(state.baselineHistory);
      const items = state.baselineHistory;
      const previousBase = state.baselineHistorySelection.baseId || el.baselineCompareBase?.value || "";
      const previousCurrent = state.baselineHistorySelection.currentId || el.baselineCompareCurrent?.value || "";
      const options = () => [
        makeOption("Choose saved baseline…", ""),
        ...items.map((item) => makeOption(`${item.baseline.name} · ${getProjectName(item.projectId)} · ${item.baseline.entries.toLocaleString()} entries`, item.id))
      ];

      if (el.baselineCompareBase) {
        el.baselineCompareBase.replaceChildren(...options());
        el.baselineCompareBase.value = items.some((item) => item.id === previousBase) ? previousBase : (items[1]?.id || "");
      }
      if (el.baselineCompareCurrent) {
        el.baselineCompareCurrent.replaceChildren(...options());
        el.baselineCompareCurrent.value = items.some((item) => item.id === previousCurrent) ? previousCurrent : (items[0]?.id || "");
      }
      syncHistorySelection();
      el.baselineHistoryList.replaceChildren();

      if (!items.length) {
        const empty = doc.createElement("div");
        empty.className = "case-findings__empty";
        empty.textContent = "No saved baselines yet. Captured and imported baselines will appear here.";
        el.baselineHistoryList.appendChild(empty);
        return;
      }

      for (const item of items) {
        const row = doc.createElement("article");
        row.className = `baseline-history-row${state.baselineSnapshot?.id === item.baseline.id ? " is-active" : ""}`;
        const copy = doc.createElement("div");
        const strong = doc.createElement("strong");
        strong.textContent = item.baseline.name;
        const small = doc.createElement("small");
        small.textContent = `${item.baseline.entries.toLocaleString()} entries · ${item.baseline.scope} · ${getProjectName(item.projectId)} · ${formatSavedAt(item.savedAt)}${item.tags.length ? ` · ${item.tags.join(" · ")}` : ""}`;
        copy.append(strong, small);
        const actions = doc.createElement("div");
        for (const [action, label] of [["use", "Use"], ["rename", "Rename"], ["remove", "Remove"]]) {
          const button = makeButton(label, action === "use" ? "button button--primary button--small" : undefined);
          button.dataset.baselineHistoryAction = action;
          button.dataset.baselineHistoryId = item.id;
          actions.appendChild(button);
        }
        row.append(copy, actions);
        el.baselineHistoryList.appendChild(row);
      }
    }

    function addToHistory(baseline, meta = {}) {
      state.baselineHistory = manager().addToHistory(state.baselineHistory, baseline, {
        projectId: state.activeProjectId || "",
        ...meta
      });
      attachBaselineToActiveProject(baseline, meta);
    }

    function renderComparisonResult(comparison, currentSnapshot, baselineSnapshot, label = "") {
      if (!comparison || !currentSnapshot || !baselineSnapshot) return;
      state.baselineComparison = comparison;
      const regression = root.SignalDockTraceRegression?.compare?.(currentSnapshot, baselineSnapshot) || { rows: [], summary: { regressed: 0 } };
      const sum = comparison.summary;
      if (el.baselineSummary) {
        el.baselineSummary.textContent = `${label ? `${label} · ` : ""}${currentSnapshot.name}: ${sum.currentEntries.toLocaleString()} vs ${baselineSnapshot.name}: ${sum.baselineEntries.toLocaleString()} entries · ${sum.serviceChanges} service changes · ${sum.dependencyChanges} dependency changes · ${regression.summary.regressed || 0} regressed trace sets`;
      }
      if (el.baselineChangeCount) el.baselineChangeCount.textContent = String((sum.serviceChanges || 0) + (regression.summary.regressed || 0));

      el.baselineServiceBody?.replaceChildren();
      for (const item of (comparison.services || []).slice(0, 80)) {
        const tr = doc.createElement("tr");
        for (const value of [item.service, formatDelta(item.entryDelta), formatDelta(item.errorRateDelta, "%"), formatDelta(item.p95Delta, " ms")]) {
          const td = doc.createElement("td"); td.textContent = value; tr.appendChild(td);
        }
        const action = doc.createElement("td");
        const button = makeButton("Filter");
        button.dataset.baselineService = item.service;
        action.appendChild(button); tr.appendChild(action); el.baselineServiceBody?.appendChild(tr);
      }

      el.baselineDependencyBody?.replaceChildren();
      for (const item of (comparison.dependencies || []).slice(0, 80)) {
        const tr = doc.createElement("tr");
        for (const value of [`${item.from} → ${item.to}`, formatDelta(item.callDelta), formatDelta(item.errorRateDelta, "%"), formatDelta(item.p95Delta, " ms")]) {
          const td = doc.createElement("td"); td.textContent = value; tr.appendChild(td);
        }
        const action = doc.createElement("td");
        const button = makeButton("Filter target");
        button.dataset.baselineDependencyTo = item.to;
        action.appendChild(button); tr.appendChild(action); el.baselineDependencyBody?.appendChild(tr);
      }

      el.baselineTraceBody?.replaceChildren();
      for (const item of (regression.rows || []).slice(0, 80)) {
        const tr = doc.createElement("tr");
        for (const value of [item.signature, item.status, formatDelta(item.countDelta), formatDelta(item.p95Delta, " ms"), formatDelta(item.errorRateDelta, "%")]) {
          const td = doc.createElement("td"); td.textContent = value; tr.appendChild(td);
        }
        tr.dataset.status = item.status;
        el.baselineTraceBody?.appendChild(tr);
      }
    }

    function render() {
      if (!el.baselineSummary) return;
      renderHistory();
      const baseline = state.baselineSnapshot;
      if (!baseline) {
        if (el.baselineMeta) el.baselineMeta.textContent = "Capture/import a baseline or choose one from local history.";
        el.baselineSummary.textContent = state.baselineHistory.length ? `${state.baselineHistory.length} saved baseline snapshots available.` : "No baseline loaded.";
        el.baselineServiceBody?.replaceChildren();
        el.baselineDependencyBody?.replaceChildren();
        el.baselineTraceBody?.replaceChildren();
        if (el.baselineChangeCount) el.baselineChangeCount.textContent = "0";
        return;
      }
      if (el.baselineMeta) el.baselineMeta.textContent = `${baseline.name} · ${baseline.entries.toLocaleString()} entries · captured ${baseline.capturedAt ? formatSavedAt(baseline.capturedAt) : "locally"}`;
      if (!state.entries.length) {
        el.baselineSummary.textContent = "Baseline ready. Load another dataset to compare it.";
        return;
      }
      const current = currentSnapshot(false);
      renderComparisonResult(manager().compare(current, baseline), current, baseline, "Current dataset comparison");
    }

    function open() {
      closeCompetingDialogs("baselineDialog");
      render();
      showDialogSafely(el.baselineDialog);
    }

    function close() {
      if (!el.baselineDialog) return;
      if (typeof el.baselineDialog.close === "function" && el.baselineDialog.open) el.baselineDialog.close();
      else el.baselineDialog.removeAttribute("open");
    }

    function capture(filtered = false) {
      if (!state.entries.length) { toast("Load logs before capturing a baseline."); return; }
      if (filtered && !state.filteredIndexes.length) { toast("The current filters contain no entries to capture."); return; }
      state.baselineSnapshot = currentSnapshot(filtered);
      state.baselineComparison = null;
      addToHistory(state.baselineSnapshot);
      if (el.baselineName) el.baselineName.value = state.baselineSnapshot.name;
      render();
      renderProjects();
      scheduleDatasetAutosave();
      toast(`Captured ${filtered ? "filtered " : ""}baseline · ${state.baselineSnapshot.entries.toLocaleString()} entries.`);
    }

    async function exportCurrent() {
      if (!state.baselineSnapshot) { toast("Capture or import a baseline first."); return; }
      const text = manager().exportJson(state.baselineSnapshot);
      const safe = (state.baselineSnapshot.name || "baseline").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "") || "baseline";
      await saveText(`${safe}.sdbaseline`, text);
      toast("Baseline exported without raw logs.");
    }

    async function importCurrent(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        state.baselineSnapshot = manager().parse(await file.text());
        addToHistory(state.baselineSnapshot, { description: `Imported from ${file.name}` });
        if (el.baselineName) el.baselineName.value = state.baselineSnapshot.name;
        render();
        renderProjects();
        scheduleDatasetAutosave();
        toast(`Imported baseline “${state.baselineSnapshot.name}”.`);
      } catch (error) {
        toast(`Could not import baseline: ${error.message || error}`, "error", 7000);
      } finally {
        event.target.value = "";
      }
    }

    async function exportHistory() {
      const text = manager().exportHistory(state.baselineHistory);
      const name = `signaldock-baselines-${new Date().toISOString().slice(0, 10)}.sdbaselines`;
      await saveText(name, text);
      toast(`Exported ${state.baselineHistory.length} saved baselines.`);
    }

    async function importHistory(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        state.baselineHistory = manager().importHistory(await file.text(), state.baselineHistory);
        renderHistory();
        toast(`Baseline history now contains ${state.baselineHistory.length} snapshots.`);
      } catch (error) {
        toast(`Could not import baseline history: ${error.message || error}`, "error", 7000);
      } finally {
        event.target.value = "";
      }
    }

    function onHistoryClick(event) {
      const button = event.target.closest("[data-baseline-history-action]");
      if (!button) return;
      const id = button.dataset.baselineHistoryId;
      const item = state.baselineHistory.find((candidate) => candidate.id === id);
      if (!item) return;

      if (button.dataset.baselineHistoryAction === "use") {
        state.baselineSnapshot = item.baseline;
        if (el.baselineName) el.baselineName.value = item.baseline.name;
        render();
        return;
      }
      if (button.dataset.baselineHistoryAction === "remove") {
        state.baselineHistory = manager().removeFromHistory(state.baselineHistory, id);
        renderHistory();
        toast("Saved baseline removed from local history.");
        return;
      }
      if (button.dataset.baselineHistoryAction === "rename") {
        const name = promptText("Rename saved baseline:", item.baseline.name);
        if (!name?.trim()) return;
        state.baselineHistory = manager().renameInHistory(state.baselineHistory, id, name);
        if (state.baselineSnapshot?.id === item.baseline.id) {
          state.baselineSnapshot = state.baselineHistory.find((candidate) => candidate.id === id)?.baseline || state.baselineSnapshot;
        }
        render();
      }
    }

    function compareSaved() {
      syncHistorySelection();
      const { baseId, currentId } = state.baselineHistorySelection;
      if (!baseId || !currentId || baseId === currentId) return;
      try {
        const current = state.baselineHistory.find((item) => item.id === currentId)?.baseline;
        const baseline = state.baselineHistory.find((item) => item.id === baseId)?.baseline;
        if (!current || !baseline) throw new Error("Both baselines must exist in local baseline history.");
        const comparison = manager().compareById(state.baselineHistory, currentId, baseId);
        renderComparisonResult(comparison, current, baseline, "Saved baseline comparison");
      } catch (error) {
        toast(error.message || String(error), "error");
      }
    }

    function onServiceClick(event) {
      const button = event.target.closest("[data-baseline-service]");
      if (!button) return;
      close();
      el.queryInput.value = `service:${quoteIfNeeded(button.dataset.baselineService)}`;
      applyFilters(true);
    }

    function onDependencyClick(event) {
      const button = event.target.closest("[data-baseline-dependency-to]");
      if (!button) return;
      close();
      el.queryInput.value = `service:${quoteIfNeeded(button.dataset.baselineDependencyTo)}`;
      applyFilters(true);
    }

    function bind() {
      if (bound) return api;
      listen(el.closeBaselineButton, "click", close);
      listen(el.captureBaselineButton, "click", () => capture(false));
      listen(el.captureFilteredBaselineButton, "click", () => capture(true));
      listen(el.exportBaselineButton, "click", exportCurrent);
      listen(el.importBaselineButton, "click", () => el.baselineFileInput?.click());
      listen(el.baselineFileInput, "change", importCurrent);
      listen(el.baselineServiceBody, "click", onServiceClick);
      listen(el.baselineDependencyBody, "click", onDependencyClick);
      listen(el.baselineHistoryList, "click", onHistoryClick);
      listen(el.baselineHistoryExportButton, "click", exportHistory);
      listen(el.baselineHistoryImportButton, "click", () => el.baselineHistoryFileInput?.click());
      listen(el.baselineHistoryFileInput, "change", importHistory);
      listen(el.compareSavedBaselinesButton, "click", compareSaved);
      listen(el.baselineCompareBase, "change", syncHistorySelection);
      listen(el.baselineCompareCurrent, "change", syncHistorySelection);
      bound = true;
      return api;
    }

    function destroy() {
      if (!bound) return;
      for (const [node, type, handler] of listeners.splice(0)) node.removeEventListener(type, handler);
      bound = false;
    }

    const api = Object.freeze({ bind, destroy, open, close, render, renderHistory, capture });
    return api;
  }

  root.SignalDockBaselineController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
