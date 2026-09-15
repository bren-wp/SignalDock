from pathlib import Path


def replace_exact(text, old, new, label, expected=1):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


root = Path('.')
app_path = root / 'app.js'
index_path = root / 'index.html'
version_path = root / 'VERSION'
readme_path = root / 'README.md'
changelog_path = root / 'CHANGELOG.md'
source_layout_path = root / 'docs' / 'SOURCE-LAYOUT.md'
technical_path = root / 'docs' / 'TECHNICAL.md'
src_readme_path = root / 'src' / 'README.md'
layout_test_path = root / 'tests' / 'source-layout-smoke.mjs'
controller_test_path = root / 'tests' / 'query-library-controller-smoke.mjs'
controller_path = root / 'src' / 'app' / 'query-library-controller.js'

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.7.4";', 'const APP_VERSION = "2.8.0";', 'app version')
app = replace_exact(app, '  let virtualSpacerRules = null;\n', '  let virtualSpacerRules = null;\n  let queryLibraryController = null;\n', 'controller state slot')
app = replace_exact(app, '      saved: openQueryLibrary\n', '      saved: () => queryLibraryController?.open()\n', 'query library nav route')

state_anchor = '    state.queryLibrary = window.SignalDockQueryLibrary?.load?.() || [];\n'
controller_init = '''    state.queryLibrary = window.SignalDockQueryLibrary?.load?.() || [];
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
'''
app = replace_exact(app, state_anchor, controller_init, 'query controller initialization')

event_start = '    el.closeQueryLibraryButton?.addEventListener("click", closeQueryLibrary);\n'
event_end = '    el.queryLibraryBulkClear?.addEventListener("click", () => { state.queryLibrarySelection = []; renderQueryLibrary(); });\n'
start = app.find(event_start)
end = app.find(event_end, start)
if start < 0 or end < 0:
    raise SystemExit('query library event wiring block not found')
end += len(event_end)
app = app[:start] + app[end:]

