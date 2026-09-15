from pathlib import Path
import re


def replace_exact(text, old, new, label, expected=1):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


root = Path('.')

# Version.
Path('VERSION').write_text('2.7.3\n')

# Static UI accessibility and production semantics.
index_path = Path('index.html')
html = index_path.read_text()
html = replace_exact(html, 'title="Clear all logs" disabled', 'title="Clear all logs" aria-label="Clear all logs" disabled', 'clear all label')
html = replace_exact(html, 'title="Reset filters" disabled', 'title="Reset filters" aria-label="Reset filters" disabled', 'reset filters label')

def hide_decorative_icon(match):
    tag = match.group(0)
    if 'aria-hidden=' in tag or 'role=' in tag:
        return tag
    return tag[:-1] + ' aria-hidden="true">'

html = re.sub(r'<svg class="icon[^"]*"[^>]*>', hide_decorative_icon, html)

inspector_tabs = {
    'details': ('inspectorTabDetails', 'detailsPane', True),
    'context': ('inspectorTabContext', 'contextPane', False),
    'correlations': ('inspectorTabCorrelations', 'correlationsPane', False),
    'trace': ('inspectorTabTrace', 'tracePane', False),
    'raw': ('inspectorTabRaw', 'rawPane', False),
    'json': ('inspectorTabJson', 'jsonPane', False),
}
for name, (tab_id, pane_id, active) in inspector_tabs.items():
    old = f'<button class="inspector-tab{" is-active" if active else ""}" type="button" role="tab" aria-selected="{"true" if active else "false"}" data-inspector-tab="{name}">'
    new = f'<button class="inspector-tab{" is-active" if active else ""}" id="{tab_id}" type="button" role="tab" aria-selected="{"true" if active else "false"}" aria-controls="{pane_id}" tabindex="{0 if active else -1}" data-inspector-tab="{name}">'
    html = replace_exact(html, old, new, f'inspector tab {name}')

pane_specs = {
    'detailsPane': ('div', 'inspectorTabDetails', False, ''),
    'contextPane': ('div', 'inspectorTabContext', True, ''),
    'correlationsPane': ('div', 'inspectorTabCorrelations', True, ''),
    'tracePane': ('div', 'inspectorTabTrace', True, ''),
    'rawPane': ('pre', 'inspectorTabRaw', True, ' inspector-code'),
    'jsonPane': ('pre', 'inspectorTabJson', True, ' inspector-code'),
}
for pane_id, (tag, labelled_by, hidden, extra_class) in pane_specs.items():
    classes = f'inspector-pane{extra_class}'
    old = f'<{tag} class="{classes}" role="tabpanel" id="{pane_id}"{" hidden" if hidden else ""}></{tag}>'
    new = f'<{tag} class="{classes}" role="tabpanel" id="{pane_id}" aria-labelledby="{labelled_by}" tabindex="0"{" hidden" if hidden else ""}></{tag}>'
    html = replace_exact(html, old, new, f'inspector pane {pane_id}')

html = replace_exact(
    html,
    '<input id="commandPaletteInput" type="search" placeholder="Type a command…" autocomplete="off">',
    '<input id="commandPaletteInput" type="search" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="commandPaletteList" aria-expanded="false" placeholder="Type a command…" autocomplete="off">',
    'command palette combobox semantics',
)
index_path.write_text(html)

# Main UI controller: patch version, deduplicate navigation routing, improve keyboard semantics.
app_path = Path('app.js')
app = app_path.read_text()
app = replace_exact(app, '  const APP_VERSION = "2.7.2";', '  const APP_VERSION = "2.7.3";', 'app version')

