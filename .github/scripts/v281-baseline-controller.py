from pathlib import Path


def replace_exact(text, old, new, label, expected=1):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new, expected)


root = Path('.')
app_path = root / 'app.js'
index_path = root / 'index.html'
version_path = root / 'VERSION'
readme_path = root / 'README.md'
changelog_path = root / 'CHANGELOG.md'
technical_path = root / 'docs' / 'TECHNICAL.md'
source_layout_path = root / 'docs' / 'SOURCE-LAYOUT.md'
src_readme_path = root / 'src' / 'README.md'
controller_path = root / 'src' / 'app' / 'baseline-controller.js'
controller_test_path = root / 'tests' / 'baseline-controller-smoke.mjs'
query_controller_test_path = root / 'tests' / 'query-library-controller-smoke.mjs'

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.8.0";', 'const APP_VERSION = "2.8.1";', 'app version')
app = replace_exact(app, '  let queryLibraryController = null;\n', '  let queryLibraryController = null;\n  let baselineController = null;\n', 'baseline controller state slot')
app = replace_exact(app, '      baseline: openBaseline,\n', '      baseline: () => baselineController?.open(),\n', 'baseline nav route')

history_anchor = '    state.baselineHistory = window.SignalDockBaselineManager?.loadHistory?.() || [];\n'
controller_init = history_anchor + '''    if (!window.SignalDockBaselineController?.create) throw new Error("SignalDock Baseline controller is unavailable.");
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
      renderProjects,
      scheduleDatasetAutosave: () => scheduleDatasetAutosave()
    });
    baselineController.bind();
'''
app = replace_exact(app, history_anchor, controller_init, 'baseline controller initialization')

event_start = '    el.closeBaselineButton?.addEventListener("click", closeBaseline);\n'
event_end = '    el.baselineCompareCurrent?.addEventListener("change", syncBaselineHistorySelection);\n'
start = app.find(event_start)
end = app.find(event_end, start)
if start < 0 or end < 0:
    raise SystemExit('baseline event wiring block not found')
end += len(event_end)
app = app[:start] + app[end:]