block_start = app.find('  function openQueryLibrary() {\n')
block_end = app.find('  function formatDelta(', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('query library controller block not found')
app = app[:block_start] + app[block_end:]

for forbidden in [
    'function openQueryLibrary()',
    'function renderQueryLibrary()',
    'function saveCurrentQueryToLibrary()',
    'function onQueryLibraryClick(event)',
    'function exportQueryLibrary()',
    'el.queryLibrarySaveButton?.addEventListener'
]:
    if forbidden in app:
        raise SystemExit(f'legacy query-library app wiring remains: {forbidden}')
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
      getUtils,
      toast,
      buildViewName,
      syncLevelChips,
      applyFilters,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav,
      confirmAction = (message) => Boolean(root.confirm?.(message))
    } = options;

    const requiredFunctions = {
      getUtils,
      toast,
      buildViewName,
      syncLevelChips,
      applyFilters,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    };
    if (!state || !el) throw new TypeError("Query Library controller requires state and element registries.");
    for (const [name, value] of Object.entries(requiredFunctions)) {
      if (typeof value !== "function") throw new TypeError(`Query Library controller requires ${name}().`);
    }
    if (!root.SignalDockQueryLibrary) throw new Error("SignalDock Query Library model is unavailable.");

    const doc = el.queryLibraryDialog?.ownerDocument || root.document;
    if (!doc) throw new Error("Query Library controller requires a document.");

    let bound = false;
    const listeners = [];

    function library() {
      return root.SignalDockQueryLibrary;
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

    function setSelectValue(select, value, fallback = "") {
      if (!select) return;
      const wanted = Array.from(select.options || []).some((option) => option.value === value) ? value : fallback;
      select.value = wanted;
    }

    async function saveJson(name, text) {
      if (root.SignalDockStorageAdapter?.saveText) {
        await root.SignalDockStorageAdapter.saveText({ name, text, mime: MIME_JSON });
        return;
      }
      getUtils().downloadParts(name, [text], MIME_JSON);
    }

    function close() {
      if (!el.queryLibraryDialog) return;
      if (typeof el.queryLibraryDialog.close === "function" && el.queryLibraryDialog.open) el.queryLibraryDialog.close();
      else el.queryLibraryDialog.removeAttribute("open");
      setActiveNav("logs");
    }

    function renderBulk(folderNames, visible) {
      const validIds = new Set(state.queryLibrary.map((item) => item.id));
      state.queryLibrarySelection = state.queryLibrarySelection.filter((id) => validIds.has(id));
      if (el.queryLibraryBulkCount) el.queryLibraryBulkCount.textContent = `${state.queryLibrarySelection.length.toLocaleString()} selected`;

      if (el.queryLibraryBulkFolder) {
        const current = el.queryLibraryBulkFolder.value || "General";
        const names = folderNames.length ? folderNames : ["General"];
        el.queryLibraryBulkFolder.replaceChildren(...names.map((name) => makeOption(name)));
        el.queryLibraryBulkFolder.value = names.includes(current) ? current : (names.includes("General") ? "General" : names[0]);
      }

      const hasSelection = state.queryLibrarySelection.length > 0;
      [
        el.queryLibraryBulkFavorite,
        el.queryLibraryBulkUnfavorite,
        el.queryLibraryBulkMove,
        el.queryLibraryBulkExport,
        el.queryLibraryBulkDelete,
        el.queryLibraryBulkClear
      ].forEach((button) => { if (button) button.disabled = !hasSelection; });
      if (el.queryLibraryBulkSelectVisible) el.queryLibraryBulkSelectVisible.disabled = !visible.length;
    }

    function render() {
      if (!el.queryLibraryList) return;
      const api = library();
      state.queryLibrary = api.normalize(state.queryLibrary);
      if (el.savedCount) el.savedCount.textContent = state.queryLibrary.length.toLocaleString();

      const folderRows = api.folders(state.queryLibrary);
      const folderNames = folderRows.map((item) => item.name);
      if (!folderNames.includes("General")) folderNames.unshift("General");

      if (el.queryLibraryFolderFilter) {
        const current = state.queryLibraryFolderFilter || "*";
        el.queryLibraryFolderFilter.replaceChildren(
          makeOption("All folders", "*"),
          ...folderRows.map((item) => makeOption(`${item.name} (${item.count})`, item.name))
        );
        el.queryLibraryFolderFilter.value = folderRows.some((item) => item.name === current) || current === "*" ? current : "*";
        state.queryLibraryFolderFilter = el.queryLibraryFolderFilter.value;
      }

      if (el.queryLibraryManageFolder) {
        const current = el.queryLibraryManageFolder.value || folderNames[0];
        el.queryLibraryManageFolder.replaceChildren(...folderNames.map((name) => makeOption(name)));
        el.queryLibraryManageFolder.value = folderNames.includes(current) ? current : folderNames[0];
      }
      if (el.queryLibrarySearch && el.queryLibrarySearch.value !== state.queryLibrarySearch) el.queryLibrarySearch.value = state.queryLibrarySearch || "";

      const visible = api.search(state.queryLibrary, state.queryLibrarySearch, state.queryLibraryFolderFilter);
      const visibleByFolder = new Map();
      for (const item of visible) visibleByFolder.set(item.folder, (visibleByFolder.get(item.folder) || 0) + 1);
      renderBulk(folderNames, visible);
      el.queryLibraryList.replaceChildren();

      if (!visible.length) {
        const empty = doc.createElement("div");
        empty.className = "case-findings__empty";
        empty.textContent = state.queryLibrary.length ? "No reusable queries match the current library search/filter." : "No reusable queries saved yet.";
        el.queryLibraryList.appendChild(empty);
        return;
      }

      let activeFolder = "";
      for (const item of visible) {
        if (item.folder !== activeFolder) {
          activeFolder = item.folder;
          const heading = doc.createElement("div");
          heading.className = "query-library-folder";
          const strong = doc.createElement("strong");
          strong.textContent = activeFolder;
          const count = doc.createElement("span");
          count.textContent = `${(visibleByFolder.get(activeFolder) || 0).toLocaleString()} visible`;
          heading.append(strong, count);
          el.queryLibraryList.appendChild(heading);
        }

        const card = doc.createElement("article");
        card.className = "query-library-item";
        card.classList.toggle("is-favorite", item.favorite);
        card.classList.toggle("is-selected", state.queryLibrarySelection.includes(item.id));

        const select = doc.createElement("input");
        select.type = "checkbox";
        select.className = "query-library-select";
        select.dataset.queryLibrarySelect = item.id;
        select.checked = state.queryLibrarySelection.includes(item.id);
        select.setAttribute("aria-label", `Select ${item.name}`);

        const copy = doc.createElement("div");
        const strong = doc.createElement("strong");
        strong.textContent = `${item.favorite ? "★ " : ""}${item.name}`;
        const code = doc.createElement("code");
        code.textContent = item.query || "(no text query)";
        const small = doc.createElement("small");
        const usage = item.useCount ? `used ${item.useCount}${item.lastUsedAt ? ` · last ${new Date(item.lastUsedAt).toLocaleString()}` : ""}` : "never applied";
        small.textContent = [item.folder, item.description, item.tags.length ? item.tags.join(" · ") : "", item.level || "", item.timeRange || "", usage].filter(Boolean).join(" · ");
        copy.append(strong, code, small);

        const actions = doc.createElement("div");
        const favorite = makeButton(item.favorite ? "Unfavorite" : "Favorite");
        favorite.dataset.queryLibraryAction = "favorite";
        favorite.dataset.queryLibraryId = item.id;
        const duplicate = makeButton("Duplicate");
        duplicate.dataset.queryLibraryAction = "duplicate";
        duplicate.dataset.queryLibraryId = item.id;
        const move = doc.createElement("select");
        move.className = "query-library-move";
        move.dataset.queryLibraryMove = item.id;
        move.title = "Move query to folder";
        move.setAttribute("aria-label", `Move ${item.name} to folder`);
        move.replaceChildren(...folderNames.map((name) => makeOption(name)));
        move.value = item.folder;
        const apply = makeButton("Apply", "button button--primary button--small");
        apply.dataset.queryLibraryAction = "apply";
        apply.dataset.queryLibraryId = item.id;
        const remove = makeButton("Remove");
        remove.dataset.queryLibraryAction = "remove";
        remove.dataset.queryLibraryId = item.id;
        actions.append(favorite, duplicate, move, apply, remove);
        card.append(select, copy, actions);
        el.queryLibraryList.appendChild(card);
      }
    }

    function open() {
      state.queryLibrary = library().load();
      render();
      closeCompetingDialogs("queryLibraryDialog");
      showDialogSafely(el.queryLibraryDialog);
    }

    function saveCurrent() {
      const api = library();
      const name = el.queryLibraryName?.value.trim() || buildViewName() || "Reusable query";
      try {
        state.queryLibrary = api.upsert(state.queryLibrary, {
          name,
          folder: el.queryLibraryFolder?.value || "General",
          favorite: Boolean(el.queryLibraryFavorite?.checked),
          description: el.queryLibraryDescription?.value || "",
          tags: el.queryLibraryTags?.value || "",
          query: el.queryInput.value.trim(),
          level: el.levelFilter.value,
          source: el.sourceFilter.value,
          timeRange: el.timeFilter.value,
          sortMode: el.sortFilter.value
        });
        if (el.queryLibraryName) el.queryLibraryName.value = "";
        if (el.queryLibraryFolder) el.queryLibraryFolder.value = "";
        if (el.queryLibraryFavorite) el.queryLibraryFavorite.checked = false;
        if (el.queryLibraryDescription) el.queryLibraryDescription.value = "";
        if (el.queryLibraryTags) el.queryLibraryTags.value = "";
        render();
        toast(`Saved query “${name}”.`);
      } catch (error) {
        toast(error.message || String(error), "error", 6500);
      }
    }

    function onListClick(event) {
      const button = event.target.closest("[data-query-library-action]");
      if (!button) return;
      const api = library();
      const item = state.queryLibrary.find((candidate) => candidate.id === button.dataset.queryLibraryId);
      if (!item) return;

      if (button.dataset.queryLibraryAction === "remove") {
        state.queryLibrary = api.remove(state.queryLibrary, item.id);
        state.queryLibrarySelection = state.queryLibrarySelection.filter((id) => id !== item.id);
        render();
        return;
      }
      if (button.dataset.queryLibraryAction === "favorite") {
        state.queryLibrary = api.toggleFavorite(state.queryLibrary, item.id);
        render();
        return;
      }
      if (button.dataset.queryLibraryAction === "duplicate") {
        try {
          state.queryLibrary = api.duplicate(state.queryLibrary, item.id);
          render();
          toast(`Duplicated query “${item.name}”.`);
        } catch (error) {
          toast(error.message || String(error), "error");
        }
        return;
      }

      state.queryLibrary = api.markUsed(state.queryLibrary, item.id);
      el.queryInput.value = item.query || "";
      setSelectValue(el.levelFilter, item.level, "");
      setSelectValue(el.sourceFilter, item.source, "");
      setSelectValue(el.timeFilter, item.timeRange, "");
      setSelectValue(el.sortFilter, item.sortMode, "original");
      syncLevelChips(el.levelFilter.value);
      close();
      applyFilters(true);
      toast(`Applied query “${item.name}”.`);
    }

    function onListChange(event) {
      const checkbox = event.target.closest("[data-query-library-select]");
      if (checkbox) {
        const id = checkbox.dataset.queryLibrarySelect;
        state.queryLibrarySelection = checkbox.checked
          ? [...new Set([...state.queryLibrarySelection, id])]
          : state.queryLibrarySelection.filter((value) => value !== id);
        render();
        return;
      }
      const select = event.target.closest("[data-query-library-move]");
      if (!select) return;
      state.queryLibrary = library().moveToFolder(state.queryLibrary, select.dataset.queryLibraryMove, select.value || "General");
      render();
    }

    function selectVisible() {
      const visible = library().search(state.queryLibrary, state.queryLibrarySearch, state.queryLibraryFolderFilter);
      state.queryLibrarySelection = [...new Set([...state.queryLibrarySelection, ...visible.map((item) => item.id)])];
      render();
    }

    function bulkUpdate(patch, message) {
      if (!state.queryLibrarySelection.length) return;
      state.queryLibrary = library().bulkUpdate(state.queryLibrary, state.queryLibrarySelection, patch);
      render();
      if (message) toast(message);
    }

    function moveSelected() {
      if (!el.queryLibraryBulkFolder?.value) return;
      const count = state.queryLibrarySelection.length;
      bulkUpdate({ folder: el.queryLibraryBulkFolder.value }, `Moved ${count} selected queries.`);
    }

    function deleteSelected() {
      const count = state.queryLibrarySelection.length;
      if (!count || !confirmAction(`Delete ${count} selected reusable queries?`)) return;
      state.queryLibrary = library().bulkRemove(state.queryLibrary, state.queryLibrarySelection);
      state.queryLibrarySelection = [];
      render();
      toast("Selected queries deleted.");
    }

    async function exportSelected() {
      const count = state.queryLibrarySelection.length;
      if (!count) return;
      const text = library().exportSelected(state.queryLibrary, state.queryLibrarySelection);
      const name = `signaldock-query-selection-${new Date().toISOString().slice(0, 10)}.json`;
      await saveJson(name, text);
      toast(`Exported ${count} selected queries.`);
    }

    function renameFolder() {
      if (!el.queryLibraryManageFolder || !el.queryLibraryRenameFolder) return;
      const from = el.queryLibraryManageFolder.value || "General";
      const to = el.queryLibraryRenameFolder.value.trim();
      if (!to) {
        toast("Enter a new folder name.", "error");
        return;
      }
      state.queryLibrary = library().renameFolder(state.queryLibrary, from, to);
      state.queryLibraryFolderFilter = to;
      el.queryLibraryRenameFolder.value = "";
      render();
      toast(`Renamed query folder “${from}” to “${to}”.`);
    }

    function moveFolderToGeneral() {
      if (!el.queryLibraryManageFolder) return;
      const folder = el.queryLibraryManageFolder.value || "General";
      if (folder === "General") {
        toast("General is the fallback folder.");
        return;
      }
      state.queryLibrary = library().deleteFolder(state.queryLibrary, folder, "General");
      state.queryLibraryFolderFilter = "*";
      render();
      toast(`Moved queries from “${folder}” to General.`);
    }

    async function exportAll() {
      const name = `signaldock-query-library-${new Date().toISOString().slice(0, 10)}.json`;
      await saveJson(name, library().exportJson(state.queryLibrary));
      toast("Query library exported.");
    }

    async function importAll(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        state.queryLibrary = library().importJson(await file.text(), state.queryLibrary);
        render();
        toast(`Imported ${state.queryLibrary.length.toLocaleString()} query library item${state.queryLibrary.length === 1 ? "" : "s"}.`);
      } catch (error) {
        toast(`Could not import query library: ${error.message || error}`, "error", 6500);
      } finally {
        event.target.value = "";
      }
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(el.closeQueryLibraryButton, "click", close);
      listen(el.queryLibrarySaveButton, "click", saveCurrent);
      listen(el.queryLibraryExportButton, "click", exportAll);
      listen(el.queryLibraryImportButton, "click", () => el.queryLibraryFileInput?.click());
      listen(el.queryLibraryFileInput, "change", importAll);
      listen(el.queryLibraryList, "click", onListClick);
      listen(el.queryLibraryList, "change", onListChange);
      listen(el.queryLibrarySearch, "input", () => { state.queryLibrarySearch = el.queryLibrarySearch.value || ""; render(); });
      listen(el.queryLibraryFolderFilter, "change", () => { state.queryLibraryFolderFilter = el.queryLibraryFolderFilter.value || "*"; render(); });
      listen(el.queryLibraryRenameFolderButton, "click", renameFolder);
      listen(el.queryLibraryDeleteFolderButton, "click", moveFolderToGeneral);
      listen(el.queryLibraryBulkSelectVisible, "click", selectVisible);
      listen(el.queryLibraryBulkFavorite, "click", () => bulkUpdate({ favorite: true }, "Selected queries favorited."));
      listen(el.queryLibraryBulkUnfavorite, "click", () => bulkUpdate({ favorite: false }, "Selected queries unfavorited."));
      listen(el.queryLibraryBulkMove, "click", moveSelected);
      listen(el.queryLibraryBulkExport, "click", exportSelected);
      listen(el.queryLibraryBulkDelete, "click", deleteSelected);
      listen(el.queryLibraryBulkClear, "click", () => { state.queryLibrarySelection = []; render(); });
    }

    function destroy() {
      for (const [node, type, handler] of listeners.splice(0)) node.removeEventListener(type, handler);
      bound = false;
    }

    return Object.freeze({ VERSION, bind, destroy, open, close, render });
  }

  root.SignalDockQueryLibraryController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