nav_anchor = '''  function setActiveNav(target) {
    document.querySelectorAll("[data-nav]").forEach((item) => {
      const active = item.dataset.nav === target;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }
'''
nav_helpers = nav_anchor + '''
  function activateNavView(target) {
    setActiveNav(target);
    const action = {
      search: () => el.queryInput?.focus(),
      map: openServiceMap,
      matrix: openServiceMatrix,
      heatmap: openServiceHeatmap,
      trends: openServiceTrends,
      baseline: openBaseline,
      traces: openTraceExplorer,
      outliers: openTraceOutliers,
      health: openHealth,
      investigation: openInvestigation,
      exceptions: openExceptions,
      projects: openProjects,
      settings: openSettings,
      live: startLiveTail,
      saved: openQueryLibrary
    }[target];
    action?.();
  }

  function bindDialogNavReset(...dialogs) {
    dialogs.filter(Boolean).forEach((dialog) => dialog.addEventListener("close", () => setActiveNav("logs")));
  }
'''
app = replace_exact(app, nav_anchor, nav_helpers, 'navigation helpers')

old_nav_click = '''    document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => {
      const target = button.dataset.nav;
      setActiveNav(target);
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
'''
new_nav_click = '''    document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => activateNavView(button.dataset.nav)));
'''
app = replace_exact(app, old_nav_click, new_nav_click, 'navigation click dispatch')

old_inspector_bind = '''    document.querySelectorAll("[data-inspector-tab]").forEach((button) => button.addEventListener("click", () => {
      state.inspectorTab = button.dataset.inspectorTab;
      renderInspectorTab();
      scheduleViewAutosave();
    }));
'''
new_inspector_bind = '''    document.querySelectorAll("[data-inspector-tab]").forEach((button) => {
      button.addEventListener("click", () => selectInspectorTab(button.dataset.inspectorTab));
      button.addEventListener("keydown", onInspectorTabKeydown);
    });
'''
app = replace_exact(app, old_inspector_bind, new_inspector_bind, 'inspector tab binding')

old_dialog_resets = '''    el.serviceMapDialog?.addEventListener("close", () => {
      setActiveNav("logs");
    });
    el.healthDialog?.addEventListener("close", () => {
      setActiveNav("logs");
    });
    el.serviceMatrixDialog?.addEventListener("close", () => { setActiveNav("logs"); });
    el.serviceHeatmapDialog?.addEventListener("close", () => { setActiveNav("logs"); });
    el.serviceTrendsDialog?.addEventListener("close", () => { setActiveNav("logs"); });
    el.baselineDialog?.addEventListener("close", () => { setActiveNav("logs"); });
    el.projectDialog?.addEventListener("close", () => { setActiveNav("logs"); });
    el.traceExplorerDialog?.addEventListener("close", () => { setActiveNav("logs"); });
    el.traceCompareDialog?.addEventListener("close", () => { if (el.traceExplorerDialog?.open) return; setActiveNav("logs"); });
    el.traceOutlierDialog?.addEventListener("close", () => { setActiveNav("logs"); });
    el.queryLibraryDialog?.addEventListener("close", () => { setActiveNav("logs"); });
    el.investigationDialog?.addEventListener("close", () => {
      setActiveNav("logs");
    });
    el.exceptionDialog?.addEventListener("close", () => {
      setActiveNav("logs");
    });
'''
new_dialog_resets = '''    bindDialogNavReset(
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
'''
app = replace_exact(app, old_dialog_resets, new_dialog_resets, 'dialog nav reset wiring')

render_anchor = '''  function renderInspectorTab() {
    document.querySelectorAll("[data-inspector-tab]").forEach((button) => {
      const active = button.dataset.inspectorTab === state.inspectorTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
'''
render_replacement = '''  function selectInspectorTab(tab, focus = false) {
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
'''
app = replace_exact(app, render_anchor, render_replacement, 'inspector roving tab model')

