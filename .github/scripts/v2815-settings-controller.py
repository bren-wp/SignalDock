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

if read("VERSION").strip() != "2.8.14": raise RuntimeError("expected VERSION 2.8.14")
app = read("app.js")
if 'const APP_VERSION = "2.8.14";' not in app: raise RuntimeError("APP_VERSION anchor missing")

parser_wrappers = '''  function refreshSavedParserProfiles(selectedId = "") { settingsController?.refreshSavedParserProfiles(selectedId); }\n\n  function applySavedParserProfile() { settingsController?.applySavedParserProfile?.(); }\n\n  function saveParserProfileFromForm() { settingsController?.saveParserProfileFromForm?.(); }\n\n  function deleteSelectedParserProfile() { settingsController?.deleteSelectedParserProfile?.(); }\n\n  function exportParserProfiles() { settingsController?.exportParserProfiles?.(); }\n\n  async function importParserProfiles(event) { await settingsController?.importParserProfiles?.(event); }\n\n'''
app = replace_range(app, "  function refreshSavedParserProfiles(selectedId = \"\") {", "  function commandDefinitions() {", parser_wrappers, "parser profile block")

settings_wrappers = '''  function openSettings() { settingsController?.open(); }\n\n  function persistSettingsFromForm() { settingsController?.persistFromForm(); }\n\n  function applySettings() { settingsController?.apply(); }\n\n'''
app = replace_range(app, "  function openSettings() {", "  function currentCustomParserProfile() {", settings_wrappers, "settings block")
app = replace_range(app, "  function updateCustomParserVisibility() {", "  function currentViewState() {", "  function updateCustomParserVisibility() { settingsController?.updateCustomParserVisibility(); }\n\n", "custom parser visibility")

listener_start = '    [el.wrapToggle, el.compactToggle, el.unknownToggle, el.workerToggle, el.autosaveToggle, el.parserProfile, el.customParserPattern, el.customParserFlags].forEach((control) => {\n'
listener_end = '    el.parserProfilesFileInput?.addEventListener("change", importParserProfiles);\n'
ls = app.find(listener_start); le = app.find(listener_end, ls)
if ls < 0 or le < 0: raise RuntimeError("settings listener block missing")
le += len(listener_end)
app = app[:ls] + app[le:]

app = replace_once(app, "  let inspectorController = null;\n", "  let inspectorController = null;\n  let settingsController = null;\n", "settings controller declaration")
init_anchor = '    if (!window.SignalDockInvestigationController?.create) throw new Error("SignalDock Investigation controller is unavailable.");\n'
init = '''    if (!window.SignalDockSettingsController?.create) throw new Error("SignalDock Settings controller is unavailable.");
    settingsController = window.SignalDockSettingsController.create({
      state,
      el,
      storageKey: STORAGE_SETTINGS,
      getUtils: utils,
      getParserProfiles: parserProfiles,
      toast,
      applyFilters,
      markDatasetForAutosave,
      updateAutosaveStatus,
      updateDiagnostics,
      closeCompetingDialogs,
      showDialogSafely,
      scheduleViewAutosave: () => scheduleViewAutosave()
    });
    settingsController.bind();
'''
app = replace_once(app, init_anchor, init + init_anchor, "settings controller init")
app = replace_once(app, 'const APP_VERSION = "2.8.14";', 'const APP_VERSION = "2.8.15";', "APP_VERSION")
write("app.js", app)
write("VERSION", "2.8.15\n")

html = read("index.html")
html = replace_once(html, '  <script src="src/app/inspector-controller.js" defer></script>\n', '  <script src="src/app/inspector-controller.js" defer></script>\n  <script src="src/app/settings-controller.js" defer></script>\n', "settings script load")
write("index.html", html)

source = read("tests/source-layout-smoke.mjs")
source = replace_once(source, '  "src/app/inspector-controller.js",\n', '  "src/app/inspector-controller.js",\n  "src/app/settings-controller.js",\n', "source layout controller")
write("tests/source-layout-smoke.mjs", source)