''')

html = index_path.read_text()
html = replace_exact(
    html,
    '  <script src="src/ui/ui-hardening.js" defer></script>\n  <script src="app.js" defer></script>',
    '  <script src="src/ui/ui-hardening.js" defer></script>\n  <script src="src/app/query-library-controller.js" defer></script>\n  <script src="app.js" defer></script>',
    'query controller script tag'
)
index_path.write_text(html)

version_path.write_text('2.8.0\n')

readme = readme_path.read_text()
readme = replace_exact(readme, 'Current version: **2.7.4**.', 'Current version: **2.8.0**.', 'README current version')
needle = '- Baseline History UI with bounded local aggregate snapshots, active-project association, import/export and baseline-to-baseline comparison\n'
readme = replace_exact(readme, needle, needle + '- Query Library UI/controller isolated under `src/app/` with explicit state/callback boundaries and no bundler dependency\n', 'README controller highlight')
readme_path.write_text(readme)

changelog = changelog_path.read_text()
entry = '''\n## 2.8.0 — 2026-09-16\n\n### Application controller architecture\n- Added `src/app/` for feature-level application controllers while preserving the zero-build static runtime.\n- Extracted Query Library rendering, event wiring, import/export, folder management and bulk actions from the root `app.js` into `src/app/query-library-controller.js`.\n- The root application now provides an explicit state/element/callback boundary instead of allowing Query Library code to reach across unrelated workspace implementation details.\n- Added idempotent controller binding and teardown support so event ownership is explicit and duplicate listeners are prevented.\n\n### Query Library quality\n- Replaced repeated per-folder visible-count scans with one bounded counting pass before rendering folder headings.\n- Added an explicit accessible name to per-query folder movement controls and preserved all existing local-only storage/export semantics.\n- Added controller architecture regression coverage that rejects reintroduction of Query Library implementation code into the root application entrypoint.\n\n'''
changelog = replace_exact(changelog, '# Changelog\n', '# Changelog\n' + entry, 'changelog heading')
changelog_path.write_text(changelog)

