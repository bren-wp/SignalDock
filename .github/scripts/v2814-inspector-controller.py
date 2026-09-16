from pathlib import Path
import textwrap

ROOT = Path(__file__).resolve().parents[2]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


version = read("VERSION").strip()
if version != "2.8.13":
    raise RuntimeError(f"expected VERSION 2.8.13, got {version}")

app = read("app.js")
if 'const APP_VERSION = "2.8.13";' not in app:
    raise RuntimeError("app version anchor missing")
if 'let inspectorController = null;' in app:
    raise RuntimeError("Inspector controller already integrated")

start_marker = "  function selectedEntry() {"
end_marker = "  function makeUiButton("
start = app.find(start_marker)
end = app.find(end_marker, start)
if start < 0 or end < 0 or end <= start:
    raise RuntimeError("Inspector function block markers not found")
block = app[start:end]

corr_start = block.find("  function loadCorrelations(entry) {")
corr_render = block.find("  function renderCorrelationsPane(entry) {", corr_start)
trace_start = block.find("  function loadTrace(entry) {", corr_render)
trace_render = block.find("  function renderTracePane(entry) {", trace_start)
if min(corr_start, corr_render, trace_start, trace_render) < 0:
    raise RuntimeError("Inspector worker bridge markers not found")
load_correlations = block[corr_start:corr_render]
load_trace = block[trace_start:trace_render]
controller_block = block[:corr_start] + block[corr_render:trace_start] + block[trace_render:]
controller_block = controller_block.replace("loadCorrelations(entry);", "requestCorrelations(entry);")
controller_block = controller_block.replace("loadTrace(entry);", "requestTrace(entry);")
controller_block = controller_block.replace("window.", "root.")
controller_block = controller_block.replace("utils()", "getUtils()")
controller_block = controller_block.replace("traceAnalyzer()", "getTraceAnalyzer()")

# Keep worker request/response ownership in app.js; the controller owns inspector UI only.
wrappers = '''  function selectedEntry() { return inspectorController?.selectedEntry() || null; }

  function selectEntry(id) { inspectorController?.selectEntry(id); }

  function closeInspector() { inspectorController?.close(); }

  function renderInspector() { inspectorController?.render(); }

'''
wrappers += load_correlations
wrappers += '''  function renderCorrelationsPane(entry) { inspectorController?.renderCorrelations(entry); }

'''
wrappers += load_trace
wrappers += '''  function renderTracePane(entry) { inspectorController?.renderTrace(entry); }

  function formatDuration(value) {
    if (inspectorController) return inspectorController.formatDuration(value);
    const ms = Number(value);
    if (!Number.isFinite(ms)) return "—";
    if (ms < 1) return `${Math.round(ms * 1000)} µs`;
    if (ms < 1000) return `${ms < 10 ? ms.toFixed(2) : ms.toFixed(1)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  }

  function filterByCorrelation(kind, value) { inspectorController?.filterByCorrelation(kind, value); }

'''
app = app[:start] + wrappers + app[end:]

app = replace_once(
    app,
    "  let healthController = null;\n",
    "  let healthController = null;\n  let inspectorController = null;\n",
    "Inspector controller declaration",
)

init_anchor = '    if (!window.SignalDockInvestigationController?.create) throw new Error("SignalDock Investigation controller is unavailable.");\n'
inspector_init = '''    if (!window.SignalDockInspectorController?.create) throw new Error("SignalDock Inspector controller is unavailable.");
    inspectorController = window.SignalDockInspectorController.create({
      state,
      el,
      getUtils: utils,
      getTraceAnalyzer: traceAnalyzer,
      toast,
      renderTable,
      requestCorrelations: loadCorrelations,
      requestTrace: loadTrace,
      applyFilters,
      filterByServiceValue,
      quoteIfNeeded,
      scheduleViewAutosave: () => scheduleViewAutosave()
    });
    inspectorController.bind();
'''
app = replace_once(app, init_anchor, inspector_init + init_anchor, "Inspector controller initialization")

listener_start = '    el.contextPane.addEventListener("click", (event) => {\n'
listener_end = '    el.filterByServiceButton.addEventListener("click", filterBySelectedService);\n'
ls = app.find(listener_start)
le = app.find(listener_end, ls)
if ls < 0 or le < 0:
    raise RuntimeError("Inspector listener block not found")
le += len(listener_end)
app = app[:ls] + app[le:]