smoke = '''import fs from "node:fs";\nimport path from "node:path";\nimport assert from "node:assert/strict";\nimport { fileURLToPath } from "node:url";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");\nconst read = (name) => fs.readFileSync(path.join(root, name), "utf8");\nconst html = read("index.html");\nconst app = read("app.js");\nconst controller = read("src/app/settings-controller.js");\nassert.ok(html.includes("src/app/settings-controller.js"));\nassert.ok(app.includes("SignalDockSettingsController.create"));\nassert.ok(app.includes("settingsController.bind()"));\nassert.ok(app.includes("function currentCustomParserProfile()"), "parser execution profile must remain in root app");\nfor (const token of ["persistFromForm", "refreshSavedParserProfiles", "applySavedParserProfile", "saveParserProfileFromForm", "deleteSelectedParserProfile", "exportParserProfiles", "importParserProfiles", "updateCustomParserVisibility", "bind", "destroy"]) assert.ok(controller.includes(token), `missing settings token: ${token}`);\nfor (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", ".invoke(", "showOpenFilePicker", "SignalDockDesktopBridge"]) assert.ok(!controller.includes(forbidden), `forbidden settings capability: ${forbidden}`);\nassert.ok(!app.includes("el.savedParserProfile?.addEventListener(\\\"change\\\", applySavedParserProfile)"));\nconsole.log("settings-controller-smoke PASS");\n'''
write("tests/settings-controller-smoke.mjs", smoke)

readme = read("README.md").replace("2.8.14", "2.8.15")
write("README.md", readme)
technical = read("docs/TECHNICAL.md").replace("Current version: **2.8.14**.", "Current version: **2.8.15**.")
anchor = "`inspector-controller.js` owns the selected-log Inspector UI, Details/Context/Correlations/Trace/Raw/JSON tab rendering, representative context navigation and inspector-local filter actions. Worker request/response orchestration remains in `app.js` through narrow callbacks, while trace analysis stays in the existing `src/analysis/` modules.\n\n"
technical = replace_once(technical, anchor, anchor + "`settings-controller.js` owns Settings form synchronization, preference persistence and saved custom-parser profile UI. Parser execution remains in the root application and `src/core/parser-profiles.js`; recovery, worker and filesystem capabilities are not exposed to the Settings controller.\n\n", "technical settings paragraph")
write("docs/TECHNICAL.md", technical)
layout = read("docs/SOURCE-LAYOUT.md").replace("`inspector-controller.js`, `investigation-controller.js`", "`inspector-controller.js`, `settings-controller.js`, `investigation-controller.js`")
write("docs/SOURCE-LAYOUT.md", layout)
src = read("src/README.md")
anchor2 = "`app/inspector-controller.js` owns selected-log Inspector rendering, tabs, context/correlation/trace surfaces and Inspector-local actions while worker orchestration remains in the root application.\n\n"
src = replace_once(src, anchor2, anchor2 + "`app/settings-controller.js` owns Settings UI synchronization, local preference persistence and saved parser-profile management while parser execution remains outside the controller.\n\n", "src settings paragraph")
write("src/README.md", src)

changelog = read("CHANGELOG.md")
entry = '''## 2.8.15 — 2026-09-16\n\n### Settings application boundary\n- Extracted Settings form synchronization, local preference persistence and saved custom-parser profile CRUD/import/export into `src/app/settings-controller.js`.\n- Kept the active custom parser execution descriptor in `app.js` so parsing and worker execution boundaries remain unchanged.\n- Replaced implicit global `Option` construction with document-owned option elements for saved parser profiles.\n- Moved Settings and parser-profile event ownership to idempotent `bind()` / `destroy()` lifecycle methods.\n\n### Maintainability and verification\n- Reduced root application UI glue while preserving the existing local-only settings storage key and parser-profile domain module.\n- Added isolated Settings controller coverage and permanent HTTP smoke coverage without introducing network, native bridge or filesystem capabilities.\n\n'''
changelog = replace_once(changelog, "# Changelog\n\n", "# Changelog\n\n" + entry, "changelog")
write("CHANGELOG.md", changelog)
print("v2.8.15 Settings controller migration staged")
