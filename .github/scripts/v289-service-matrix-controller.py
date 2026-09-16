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
source_layout_test_path = root / 'tests' / 'source-layout-smoke.mjs'
ui_foundations_path = root / 'tests' / 'ui-foundations-smoke.mjs'
controller_test_path = root / 'tests' / 'service-matrix-controller-smoke.mjs'
controller_path = root / 'src' / 'app' / 'service-matrix-controller.js'
ci_path = root / '.github' / 'workflows' / 'ci.yml'

if not controller_path.exists():
    raise SystemExit('Service Matrix controller must exist before migration')
if 'src/app/service-matrix-controller.js' not in ci_path.read_text():
    raise SystemExit('Permanent CI must verify the Service Matrix controller asset before migration')

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.8.8";', 'const APP_VERSION = "2.8.9";', 'app version')
app = replace_exact(
    app,
    '  let traceExplorerController = null;\n  let traceOutlierController = null;\n  let caseWorkspaceController = null;\n',
    '  let traceExplorerController = null;\n  let traceOutlierController = null;\n  let serviceMatrixController = null;\n  let caseWorkspaceController = null;\n',
    'Service Matrix controller state slot'
)
app = replace_exact(
    app,
    '      matrix: openServiceMatrix,\n',
    '      matrix: () => serviceMatrixController?.open(),\n',
    'Service Matrix navigation dispatch'
)