# Command palette combobox state and active-descendant semantics.
app = replace_exact(
    app,
    '    el.commandPaletteInput.value = "";\n    renderCommandPalette();',
    '    el.commandPaletteInput.value = "";\n    el.commandPaletteInput.setAttribute("aria-expanded", "true");\n    renderCommandPalette();',
    'command palette open state',
)
app = replace_exact(
    app,
    '''  function closeCommandPalette() {
    if (!el.commandPaletteDialog) return;
    if (typeof el.commandPaletteDialog.close === "function" && el.commandPaletteDialog.open) el.commandPaletteDialog.close();
    else el.commandPaletteDialog.removeAttribute("open");
  }
''',
    '''  function closeCommandPalette() {
    if (!el.commandPaletteDialog) return;
    el.commandPaletteInput?.setAttribute("aria-expanded", "false");
    el.commandPaletteInput?.removeAttribute("aria-activedescendant");
    if (typeof el.commandPaletteDialog.close === "function" && el.commandPaletteDialog.open) el.commandPaletteDialog.close();
    else el.commandPaletteDialog.removeAttribute("open");
  }
''',
    'command palette close state',
)
app = replace_exact(
    app,
    '      const empty = document.createElement("p"); empty.className = "command-empty"; empty.textContent = "No matching commands."; el.commandPaletteList.appendChild(empty); return;',
    '      el.commandPaletteInput?.removeAttribute("aria-activedescendant"); const empty = document.createElement("p"); empty.className = "command-empty"; empty.textContent = "No matching commands."; el.commandPaletteList.appendChild(empty); return;',
    'command palette empty active descendant',
)
app = replace_exact(
    app,
    '      const button = document.createElement("button"); button.type = "button"; button.className = `command-item${index === state.commandPaletteIndex ? " is-active" : ""}`; button.dataset.commandId = command.id; button.setAttribute("role", "option"); button.setAttribute("aria-selected", index === state.commandPaletteIndex ? "true" : "false"); button.disabled = Boolean(command.disabled);',
    '      const button = document.createElement("button"); button.type = "button"; button.id = `commandPaletteOption-${index}`; button.className = `command-item${index === state.commandPaletteIndex ? " is-active" : ""}`; button.dataset.commandId = command.id; button.setAttribute("role", "option"); button.setAttribute("aria-selected", index === state.commandPaletteIndex ? "true" : "false"); button.disabled = Boolean(command.disabled);',
    'command palette option ids',
)
app = replace_exact(
    app,
    '    el.commandPaletteList.querySelector(".is-active")?.scrollIntoView?.({ block: "nearest" });',
    '    const activeOption = el.commandPaletteList.querySelector(".is-active"); if (activeOption) el.commandPaletteInput?.setAttribute("aria-activedescendant", activeOption.id); else el.commandPaletteInput?.removeAttribute("aria-activedescendant");\n    activeOption?.scrollIntoView?.({ block: "nearest" });',
    'command palette active descendant',
)

# Dynamic decorative icon semantics and accessible delete action.
app = replace_exact(
    app,
    '      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); icon.setAttribute("class", "icon");',
    '      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); icon.setAttribute("class", "icon"); icon.setAttribute("aria-hidden", "true");',
    'saved view icon semantics',
)
app = replace_exact(
    app,
    '      remove.title = `Delete ${view.name}`;',
    '      remove.title = `Delete ${view.name}`;\n      remove.setAttribute("aria-label", `Delete saved view ${view.name}`);',
    'saved view remove label',
)
app = replace_exact(
    app,
    '      const x = document.createElementNS("http://www.w3.org/2000/svg", "svg"); x.setAttribute("class", "icon");',
    '      const x = document.createElementNS("http://www.w3.org/2000/svg", "svg"); x.setAttribute("class", "icon"); x.setAttribute("aria-hidden", "true");',
    'saved view remove icon semantics',
)

app = replace_exact(app, '\n\nasync function saveWorkspace() {', '\n\n  async function saveWorkspace() {', 'workspace function indentation')
app = app.replace('Live tail requires a browser with the File System Access API (Chromium-based browsers).', 'Live tail is not available in this browser. You can still import updated files manually.')
app = app.replace('toast("Local diagnostics copied.");', 'toast("Support details copied.");')
app = app.replace('toast("Could not copy diagnostics.", "error");', 'toast("Could not copy support details.", "error");')