app = replace_once(app, 'const APP_VERSION = "2.8.13";', 'const APP_VERSION = "2.8.14";', "APP_VERSION")
write("app.js", app)
write("VERSION", "2.8.14\n")

controller_header = '''(function (root) {
  "use strict";

  const VERSION = 1;
  const INSPECTOR_TABS = Object.freeze(["details", "context", "correlations", "trace", "raw", "json"]);

  function create(options = {}) {
    const state = options.state;
    const el = options.el || {};
    const getUtils = options.getUtils || (() => root.SignalDockUtils);
    const getTraceAnalyzer = options.getTraceAnalyzer || (() => root.SignalDockTraceAnalysis);
    const toast = options.toast || (() => {});
    const renderTable = options.renderTable || (() => {});
    const requestCorrelations = options.requestCorrelations || (() => {});
    const requestTrace = options.requestTrace || (() => {});
    const applyFilters = options.applyFilters || (() => {});
    const filterByServiceValue = options.filterByServiceValue || (() => {});
    const quoteIfNeeded = options.quoteIfNeeded || ((value) => String(value || ""));
    const scheduleViewAutosave = options.scheduleViewAutosave || (() => {});
    const document = el.inspector?.ownerDocument || root.document;
    let bound = false;
    let tabButtons = [];

    if (!state || !Array.isArray(state.entries)) throw new Error("Inspector controller requires application state.");
    if (!document) throw new Error("Inspector controller requires a document context.");

'''
controller_footer = '''
    function onContextClick(event) {
      const row = event.target.closest?.("[data-context-entry-id]");
      if (row) selectEntry(row.dataset.contextEntryId);
    }

    function onCorrelationsClick(event) {
      const row = event.target.closest?.("[data-context-entry-id]");
      if (row) selectEntry(row.dataset.contextEntryId);
      const filter = event.target.closest?.("[data-correlation-filter]");
      if (filter) filterByCorrelation(filter.dataset.correlationFilter, filter.dataset.correlationValue);
    }

    function onTraceClick(event) {
      const service = event.target.closest?.("[data-trace-service]");
      if (service) {
        filterByServiceValue(service.dataset.traceService);
        return;
      }
      const row = event.target.closest?.("[data-trace-entry-id]");
      if (row) selectEntry(row.dataset.traceEntryId);
    }

    function onTabClick(event) {
      selectInspectorTab(event.currentTarget?.dataset?.inspectorTab);
    }

    function bind() {
      if (bound) return;
      bound = true;
      tabButtons = [...document.querySelectorAll("[data-inspector-tab]")];
      tabButtons.forEach((button) => {
        button.addEventListener("click", onTabClick);
        button.addEventListener("keydown", onInspectorTabKeydown);
      });
      el.contextPane?.addEventListener("click", onContextClick);
      el.correlationsPane?.addEventListener("click", onCorrelationsClick);
      el.tracePane?.addEventListener("click", onTraceClick);
      el.closeInspector?.addEventListener("click", closeInspector);
      el.copyButton?.addEventListener("click", copySelectedRaw);
      el.filterBySourceButton?.addEventListener("click", filterBySelectedSource);
      el.filterByServiceButton?.addEventListener("click", filterBySelectedService);
    }

    function destroy() {
      if (!bound) return;
      bound = false;
      tabButtons.forEach((button) => {
        button.removeEventListener("click", onTabClick);
        button.removeEventListener("keydown", onInspectorTabKeydown);
      });
      tabButtons = [];
      el.contextPane?.removeEventListener("click", onContextClick);
      el.correlationsPane?.removeEventListener("click", onCorrelationsClick);
      el.tracePane?.removeEventListener("click", onTraceClick);
      el.closeInspector?.removeEventListener("click", closeInspector);
      el.copyButton?.removeEventListener("click", copySelectedRaw);
      el.filterBySourceButton?.removeEventListener("click", filterBySelectedSource);
      el.filterByServiceButton?.removeEventListener("click", filterBySelectedService);
    }

    return Object.freeze({
      selectedEntry,
      selectEntry,
      close: closeInspector,
      render: renderInspector,
      renderCorrelations: renderCorrelationsPane,
      renderTrace: renderTracePane,
      formatDuration,
      filterByCorrelation,
      selectTab: selectInspectorTab,
      bind,
      destroy
    });
  }

  root.SignalDockInspectorController = Object.freeze({ VERSION, INSPECTOR_TABS, create });
}(typeof self !== "undefined" ? self : window));
'''
controller_source = controller_header + textwrap.indent(controller_block.strip() + "\n", "  ") + controller_footer
write("src/app/inspector-controller.js", controller_source)