source_layout = source_layout_path.read_text()
source_layout = replace_exact(
    source_layout,
    '| `src/core/` | parsers, queries, indexes, workspace state, persistence and local utility primitives |\n',
    '| `src/app/` | feature-level application controllers that coordinate state, UI and domain modules |\n| `src/core/` | parsers, queries, indexes, workspace state, persistence and local utility primitives |\n',
    'source layout app row'
)
source_layout = replace_exact(
    source_layout,
    'No bundler or package-install step is introduced by this layout.\n',
    'Feature controllers under `src/app/` must receive their state, element registry and cross-feature actions through an explicit factory boundary; they should not create hidden global application state.\n\nNo bundler or package-install step is introduced by this layout.\n',
    'source layout controller rule'
)
source_layout_path.write_text(source_layout)

src_readme = src_readme_path.read_text()
src_readme = replace_exact(
    src_readme,
    '- `core/` — parsing, query/search, workspace, persistence and local performance primitives.\n',
    '- `app/` — feature-level controllers that coordinate UI, state and domain modules through explicit factory boundaries.\n- `core/` — parsing, query/search, workspace, persistence and local performance primitives.\n',
    'src README app row'
)
src_readme_path.write_text(src_readme)

technical = technical_path.read_text()
architecture_note = '''\n## Application controller boundary\n\nThe root `app.js` remains the public workspace entrypoint, but feature-owned UI behavior is progressively moving into zero-build controllers under `src/app/`. Controllers receive the shared state object, element registry and the narrow cross-feature actions they need through a factory call; they do not own a second application state or introduce a framework/bundler dependency.\n\n`query-library-controller.js` owns Query Library rendering, event listeners, local import/export actions, folder management and bulk selection. Its event binding is idempotent and exposes teardown for deterministic lifecycle management. Domain persistence and normalization remain in `src/core/query-library.js`, so UI coordination and Query Library data rules stay separate.\n\n'''
technical = replace_exact(technical, '# SignalDock\n', '# SignalDock\n' + architecture_note, 'technical architecture note')
technical_path.write_text(technical)