# Keep nav state consistent when commands open workspace views.
command_routes = {
    'run: openServiceMap': 'run: () => activateNavView("map")',
    'run: openServiceMatrix': 'run: () => activateNavView("matrix")',
    'run: openServiceHeatmap': 'run: () => activateNavView("heatmap")',
    'run: openServiceTrends': 'run: () => activateNavView("trends")',
    'run: openBaseline': 'run: () => activateNavView("baseline")',
    'run: openProjects': 'run: () => activateNavView("projects")',
    'run: openTraceExplorer': 'run: () => activateNavView("traces")',
    'run: openTraceOutliers': 'run: () => activateNavView("outliers")',
    'run: openQueryLibrary': 'run: () => activateNavView("saved")',
    'run: openHealth': 'run: () => activateNavView("health")',
    'run: openInvestigation': 'run: () => activateNavView("investigation")',
    'run: openExceptions': 'run: () => activateNavView("exceptions")',
    'run: startLiveTail': 'run: () => activateNavView("live")',
    'run: openSettings': 'run: () => activateNavView("settings")',
}
for old, new in command_routes.items():
    if old not in app:
        raise SystemExit(f'command route missing: {old}')
    app = app.replace(old, new, 1)

app_path.write_text(app)

# Dialog accessibility hardening.
ui_path = Path('src/ui/ui-hardening.js')
ui = ui_path.read_text()
ui = replace_exact(
    ui,
    '      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");',
    '      .filter((element) => !element.hidden && !element.closest(\'[hidden], [aria-hidden="true"]\'));',
    'focusable hidden ancestor filter',
)
ui = replace_exact(
    ui,
    '''    doc.addEventListener("pointerdown", (event) => {
      const trigger = event.target.closest?.("button, a, [role='button']");
      if (trigger) state.lastTrigger = trigger;
      doc.documentElement.dataset.inputModality = "pointer";
    }, true);

    doc.addEventListener("keydown", (event) => {
      doc.documentElement.dataset.inputModality = "keyboard";
      const dialog = topDialog();
      if (dialog) trapTab(event, dialog);
    }, true);
''',
    '''    doc.addEventListener("pointerdown", () => {
      doc.documentElement.dataset.inputModality = "pointer";
    }, true);

    doc.addEventListener("click", (event) => {
      const trigger = event.target.closest?.("button, a, [role='button']");
      if (trigger) state.lastTrigger = trigger;
    }, true);

    doc.addEventListener("keydown", (event) => {
      doc.documentElement.dataset.inputModality = "keyboard";
      const dialog = topDialog();
      if (dialog && event.key === "Escape" && typeof dialog.close !== "function") {
        event.preventDefault();
        dialog.removeAttribute("open");
        return;
      }
      if (dialog) trapTab(event, dialog);
    }, true);
''',
    'keyboard dialog trigger and fallback escape',
)
ui_path.write_text(ui)

# Query Library compatibility aliases retained for downstream consumers.
query_path = Path('src/core/query-library.js')
query = query_path.read_text()
query = replace_exact(
    query,
    'const SCHEMA = "signaldock.query-library", VERSION = 3, LEGACY_VERSIONS = [1, 2], STORAGE_KEY = "signaldock-query-library-v3", LEGACY_STORAGE_KEYS = ["signaldock-query-library-v2", "signaldock-query-library-v1"], MAX_ITEMS = 500;',
    'const SCHEMA = "signaldock.query-library", VERSION = 3, LEGACY_VERSION = 1, LEGACY_VERSIONS = [1, 2], STORAGE_KEY = "signaldock-query-library-v3", LEGACY_STORAGE_KEY = "signaldock-query-library-v1", LEGACY_STORAGE_KEYS = ["signaldock-query-library-v2", LEGACY_STORAGE_KEY], MAX_ITEMS = 500;',
    'query library compatibility constants',
)
query = replace_exact(
    query,
    'root.SignalDockQueryLibrary = { SCHEMA, VERSION, LEGACY_VERSIONS, STORAGE_KEY, LEGACY_STORAGE_KEYS, MAX_ITEMS, normalize, load, save, upsert, remove, toggleFavorite, moveToFolder, markUsed, duplicate, bulkUpdate, bulkRemove, folders, search, renameFolder, deleteFolder, exportJson, exportSelected, importJson };',
    'root.SignalDockQueryLibrary = { SCHEMA, VERSION, LEGACY_VERSION, LEGACY_VERSIONS, STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_STORAGE_KEYS, MAX_ITEMS, normalize, load, save, upsert, remove, toggleFavorite, moveToFolder, markUsed, duplicate, bulkUpdate, bulkRemove, folders, search, renameFolder, deleteFolder, exportJson, exportSelected, importJson };',
    'query library compatibility exports',
)
query_path.write_text(query)

