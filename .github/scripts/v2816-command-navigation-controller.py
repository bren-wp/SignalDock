from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def read(path): return (ROOT / path).read_text(encoding="utf-8")
def write(path, text): (ROOT / path).write_text(text, encoding="utf-8")
def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1: raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)
def replace_range(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    end = text.find(end_marker, start + len(start_marker))
    if start < 0 or end < 0 or end <= start: raise RuntimeError(f"{label}: markers missing")
    return text[:start] + replacement + text[end:]

if read("VERSION").strip() != "2.8.15": raise RuntimeError("expected VERSION 2.8.15")
app = read("app.js")
if 'const APP_VERSION = "2.8.15";' not in app: raise RuntimeError("APP_VERSION anchor missing")

nav_wrappers = '''  function setActiveNav(target) { commandNavigationController?.setActiveNav(target); }\n\n  function activateNavView(target) { commandNavigationController?.navigate(target); }\n\n'''
app = replace_range(app, "  function setActiveNav(target) {", "  document.addEventListener(\"DOMContentLoaded\", init);", nav_wrappers, "navigation block")
app = replace_once(app, "  let settingsController = null;\n", "  let settingsController = null;\n  let commandNavigationController = null;\n", "command navigation declaration")
app = replace_range(app, "  function commandDefinitions() {", "  function closeCompetingDialogs(exceptId = \"\") {", "", "command definitions block")
app = replace_range(app, "  function openCommandPalette() {", "  function openSettings() {", '''  function openCommandPalette() { commandNavigationController?.open(); }\n\n  function closeCommandPalette() { commandNavigationController?.close(); }\n\n  function renderCommandPalette() { commandNavigationController?.render(); }\n\n  function runCommand(id) { commandNavigationController?.run(id); }\n\n''', "command palette UI block")
nav_listener = '    document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => activateNavView(button.dataset.nav)));\n\n'
app = replace_once(app, nav_listener, "", "nav listener")
bind_block_start = '''    bindDialogNavReset(\n      el.settingsDialog,\n'''
bind_block_end = '''    el.traceCompareDialog?.addEventListener("close", () => { if (el.traceExplorerDialog?.open) return; setActiveNav("logs"); });\n    el.commandPaletteButton?.addEventListener("click", openCommandPalette);\n    el.closeCommandPaletteButton?.addEventListener("click", closeCommandPalette);\n    el.commandPaletteInput?.addEventListener("input", () => { state.commandPaletteIndex = 0; renderCommandPalette(); });\n    el.commandPaletteList?.addEventListener("click", (event) => { const button = event.target.closest("[data-command-id]"); if (button) runCommand(button.dataset.commandId); });\n'''
bs = app.find(bind_block_start); be = app.find(bind_block_end, bs)
if bs < 0 or be < 0: raise RuntimeError("dialog/palette listener block missing")
be += len(bind_block_end)
app = app[:bs] + app[be:]
keydown_start = '''      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {\n        event.preventDefault();\n        if (el.commandPaletteDialog?.open) closeCommandPalette(); else openCommandPalette();\n        return;\n      }\n      if (el.commandPaletteDialog?.open) {\n        if (event.key === "Escape") { event.preventDefault(); closeCommandPalette(); return; }\n        if (event.key === "ArrowDown" || event.key === "ArrowUp") {\n          event.preventDefault();\n          const commands = filteredCommands();\n          if (commands.length) state.commandPaletteIndex = (state.commandPaletteIndex + (event.key === "ArrowDown" ? 1 : -1) + commands.length) % commands.length;\n          renderCommandPalette();\n          return;\n        }\n        if (event.key === "Enter") {\n          const commands = filteredCommands();\n          if (commands[state.commandPaletteIndex]) { event.preventDefault(); runCommand(commands[state.commandPaletteIndex].id); }\n          return;\n        }\n      }\n'''
app = replace_once(app, keydown_start, "", "palette keydown block")

init_anchor = '    if (!window.SignalDockInvestigationController?.create) throw new Error("SignalDock Investigation controller is unavailable.");\n'
init = '''    const navigationFeatureCallbacks = {
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
'''
app = replace_once(app, init_anchor, init + init_anchor, "command navigation init")
app = replace_once(app, 'const APP_VERSION = "2.8.15";', 'const APP_VERSION = "2.8.16";', "APP_VERSION")
write("app.js", app)
write("VERSION", "2.8.16\n")

html = read("index.html")
html = replace_once(html, '  <script src="src/app/settings-controller.js" defer></script>\n', '  <script src="src/app/settings-controller.js" defer></script>\n  <script src="src/app/command-navigation-controller.js" defer></script>\n', "command navigation script")
write("index.html", html)

source = read("tests/source-layout-smoke.mjs")
source = replace_once(source, '  "src/app/settings-controller.js",\n', '  "src/app/settings-controller.js",\n  "src/app/command-navigation-controller.js",\n', "source layout controller")
write("tests/source-layout-smoke.mjs", source)

accessibility = read("tests/accessibility-production-smoke.mjs")
accessibility = replace_once(accessibility, 'const inspectorController = read("src/app/inspector-controller.js");\n', 'const inspectorController = read("src/app/inspector-controller.js");\nconst commandNavigationController = read("src/app/command-navigation-controller.js");\n', "accessibility command controller read")
accessibility = replace_once(accessibility, "for (const token of ['function activateNavView(target)', 'function bindDialogNavReset(...dialogs)', 'el.settingsDialog,', 'aria-activedescendant']) assert.ok(app.includes(token), `missing interaction token: ${token}`);", "for (const token of ['function activateNavView(target)', 'navResetDialogs:', 'el.settingsDialog,']) assert.ok(app.includes(token), `missing interaction token: ${token}`);\nfor (const token of ['aria-activedescendant', 'listen(dialog, \"close\", () => setActiveNav(\"logs\"))']) assert.ok(commandNavigationController.includes(token), `missing command/navigation interaction token: ${token}`);", "accessibility navigation ownership")
write("tests/accessibility-production-smoke.mjs", accessibility)

production_ui = read("tests/production-ui-polish-smoke.mjs")
production_ui = replace_once(production_ui, 'const app = read("app.js");\n', 'const app = read("app.js");\nconst commandNavigationController = read("src/app/command-navigation-controller.js");\n', "production UI command controller read")
production_ui = replace_once(production_ui, 'assert.match(app, /setAttribute\\("aria-current", "page"\\)/);', 'assert.match(commandNavigationController, /setAttribute\\("aria-current", "page"\\)/);', "production UI aria-current ownership")
write("tests/production-ui-polish-smoke.mjs", production_ui)

smoke = '''import fs from "node:fs";\nimport path from "node:path";\nimport assert from "node:assert/strict";\nimport { fileURLToPath } from "node:url";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");\nconst read = (name) => fs.readFileSync(path.join(root, name), "utf8");\nconst html = read("index.html");\nconst app = read("app.js");\nconst controller = read("src/app/command-navigation-controller.js");\nassert.ok(html.includes("src/app/command-navigation-controller.js"));\nassert.ok(app.includes("SignalDockCommandNavigationController.create"));\nassert.ok(app.includes("commandNavigationController.bind()"));\nassert.ok(app.includes("function activateNavView(target) { commandNavigationController?.navigate(target); }"));\nassert.ok(app.includes("const navigationFeatureCallbacks = {"));\nassert.ok(!app.includes("function commandDefinitions()"));\nassert.ok(!app.includes('document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener'));\nfor (const token of ["setActiveNav", "navigate", "definitions", "filteredCommands", "handleKeydown", "aria-activedescendant", "data-command-id", "bind", "destroy"]) assert.ok(controller.includes(token), `missing command-navigation token: ${token}`);\nfor (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", ".invoke(", "showOpenFilePicker", "SignalDockDesktopBridge"]) assert.ok(!controller.includes(forbidden), `forbidden command-navigation capability: ${forbidden}`);\nconsole.log("command-navigation-controller-smoke PASS");\n'''
write("tests/command-navigation-controller-smoke.mjs", smoke)

readme = read("README.md").replace("2.8.15", "2.8.16")
write("README.md", readme)
technical = read("docs/TECHNICAL.md").replace("Current version: **2.8.15**.", "Current version: **2.8.16**.")
anchor = "`settings-controller.js` owns Settings form synchronization, preference persistence and saved custom-parser profile UI. Parser execution remains in the root application and `src/core/parser-profiles.js`; recovery, worker and filesystem capabilities are not exposed to the Settings controller.\n\n"
technical = replace_once(technical, anchor, anchor + "`command-navigation-controller.js` owns workspace navigation state, Command Palette definitions/rendering, keyboard interaction and dialog-to-navigation reset behavior. Feature execution stays behind injected root callbacks, so the controller receives no parser, worker, network, storage or filesystem capability.\n\n", "technical command paragraph")
write("docs/TECHNICAL.md", technical)
layout = read("docs/SOURCE-LAYOUT.md").replace("`settings-controller.js`, `investigation-controller.js`", "`settings-controller.js`, `command-navigation-controller.js`, `investigation-controller.js`")
write("docs/SOURCE-LAYOUT.md", layout)
src = read("src/README.md")
anchor2 = "`app/settings-controller.js` owns Settings UI synchronization, local preference persistence and saved parser-profile management while parser execution remains outside the controller.\n\n"
src = replace_once(src, anchor2, anchor2 + "`app/command-navigation-controller.js` owns workspace navigation, Command Palette UI/keyboard behavior and navigation reset listeners while feature actions remain root-injected callbacks.\n\n", "src command paragraph")
write("src/README.md", src)

changelog = read("CHANGELOG.md")
entry = '''## 2.8.16 — 2026-09-16\n\n### Command Palette and navigation boundary\n- Extracted workspace navigation state, `[data-nav]` event ownership, Command Palette definitions/rendering and keyboard interaction into `src/app/command-navigation-controller.js`.\n- Centralized dialog-close navigation reset handling, including the Trace Compare/Trace Explorer exception, behind idempotent controller listeners.\n- Kept all feature execution behind an explicit root callback map; the controller has no parser, worker, storage, native bridge or filesystem capability.\n\n### Maintainability and verification\n- Removed Command Palette command definitions, rendering implementation and palette-specific key handling from the root application while preserving explicit feature dependency wiring.\n- Added isolated command/navigation controller coverage and permanent HTTP smoke coverage while preserving Ctrl/Cmd+K, Arrow, Enter and Escape behavior.\n\n'''
changelog = replace_once(changelog, "# Changelog\n\n", "# Changelog\n\n" + entry, "changelog")
write("CHANGELOG.md", changelog)
print("v2.8.16 command/navigation controller migration staged")