html = read("index.html")
html = replace_once(
    html,
    '  <script src="src/app/project-controller.js" defer></script>\n',
    '  <script src="src/app/project-controller.js" defer></script>\n  <script src="src/app/inspector-controller.js" defer></script>\n',
    "Inspector script load",
)
write("index.html", html)

readme = read("README.md").replace("2.8.13", "2.8.14")
write("README.md", readme)

technical = read("docs/TECHNICAL.md")
technical = technical.replace("Current version: **2.8.13**.", "Current version: **2.8.14**.")
tech_anchor = "`project-controller.js` owns Project Manager rendering, CRUD actions and explicit link/relink/reopen/forget orchestration. File parsing and workspace restore remain injected application callbacks, while filesystem access is limited to the existing `src/platform/desktop-bridge.js` capability facade. Portable project export/duplication rules remain in `src/investigation/project-manager.js`.\n\n"
tech_insert = tech_anchor + "`inspector-controller.js` owns the selected-log Inspector UI, Details/Context/Correlations/Trace/Raw/JSON tab rendering, representative context navigation and inspector-local filter actions. Worker request/response orchestration remains in `app.js` through narrow callbacks, while trace analysis stays in the existing `src/analysis/` modules.\n\n"
technical = replace_once(technical, tech_anchor, tech_insert, "Technical Inspector paragraph")
write("docs/TECHNICAL.md", technical)

source_layout = read("docs/SOURCE-LAYOUT.md")
source_layout = source_layout.replace(
    "`project-controller.js`, `investigation-controller.js`",
    "`project-controller.js`, `inspector-controller.js`, `investigation-controller.js`",
)
write("docs/SOURCE-LAYOUT.md", source_layout)

src_readme = read("src/README.md")
src_anchor = "`app/project-controller.js` owns Project Manager UI and explicit reopen/link orchestration.\n\n"
src_insert = src_anchor + "`app/inspector-controller.js` owns selected-log Inspector rendering, tabs, context/correlation/trace surfaces and Inspector-local actions while worker orchestration remains in the root application.\n\n"
src_readme = replace_once(src_readme, src_anchor, src_insert, "src README Inspector paragraph")
write("src/README.md", src_readme)

changelog = read("CHANGELOG.md")
entry = '''## 2.8.14 — 2026-09-16

### Inspector application boundary
- Extracted selected-log Inspector rendering, Details/Context/Correlations/Trace/Raw/JSON tabs and Inspector-local actions from the root application into `src/app/inspector-controller.js`.
- Kept Dedicated Worker correlation/trace request and response orchestration in `app.js`; the controller receives those request paths through narrow callbacks and owns only the Inspector-facing surfaces.
- Centralized context-row, correlation-chip, trace waterfall, trace quality, OpenTelemetry context, critical-chain, span-flame and span-event rendering under one lifecycle-managed controller.
- Preserved stable entry selection and existing trace/correlation analysis semantics while moving Inspector event ownership to idempotent `bind()` / `destroy()` lifecycle methods.

### Maintainability and verification
- Removed the large Inspector UI implementation and related delegated listeners from `app.js` while retaining thin compatibility wrappers for cross-feature callbacks.
- Added isolated Inspector controller coverage plus accessibility/UI-foundation ownership checks without changing parser, persistence, filesystem, network or worker protocol boundaries.

'''
if not changelog.startswith("# Changelog\n\n"):
    raise RuntimeError("CHANGELOG header anchor missing")
changelog = changelog.replace("# Changelog\n\n", "# Changelog\n\n" + entry, 1)
write("CHANGELOG.md", changelog)

access = read("tests/accessibility-production-smoke.mjs")
access = replace_once(
    access,
    'const app = read("app.js");\n',
    'const app = read("app.js");\nconst inspectorController = read("src/app/inspector-controller.js");\n',
    "accessibility Inspector source",
)
old_access = 'for (const token of [\'function activateNavView(target)\', \'function bindDialogNavReset(...dialogs)\', \'el.settingsDialog,\', \'function onInspectorTabKeydown(event)\', \'button.tabIndex = active ? 0 : -1\', \'aria-activedescendant\']) assert.ok(app.includes(token), `missing interaction token: ${token}`);'
new_access = 'for (const token of [\'function activateNavView(target)\', \'function bindDialogNavReset(...dialogs)\', \'el.settingsDialog,\', \'aria-activedescendant\']) assert.ok(app.includes(token), `missing interaction token: ${token}`);\nfor (const token of [\'function onInspectorTabKeydown(event)\', \'button.tabIndex = active ? 0 : -1\']) assert.ok(inspectorController.includes(token), `missing Inspector interaction token: ${token}`);'
access = replace_once(access, old_access, new_access, "accessibility ownership assertion")
write("tests/accessibility-production-smoke.mjs", access)