# Version-independent v2.7 feature gates.
for test_name in ['tests/v27-final-gate.mjs', 'tests/v27-project-reopen-smoke.mjs', 'tests/production-ui-polish-smoke.mjs']:
    path = Path(test_name)
    text = path.read_text()
    text = text.replace('assert.equal(version, \'2.7.2\');', "assert.match(version, /^2\\.7\\.\\d+$/);")
    text = text.replace('assert.equal(version, "2.7.2");', 'assert.match(version, /^2\\.7\\.\\d+$/);')
    text = text.replace("assert.match(app, /APP_VERSION\\s*=\\s*[\"']2\\.7\\.2[\"']/);", "assert.ok(new RegExp(`APP_VERSION\\\\s*=\\\\s*[\\\"']${version.replace(/\\./g, '\\\\.') }[\\\"']`).test(app));")
    text = text.replace('assert.ok(technical.includes("Current version: **2.7.2**."));', 'assert.ok(technical.includes(`Current version: **${version}**.`));')
    path.write_text(text)

# Query-library smoke compatibility assertions.
ql_test_path = Path('tests/query-library-smoke.mjs')
ql_test = ql_test_path.read_text()
if 'LEGACY_STORAGE_KEY' not in ql_test:
    marker = 'const api = sandbox.SignalDockQueryLibrary;'
    insertion = marker + '\nassert.equal(api.LEGACY_VERSION, 1);\nassert.equal(api.LEGACY_STORAGE_KEY, "signaldock-query-library-v1");\nassert.ok(api.LEGACY_VERSIONS.includes(api.LEGACY_VERSION));\nassert.ok(api.LEGACY_STORAGE_KEYS.includes(api.LEGACY_STORAGE_KEY));'
    ql_test = replace_exact(ql_test, marker, insertion, 'query library compatibility test')
ql_test_path.write_text(ql_test)

# New production accessibility regression test.
a11y_test = r'''import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const html = read("index.html");
const app = read("app.js");
const hardening = read("src/ui/ui-hardening.js");
const query = read("src/core/query-library.js");
const readme = read("README.md");

assert.match(version, /^2\.7\.\d+$/);
assert.ok(html.includes('id="clearAllButton" type="button" title="Clear all logs" aria-label="Clear all logs"'));
assert.ok(html.includes('id="resetButton" type="button" title="Reset filters" aria-label="Reset filters"'));
for (const tag of html.match(/<svg class="icon[^"]*"[^>]*>/g) || []) assert.ok(tag.includes('aria-hidden="true"'), `decorative icon is exposed to accessibility tree: ${tag}`);
for (const [tab, pane] of [["Details","detailsPane"],["Context","contextPane"],["Correlations","correlationsPane"],["Trace","tracePane"],["Raw","rawPane"],["Json","jsonPane"]]) {
  assert.ok(html.includes(`id="inspectorTab${tab}"`));
  assert.ok(html.includes(`aria-controls="${pane}"`));
  assert.ok(html.includes(`id="${pane}" aria-labelledby="inspectorTab${tab}"`));
}
assert.ok(html.includes('role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="commandPaletteList" aria-expanded="false"'));
for (const token of ['function activateNavView(target)', 'function bindDialogNavReset(...dialogs)', 'el.settingsDialog,', 'function onInspectorTabKeydown(event)', 'button.tabIndex = active ? 0 : -1', 'aria-activedescendant']) assert.ok(app.includes(token), `missing interaction token: ${token}`);
assert.ok(app.includes('remove.setAttribute("aria-label", `Delete saved view ${view.name}`)'));
assert.ok(hardening.includes('doc.addEventListener("click", (event) =>'));
assert.ok(hardening.includes('element.closest(\'[hidden], [aria-hidden="true"]\')'));
assert.ok(hardening.includes('event.key === "Escape" && typeof dialog.close !== "function"'));
assert.ok(query.includes('LEGACY_VERSION = 1'));
assert.ok(query.includes('LEGACY_STORAGE_KEY = "signaldock-query-library-v1"'));
assert.ok(!readme.includes('experimental local Live Tail'));
console.log('accessibility-production-smoke PASS');
'''
Path('tests/accessibility-production-smoke.mjs').write_text(a11y_test)