init_anchor = '''    traceOutlierController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
init_replacement = '''    traceOutlierController.bind();
    if (!window.SignalDockServiceMatrixController?.create) throw new Error("SignalDock Service Matrix controller is unavailable.");
    serviceMatrixController = window.SignalDockServiceMatrixController.create({
      state,
      el,
      formatDuration,
      toast,
      filterByServiceValue,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    serviceMatrixController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
app = replace_exact(app, init_anchor, init_replacement, 'Service Matrix controller initialization')

matrix_events = '''    el.closeServiceMatrixButton?.addEventListener("click", closeServiceMatrix);
    el.serviceMatrixResetButton?.addEventListener("click", () => { state.serviceMatrixScopeFiltered = false; renderServiceMatrix(false); });
    el.serviceMatrixBody?.addEventListener("click", onServiceMatrixClick);
'''
app = replace_exact(app, matrix_events, '', 'Service Matrix event ownership')

block_start = app.find('  function openServiceMatrix() {')
block_end = app.find('  function openServiceHeatmap() {', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('Service Matrix application block not found')
app = app[:block_start] + app[block_end:]

for forbidden in [
    'function openServiceMatrix()',
    'function closeServiceMatrix()',
    'function renderServiceMatrix(',
    'function onServiceMatrixClick(',
    'el.serviceMatrixBody?.addEventListener',
    'el.serviceMatrixResetButton?.addEventListener'
]:
    if forbidden in app:
        raise SystemExit(f'legacy Service Matrix UI wiring remains: {forbidden}')
app_path.write_text(app)

index = index_path.read_text()
index = replace_exact(
    index,
    '  <script src="src/app/trace-outlier-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    '  <script src="src/app/trace-outlier-controller.js" defer></script>\n  <script src="src/app/service-matrix-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    'Service Matrix controller script order'
)
index_path.write_text(index)

source_test = source_layout_test_path.read_text()
source_test = replace_exact(
    source_test,
    '  "src/app/trace-outlier-controller.js",\n  "src/app/case-workspace-controller.js",\n',
    '  "src/app/trace-outlier-controller.js",\n  "src/app/service-matrix-controller.js",\n  "src/app/case-workspace-controller.js",\n',
    'source layout Service Matrix controller inventory'
)
source_layout_test_path.write_text(source_test)

ui_test = ui_foundations_path.read_text()
ui_test = replace_exact(
    ui_test,
    'const traceOutlierController = fs.readFileSync(path.join(root, "src/app/trace-outlier-controller.js"), "utf8");\nconst caseCheckpointController',
    'const traceOutlierController = fs.readFileSync(path.join(root, "src/app/trace-outlier-controller.js"), "utf8");\nconst serviceMatrixController = fs.readFileSync(path.join(root, "src/app/service-matrix-controller.js"), "utf8");\nconst caseCheckpointController',
    'UI foundation Service Matrix controller source'
)
ui_test = replace_exact(
    ui_test,
    'for (const token of ["selectScope", "buildSampleLookup", "resolveSampleEntry", "outlierSampleId", "No trace entries match the current filters"]) {\n  if (!traceOutlierController.includes(token)) throw new Error(`Missing Trace Outliers controller foundation token: ${token}`);\n}\n',
    'for (const token of ["selectScope", "buildSampleLookup", "resolveSampleEntry", "outlierSampleId", "No trace entries match the current filters"]) {\n  if (!traceOutlierController.includes(token)) throw new Error(`Missing Trace Outliers controller foundation token: ${token}`);\n}\nfor (const token of ["selectScope", "No log entries match the current filters", "Filter to source service", "Filter to target service", "serviceMatrixScopeFiltered"]) {\n  if (!serviceMatrixController.includes(token)) throw new Error(`Missing Service Matrix controller foundation token: ${token}`);\n}\n',
    'UI foundation Service Matrix controller assertions'
)
ui_foundations_path.write_text(ui_test)

controller_test_path.write_text(r'''import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const domain = read("src/analysis/service-matrix.js");
const source = read("src/app/service-matrix-controller.js");
const app = read("app.js");
const index = read("index.html");
const ci = read(".github/workflows/ci.yml");

const sandbox = { self: {}, console };
vm.createContext(sandbox);
vm.runInContext(domain, sandbox, { filename: "service-matrix.js" });
vm.runInContext(source, sandbox, { filename: "service-matrix-controller.js" });
const api = sandbox.self.SignalDockServiceMatrixController;
assert.equal(api.VERSION, 1);
assert.equal(Object.isFrozen(api), true);

const entries = [
  { id: "parent", service: "api", level: "INFO", correlations: { span: "span-parent", trace: "trace-1" }, traceMeta: { durationMs: 12 } },
  { id: "child", service: "db", level: "ERROR", correlations: { span: "span-child", trace: "trace-1" }, traceMeta: { parentSpan: "span-parent", durationMs: 45 } }
];
const emptyFiltered = api.selectScope(entries, [], true);
assert.equal(emptyFiltered.filtered, true, "zero-result active filters must stay filtered");
assert.equal(Array.isArray(emptyFiltered.indexes), true, "zero-result active filters must keep an index array");
assert.equal(emptyFiltered.indexes.length, 0, "zero-result active filters must pass an explicit empty index set");
const fullFiltered = api.selectScope(entries, [0, 1], true);
assert.equal(fullFiltered.filtered, false, "a full-result filter can reuse the all-log cache");
assert.equal(fullFiltered.indexes, null);

function node(tag) {
  return {
    tag,
    className: "",
    textContent: "",
    colSpan: 0,
    dataset: {},
    children: [],
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); return item; },
    setAttribute() {}
  };
}
const documentStub = { createElement: node };
const body = {
  ownerDocument: documentStub,
  children: [],
  replaceChildren() { this.children = []; },
  appendChild(item) { this.children.push(item); return item; },
  addEventListener() {},
  removeEventListener() {}
};
const state = {
  entries,
  filteredIndexes: [],
  serviceMatrixData: sandbox.self.SignalDockServiceMatrix.build(entries),
  serviceMatrixScopeFiltered: true
};
const controller = api.create({ state, el: { serviceMatrixBody: body }, formatDuration: String });
const emptyData = controller.render(true);
assert.equal(emptyData.rows.length, 0, "filtered zero-result render must analyze zero entries");
assert.equal(body.children[0].children[0].textContent, "No log entries match the current filters.");

for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(source.includes(forbidden), false, `Service Matrix controller must stay local-only and capability-narrow: ${forbidden}`);
}
assert.ok(index.includes('src/app/service-matrix-controller.js'), "Service Matrix controller must load from index.html");
assert.ok(ci.includes('src/app/service-matrix-controller.js'), "CI must HTTP-smoke the Service Matrix controller");
for (const token of [
  "SignalDockServiceMatrixController.create",
  "serviceMatrixController.bind()",
  "matrix: () => serviceMatrixController?.open()"
]) assert.ok(app.includes(token), `Service Matrix app integration token missing: ${token}`);
for (const legacy of [
  "function openServiceMatrix()",
  "function renderServiceMatrix(",
  "function onServiceMatrixClick("
]) assert.equal(app.includes(legacy), false, `legacy Service Matrix orchestration must leave app.js: ${legacy}`);
console.log("service-matrix-controller-smoke PASS");
''')

version_path.write_text('2.8.9\n')

readme = readme_path.read_text()
if readme.count('2.8.8') != 3:
    raise SystemExit(f'README version references: expected 3, found {readme.count("2.8.8")}')
readme = readme.replace('2.8.8', '2.8.9')
readme = replace_exact(
    readme,
    '- feature-level Trace Outliers controller under `src/app/` that owns outlier result rendering, filtered-scope semantics and trace navigation while robust scoring remains in `src/analysis/trace-outliers.js`\n',
    '- feature-level Trace Outliers controller under `src/app/` that owns outlier result rendering, filtered-scope semantics and trace navigation while robust scoring remains in `src/analysis/trace-outliers.js`\n- feature-level Service Matrix controller under `src/app/` that owns dependency-matrix rendering, filtered-scope semantics and service-filter actions while aggregation remains in `src/analysis/service-matrix.js`\n',
    'README Service Matrix controller feature'
)
readme_path.write_text(readme)

technical = technical_path.read_text()
technical = replace_exact(technical, 'Current version: **2.8.8**.', 'Current version: **2.8.9**.', 'technical current version')
technical = replace_exact(
    technical,
    '`trace-outlier-controller.js` owns Trace Outliers rendering, filtered/all-log scope selection and trace-opening actions. Robust scoring remains in `src/analysis/trace-outliers.js`; query filtering, selected-log navigation, inspector rendering and dialog coordination are injected callbacks. A zero-result active filter remains an empty scope instead of silently falling back to all loaded logs, and rendered actions retain stable entry IDs with index/trace fallbacks.\n',
    '`trace-outlier-controller.js` owns Trace Outliers rendering, filtered/all-log scope selection and trace-opening actions. Robust scoring remains in `src/analysis/trace-outliers.js`; query filtering, selected-log navigation, inspector rendering and dialog coordination are injected callbacks. A zero-result active filter remains an empty scope instead of silently falling back to all loaded logs, and rendered actions retain stable entry IDs with index/trace fallbacks.\n\n`service-matrix-controller.js` owns Service Matrix rendering, filtered/all-log scope selection and service-filter actions. Dependency aggregation and bounded latency statistics remain in `src/analysis/service-matrix.js`; service filtering and dialog coordination are injected callbacks. Empty filtered results remain an explicit empty matrix instead of silently falling back to the all-log cache.\n',
    'technical Service Matrix controller boundary'
)
technical_path.write_text(technical)

source_layout = source_layout_path.read_text()
source_layout = replace_exact(
    source_layout,
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `investigation-controller.js`, `exception-controller.js`, `trace-explorer-controller.js`, `trace-outlier-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `investigation-controller.js`, `exception-controller.js`, `trace-explorer-controller.js`, `trace-outlier-controller.js`, `service-matrix-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'source layout Service Matrix controller inventory'
)
source_layout_path.write_text(source_layout)

src_readme = src_readme_path.read_text()
src_readme = replace_exact(
    src_readme,
    '`app/trace-outlier-controller.js` owns Trace Outliers rendering, scope selection and trace-opening coordination while robust ranking stays in `analysis/trace-outliers.js`.\n',
    '`app/trace-outlier-controller.js` owns Trace Outliers rendering, scope selection and trace-opening coordination while robust ranking stays in `analysis/trace-outliers.js`.\n\n`app/service-matrix-controller.js` owns Service Matrix rendering, filtered-scope selection and service-filter coordination while dependency aggregation stays in `analysis/service-matrix.js`.\n',
    'src README Service Matrix controller'
)
src_readme_path.write_text(src_readme)

changelog = changelog_path.read_text()
entry = '''## 2.8.9 — 2026-09-16

### Service Matrix application boundary
- Extracted Service Matrix rendering, scope reset and service-filter actions from the root application into `src/app/service-matrix-controller.js`.
- Kept explicit parent-span dependency aggregation, bounded duration sampling/histograms and latency percentiles in `src/analysis/service-matrix.js`; filtering and dialog coordination remain injected callbacks.
- Fixed filtered-scope semantics so an active query with zero matching entries produces an empty matrix instead of silently displaying all-log dependency edges.
- Added source/target-specific accessible names to generated matrix filter actions without changing the underlying dependency evidence model.

### Maintainability and verification
- Removed legacy Service Matrix functions and event listeners from `app.js`, with idempotent event ownership moved into the controller.
- Added isolated controller coverage for zero-result scope behavior, local-only constraints, load order and application integration.
- Extended source-layout, UI-foundation and permanent HTTP quality gates without changing persistence, network policy or the zero-build deployment model.

'''
changelog = replace_exact(changelog, '# Changelog\n\n', '# Changelog\n\n' + entry, 'changelog 2.8.9 entry')
changelog_path.write_text(changelog)

print('v2.8.9 Service Matrix controller migration staged')