ui = read("tests/ui-foundations-smoke.mjs")
ui = replace_once(
    ui,
    'const projectController = fs.readFileSync(path.join(root, "src/app/project-controller.js"), "utf8");\n',
    'const projectController = fs.readFileSync(path.join(root, "src/app/project-controller.js"), "utf8");\nconst inspectorController = fs.readFileSync(path.join(root, "src/app/inspector-controller.js"), "utf8");\n',
    "UI Inspector source",
)
ui_anchor = 'for (const token of ["historySection", "markHistoryReopened", "forgetProjectHandles"]) {\n  if (!projectController.includes(token)) throw new Error(`Missing Project controller foundation token: ${token}`);\n}\n'
ui_insert = ui_anchor + 'for (const token of ["TRACE QUALITY", "SPAN FLAME", "OTEL RESOURCE & SCOPE", "renderCorrelations", "renderTrace", "onInspectorTabKeydown"]) {\n  if (!inspectorController.includes(token)) throw new Error(`Missing Inspector controller foundation token: ${token}`);\n}\n'
ui = replace_once(ui, ui_anchor, ui_insert, "UI Inspector assertions")
write("tests/ui-foundations-smoke.mjs", ui)

smoke = r'''import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const source = fs.readFileSync(path.join(root, "src/app/inspector-controller.js"), "utf8");

assert.ok(html.includes('src/app/inspector-controller.js'), "Inspector controller must be loaded by index.html");
assert.ok(app.includes("SignalDockInspectorController.create"), "app must initialize Inspector controller");
assert.ok(app.includes("inspectorController.bind()"), "app must bind Inspector controller");
assert.ok(!app.includes("function metaPill("), "Inspector rendering implementation must leave app.js");
assert.ok(!app.includes("function onInspectorTabKeydown("), "Inspector tab event ownership must leave app.js");
assert.ok(!app.includes("SPAN FLAME"), "Trace Inspector rendering must leave app.js");
for (const token of ["selectedEntry", "renderCorrelations", "renderTrace", "TRACE QUALITY", "SPAN FLAME", "OTEL RESOURCE & SCOPE", "bind", "destroy"]) {
  assert.ok(source.includes(token), `missing Inspector controller token: ${token}`);
}
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.ok(!source.includes(forbidden), `Inspector controller must not use ${forbidden}`);
}

const documentStub = { querySelectorAll: () => [] };
const scope = { document: documentStub, console };
scope.self = scope;
scope.window = scope;
vm.createContext(scope);
vm.runInContext(source, scope, { filename: "inspector-controller.js" });
const api = scope.SignalDockInspectorController;
assert.ok(api && typeof api.create === "function");
assert.deepEqual(Array.from(api.INSPECTOR_TABS), ["details", "context", "correlations", "trace", "raw", "json"]);

const state = {
  entries: [{ id: "sd-0", globalIndex: 0, index: 0, level: "INFO", service: "api", source: "sample.log", message: "ready", timestamp: "", correlations: {}, traceMeta: {}, dimensions: {}, raw: {} }],
  selectedId: "sd-0",
  inspectorTab: "details",
  correlatedIndexes: [],
  correlationEngine: "idle",
  traceIndexes: [],
  traceEngine: "idle",
  investigation: { items: [] }
};
const controller = api.create({ state, el: {}, getUtils: () => ({ safeStringify: JSON.stringify, shortSource: (value) => value, formatTime: (value) => value || "—", copyText: async () => {} }) });
assert.equal(controller.selectedEntry()?.id, "sd-0");
assert.equal(controller.formatDuration(0.5), "500 µs");
assert.equal(controller.formatDuration(12), "12.0 ms");
controller.bind();
controller.bind();
controller.destroy();
controller.destroy();

console.log("inspector-controller-smoke PASS");
'''
write("tests/inspector-controller-smoke.mjs", smoke)

print("v2.8.14 Inspector controller migration staged")