# README and docs.
readme_path = Path('README.md')
readme = readme_path.read_text().replace('2.7.2', '2.7.3')
readme = readme.replace('- experimental local Live Tail through the File System Access API', '- local Live Tail in browsers that support local file-follow access')
readme_path.write_text(readme)

tech_path = Path('docs/TECHNICAL.md')
tech = tech_path.read_text().replace('Current version: **2.7.2**.', 'Current version: **2.7.3**.')
production_note = '- Inspector tabs use a roving-tab keyboard model with Arrow/Home/End navigation, command-palette combobox semantics are exposed to assistive technology, and dialog focus return works for both pointer and keyboard activation.\n'
anchor = 'The production regression suite checks for unresolved CSS custom properties, hidden phone navigation, release-stage labels in the interface and accidental reintroduction of implementation terminology.\n'
if production_note not in tech:
    tech = replace_exact(tech, anchor, anchor + '\n' + production_note, 'technical accessibility note')
tech_path.write_text(tech)

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text()
if '## 2.7.3 — 2026-09-16' in changelog:
    raise SystemExit('2.7.3 changelog already present')
release = '''\n\n## 2.7.3 — 2026-09-16\n\n### Interaction and accessibility hardening\n- Added complete accessible names for remaining icon-only static controls and hid decorative SVG icons from assistive technology.\n- Added roving Inspector tabs with Arrow, Home and End keyboard navigation plus explicit tab/panel relationships.\n- Improved Command Palette combobox semantics with expanded state and active-descendant tracking.\n- Fixed dialog focus return for keyboard-triggered opens and added a safe Escape fallback for browsers without native dialog closing.\n- Fixed Settings navigation state so closing the dialog always returns the workspace navigation to Logs.\n\n### Maintainability and compatibility\n- Consolidated navigation dispatch and repeated dialog navigation-reset wiring.\n- Restored Query Library v1 compatibility aliases alongside the newer legacy-version arrays.\n- Made v2.7 feature gates patch-version agnostic so patch releases do not require unrelated test rewrites.\n- Removed the remaining experimental-stage wording for Live Tail from the user-facing README and aligned support-detail messages with the production UI.\n'''
changelog = changelog.replace('# Changelog\n', '# Changelog\n' + release, 1)
changelog_path.write_text(changelog)

# Normalize trailing whitespace in touched text files.
for name in ['index.html', 'app.js', 'src/ui/ui-hardening.js', 'src/core/query-library.js', 'README.md', 'docs/TECHNICAL.md', 'CHANGELOG.md', 'tests/v27-final-gate.mjs', 'tests/v27-project-reopen-smoke.mjs', 'tests/production-ui-polish-smoke.mjs', 'tests/query-library-smoke.mjs', 'tests/accessibility-production-smoke.mjs']:
    path = Path(name)
    lines = path.read_text().splitlines()
    path.write_text('\n'.join(line.rstrip() for line in lines) + '\n')