layout_test = layout_test_path.read_text()
layout_test = replace_exact(
    layout_test,
    'const expectedDirs = ["src/core", "src/analysis", "src/investigation", "src/platform", "src/ui", "src/vendor"];',
    'const expectedDirs = ["src/app", "src/core", "src/analysis", "src/investigation", "src/platform", "src/ui", "src/vendor"];',
    'source layout expected dirs'
)
layout_test = replace_exact(
    layout_test,
    'assert.ok(scripts.some((ref) => ref.startsWith("src/core/")), "core scripts are not loaded from src/core");\n',
    'assert.ok(scripts.some((ref) => ref.startsWith("src/app/")), "application controllers are not loaded from src/app");\nassert.ok(scripts.some((ref) => ref.startsWith("src/core/")), "core scripts are not loaded from src/core");\n',
    'source layout app assertion'
)
layout_test_path.write_text(layout_test)

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
const controller = read("src/app/query-library-controller.js");

assert.equal(version, "2.8.0");
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
const controllerIndex = scripts.indexOf("src/app/query-library-controller.js");
const appIndex = scripts.indexOf("app.js");
assert.ok(controllerIndex >= 0 && controllerIndex < appIndex, "query controller must load before app.js");

for (const token of [
  "SignalDockQueryLibraryController.create",
  "queryLibraryController.bind()",
  "queryLibraryController.render()",
  "saved: () => queryLibraryController?.open()"
]) assert.ok(app.includes(token), `app integration token missing: ${token}`);