block_start_token = '  function formatDelta(value, suffix = "") {'
block_end_token = '\nfunction openProjects() {'
block_start = app.find(block_start_token)
block_end = app.find(block_end_token, block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('baseline implementation block not found')
app = app[:block_start] + app[block_end:]

app = app.replace('renderBaselineHistory();', 'baselineController?.renderHistory();')

for forbidden in [
    'function openBaseline()',
    'function closeBaseline()',
    'function renderBaselineHistory()',
    'function captureBaseline(',
    'function exportBaseline()',
    'function importBaseline(',
    'function renderBaselineComparisonResult(',
    'function compareSavedBaselines()',
    'function onBaselineServiceClick(',
    'function onBaselineDependencyClick(',
    'el.captureBaselineButton?.addEventListener',
    'renderBaselineHistory();'
]:
    if forbidden in app:
        raise SystemExit(f'legacy baseline app wiring remains: {forbidden}')
app_path.write_text(app)

controller_path.parent.mkdir(parents=True, exist_ok=True)
controller_path.write_text(r'''(function (root) {
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
''')

index = index_path.read_text()
index = replace_exact(
    index,
    '  <script src="src/app/query-library-controller.js" defer></script>\n',
    '  <script src="src/app/query-library-controller.js" defer></script>\n  <script src="src/app/baseline-controller.js" defer></script>\n',
    'baseline controller script tag'
)
index_path.write_text(index)

version = version_path.read_text().strip()
if version != '2.8.0':
    raise SystemExit(f'VERSION expected 2.8.0, found {version!r}')
version_path.write_text('2.8.1\n')

readme = readme_path.read_text()
readme = replace_exact(readme, 'version-2.8.0-22d3ee', 'version-2.8.1-22d3ee', 'README badge')
readme = replace_exact(readme, 'SignalDock v2.8.0 — real application UI with the bundled demo dataset', 'SignalDock v2.8.1 — real application UI with the bundled demo dataset', 'README caption')
readme = replace_exact(readme, 'alt="SignalDock v2.8.0 application screenshot showing local log analysis"', 'alt="SignalDock v2.8.1 application screenshot showing local log analysis"', 'README screenshot alt')
needle = '- feature-level Query Library controller under `src/app/` with explicit state/callback boundaries and no bundler dependency\n'
readme = replace_exact(readme, needle, needle + '- feature-level Baseline controller under `src/app/` with explicit Project/filters/autosave callbacks and preserved aggregate-only baseline semantics\n', 'README baseline controller highlight')
readme_path.write_text(readme)

technical = technical_path.read_text()
technical = replace_exact(technical, 'Current version: **2.8.0**.', 'Current version: **2.8.1**.', 'technical version')
needle = '`query-library-controller.js` owns Query Library rendering, event listeners, local import/export actions, folder management and bulk selection. Its event binding is idempotent and exposes teardown for deterministic lifecycle management. Domain persistence and normalization remain in `src/core/query-library.js`, so UI coordination and Query Library data rules stay separate.\n'
technical = replace_exact(technical, needle, needle + '\n`baseline-controller.js` owns Baseline Compare and Baseline History UI coordination, while aggregate snapshot normalization/comparison remains in `src/investigation/baseline-manager.js`. Project naming/attachment, filter application and autosave are injected callbacks so the controller does not reach into Project Manager implementation details.\n', 'technical baseline controller section')
technical_path.write_text(technical)

source_layout = source_layout_path.read_text()
needle = 'Feature controllers under `src/app/` must receive their state, element registry and cross-feature actions through an explicit factory boundary; they should not create hidden global application state.\n'
source_layout = replace_exact(source_layout, needle, needle + '\nCurrent feature controllers: `query-library-controller.js` and `baseline-controller.js`. Cross-feature work must be supplied as narrow callbacks rather than direct controller-to-controller calls.\n', 'source layout controller note')
source_layout_path.write_text(source_layout)

src_readme = src_readme_path.read_text()
if 'baseline-controller.js' not in src_readme:
    marker = '- `app/` — feature-level application controllers with explicit state/element/callback boundaries\n'
    if marker in src_readme:
        src_readme = src_readme.replace(marker, marker + '  - `baseline-controller.js` — Baseline Compare/History UI coordination\n', 1)
    else:
        src_readme += '\n`app/baseline-controller.js` owns Baseline Compare/History UI coordination.\n'
src_readme_path.write_text(src_readme)

changelog = changelog_path.read_text()
release = '''## 2.8.1 — 2026-09-16

### Baseline application controller
- Extracted Baseline Compare and Baseline History rendering, event ownership, import/export and capture actions from the root `app.js` into `src/app/baseline-controller.js`.
- Kept aggregate snapshot/comparison rules in `src/investigation/baseline-manager.js`; the new controller receives Project naming/attachment, filter application and autosave operations through explicit callbacks.
- Added idempotent listener binding/teardown and hardened stale saved-baseline comparison selection handling.
- Replaced implicit global `Option` construction with document-owned option creation so the controller has a narrower runtime surface and is easier to test.

### Regression coverage
- Added a dedicated Baseline controller architecture smoke test and extended the source-layout/HTTP gates to require both application controllers.
- Kept retained feature tests version-forward so patch/minor releases no longer fail merely because a feature introduced in an earlier release remains present.

'''
if '## 2.8.1 — 2026-09-16' in changelog:
    raise SystemExit('2.8.1 changelog already present')
changelog = replace_exact(changelog, '# Changelog\n\n', '# Changelog\n\n' + release, 'changelog insertion')
changelog_path.write_text(changelog)

query_test = query_controller_test_path.read_text()
query_test = replace_exact(
    query_test,
    'assert.equal(version, "2.8.0");',
    'const queryFeatureVersion = version.split(".").map(Number);\nassert.ok(queryFeatureVersion.length === 3 && queryFeatureVersion.every(Number.isFinite) && (queryFeatureVersion[0] > 2 || (queryFeatureVersion[0] === 2 && queryFeatureVersion[1] >= 8)), `expected SignalDock >= 2.8.x, got ${version}`);',
    'query controller version-forward gate'
)
query_controller_test_path.write_text(query_test)

controller_test_path.write_text(r'''import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const html = read("index.html");
const app = read("app.js");
const controller = read("src/app/baseline-controller.js");

assert.equal(version, "2.8.1");
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
const controllerIndex = scripts.indexOf("src/app/baseline-controller.js");
const appIndex = scripts.indexOf("app.js");
assert.ok(controllerIndex >= 0 && controllerIndex < appIndex, "baseline controller must load before app.js");

for (const token of [
  "SignalDockBaselineController.create",
  "baselineController.bind()",
  "baseline: () => baselineController?.open()",
  "baselineController?.renderHistory()"
]) assert.ok(app.includes(token), `baseline app integration token missing: ${token}`);

for (const token of [
  "function openBaseline()",
  "function renderBaselineHistory()",
  "function captureBaseline(",
  "function compareSavedBaselines()",
  "function onBaselineServiceClick(",
  "el.captureBaselineButton?.addEventListener"
]) assert.ok(!app.includes(token), `Baseline implementation leaked back into app.js: ${token}`);

for (const token of [
  "const VERSION = 1",
  "function create(options = {})",
  "function bind()",
  "function destroy()",
  "let bound = false",
  "function renderHistory()",
  "function renderComparisonResult(",
  "attachBaselineToActiveProject",
  "getProjectName",
  "Both baselines must exist in local baseline history."
]) assert.ok(controller.includes(token), `baseline controller quality token missing: ${token}`);

for (const primitive of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("]) {
  assert.ok(!controller.includes(primitive), `baseline controller must stay local-only: ${primitive}`);
}

const sandbox = { self: {}, console };
vm.runInNewContext(controller, sandbox, { filename: "baseline-controller.js" });
assert.equal(sandbox.self.SignalDockBaselineController.VERSION, 1);
assert.equal(typeof sandbox.self.SignalDockBaselineController.create, "function");
assert.equal(Object.isFrozen(sandbox.self.SignalDockBaselineController), true);

console.log("baseline-controller-smoke PASS");
''')

print('v2.8.1 Baseline controller migration staged')