for (const token of [
  "function openQueryLibrary()",
  "function renderQueryLibrary()",
  "function saveCurrentQueryToLibrary()",
  "function onQueryLibraryClick(event)",
  "el.queryLibrarySaveButton?.addEventListener"
]) assert.ok(!app.includes(token), `Query Library implementation leaked back into app.js: ${token}`);

for (const token of [
  "const VERSION = 1",
  "function create(options = {})",
  "function bind()",
  "function destroy()",
  "let bound = false",
  "const visibleByFolder = new Map()",
  'move.setAttribute("aria-label", `Move ${item.name} to folder`)'
]) assert.ok(controller.includes(token), `controller quality token missing: ${token}`);

for (const primitive of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("]) {
  assert.ok(!controller.includes(primitive), `query controller must stay local-only: ${primitive}`);
}

const sandbox = { self: {}, console };
vm.runInNewContext(controller, sandbox, { filename: "query-library-controller.js" });
assert.equal(sandbox.self.SignalDockQueryLibraryController.VERSION, 1);
assert.equal(typeof sandbox.self.SignalDockQueryLibraryController.create, "function");
assert.equal(Object.isFrozen(sandbox.self.SignalDockQueryLibraryController), true);

console.log("query-library-controller-smoke PASS");
''')

print('v2.8.0 Query Library controller migration staged')
