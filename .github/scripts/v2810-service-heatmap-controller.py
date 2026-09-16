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
controller_test_path = root / 'tests' / 'service-heatmap-controller-smoke.mjs'
controller_path = root / 'src' / 'app' / 'service-heatmap-controller.js'
ci_path = root / '.github' / 'workflows' / 'ci.yml'

if not controller_path.exists():
    raise SystemExit('Service Heatmap controller must exist before migration')
if 'src/app/service-heatmap-controller.js' not in ci_path.read_text():
    raise SystemExit('Permanent CI must verify the Service Heatmap controller asset before migration')

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.8.9";', 'const APP_VERSION = "2.8.10";', 'app version')
app = replace_exact(
    app,
    '  let traceOutlierController = null;\n  let serviceMatrixController = null;\n  let caseWorkspaceController = null;\n',
    '  let traceOutlierController = null;\n  let serviceMatrixController = null;\n  let serviceHeatmapController = null;\n  let caseWorkspaceController = null;\n',
    'Service Heatmap controller state slot'
)
app = replace_exact(
    app,
    '      heatmap: openServiceHeatmap,\n',
    '      heatmap: () => serviceHeatmapController?.open(),\n',
    'Service Heatmap navigation dispatch'
)

init_anchor = '''    serviceMatrixController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
init_replacement = '''    serviceMatrixController.bind();
    if (!window.SignalDockServiceHeatmapController?.create) throw new Error("SignalDock Service Heatmap controller is unavailable.");
    serviceHeatmapController = window.SignalDockServiceHeatmapController.create({
      state,
      el,
      formatDuration,
      toast,
      filterByServiceValue,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    serviceHeatmapController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
app = replace_exact(app, init_anchor, init_replacement, 'Service Heatmap controller initialization')

heatmap_events = '''    el.closeServiceHeatmapButton?.addEventListener("click", closeServiceHeatmap);
    el.serviceHeatmapResetButton?.addEventListener("click", () => { state.serviceHeatmapScopeFiltered = false; renderServiceHeatmap(false); });
    el.serviceHeatmapBody?.addEventListener("click", onServiceHeatmapClick);
'''
app = replace_exact(app, heatmap_events, '', 'Service Heatmap event ownership')

block_start = app.find('  function openServiceHeatmap() {')
block_end = app.find('  function serviceTrendSplitMs(', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('Service Heatmap application block not found')
app = app[:block_start] + app[block_end:]

for forbidden in [
    'function openServiceHeatmap()',
    'function closeServiceHeatmap()',
    'function renderServiceHeatmap(',
    'function onServiceHeatmapClick(',
    'el.serviceHeatmapBody?.addEventListener',
    'el.serviceHeatmapResetButton?.addEventListener'
]:
    if forbidden in app:
        raise SystemExit(f'legacy Service Heatmap UI wiring remains: {forbidden}')
app_path.write_text(app)

index = index_path.read_text()
index = replace_exact(
    index,
    '  <script src="src/app/service-matrix-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    '  <script src="src/app/service-matrix-controller.js" defer></script>\n  <script src="src/app/service-heatmap-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    'Service Heatmap controller script order'
)
index_path.write_text(index)

source_test = source_layout_test_path.read_text()
source_test = replace_exact(
    source_test,
    '  "src/app/service-matrix-controller.js",\n  "src/app/case-workspace-controller.js",\n',
    '  "src/app/service-matrix-controller.js",\n  "src/app/service-heatmap-controller.js",\n  "src/app/case-workspace-controller.js",\n',
    'source layout Service Heatmap controller inventory'
)
source_layout_test_path.write_text(source_test)

ui_test = ui_foundations_path.read_text()
ui_test = replace_exact(
    ui_test,
    'const serviceMatrixController = fs.readFileSync(path.join(root, "src/app/service-matrix-controller.js"), "utf8");\nconst caseCheckpointController',
    'const serviceMatrixController = fs.readFileSync(path.join(root, "src/app/service-matrix-controller.js"), "utf8");\nconst serviceHeatmapController = fs.readFileSync(path.join(root, "src/app/service-heatmap-controller.js"), "utf8");\nconst caseCheckpointController',
    'UI foundation Service Heatmap controller source'
)
ui_test = replace_exact(
    ui_test,
    'for (const token of ["selectScope", "No log entries match the current filters", "Filter to source service", "Filter to target service", "serviceMatrixScopeFiltered"]) {\n  if (!serviceMatrixController.includes(token)) throw new Error(`Missing Service Matrix controller foundation token: ${token}`);\n}\n',
    'for (const token of ["selectScope", "No log entries match the current filters", "Filter to source service", "Filter to target service", "serviceMatrixScopeFiltered"]) {\n  if (!serviceMatrixController.includes(token)) throw new Error(`Missing Service Matrix controller foundation token: ${token}`);\n}\nfor (const token of ["selectScope", "No log entries match the current filters", "Filter to target service", "dependency-heatmap-cell", "serviceHeatmapScopeFiltered"]) {\n  if (!serviceHeatmapController.includes(token)) throw new Error(`Missing Service Heatmap controller foundation token: ${token}`);\n}\n',
    'UI foundation Service Heatmap controller assertions'
)
ui_foundations_path.write_text(ui_test)

controller_test_path.write_text(r'''import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const domain = read("src/analysis/service-heatmap.js");
const source = read("src/app/service-heatmap-controller.js");
const app = read("app.js");
const index = read("index.html");
const ci = read(".github/workflows/ci.yml");

const sandbox = { self: {}, console };
vm.createContext(sandbox);
vm.runInContext(domain, sandbox, { filename: "service-heatmap.js" });
vm.runInContext(source, sandbox, { filename: "service-heatmap-controller.js" });
const api = sandbox.self.SignalDockServiceHeatmapController;
assert.equal(api.VERSION, 1);
assert.equal(Object.isFrozen(api), true);

const entries = [
  { id: "parent", service: "api", level: "INFO", timestampMs: 1000, correlations: { span: "span-parent", trace: "trace-1" }, traceMeta: { durationMs: 12 } },
  { id: "child", service: "db", level: "ERROR", timestampMs: 1100, correlations: { span: "span-child", trace: "trace-1" }, traceMeta: { parentSpan: "span-parent", durationMs: 45 } }
];
const emptyFiltered = api.selectScope(entries, [], true);
assert.equal(emptyFiltered.filtered, true, "zero-result active filters must stay filtered");
assert.equal(Array.isArray(emptyFiltered.indexes), true);
assert.equal(emptyFiltered.indexes.length, 0, "zero-result active filters must pass an explicit empty index set");
const fullFiltered = api.selectScope(entries, [0, 1], true);
assert.equal(fullFiltered.filtered, false, "a full-result filter can reuse the all-log cache");
assert.equal(fullFiltered.indexes, null);

function node(tag) {
  return {
    tag,
    className: "",
    textContent: "",
    title: "",
    dataset: {},
    children: [],
    classList: { add() {}, toggle() {} },
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
  serviceHeatmapData: sandbox.self.SignalDockServiceHeatmap.build(entries, null, { bucketCount: 12 }),
  serviceHeatmapScopeFiltered: true
};
const controller = api.create({ state, el: { serviceHeatmapBody: body }, formatDuration: String });
const emptyData = controller.render(true);
assert.equal(emptyData.rows.length, 0, "filtered zero-result render must analyze zero entries");
assert.equal(body.children[0].textContent, "No log entries match the current filters.");

for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(source.includes(forbidden), false, `Service Heatmap controller must stay local-only and capability-narrow: ${forbidden}`);
}
assert.ok(source.includes('setAttribute("aria-label", `Filter to target service'), "heatmap actions must expose target-service labels");
assert.ok(index.includes('src/app/service-heatmap-controller.js'), "Service Heatmap controller must load from index.html");
assert.ok(ci.includes('src/app/service-heatmap-controller.js'), "CI must HTTP-smoke the Service Heatmap controller");
for (const token of [
  "SignalDockServiceHeatmapController.create",
  "serviceHeatmapController.bind()",
  "heatmap: () => serviceHeatmapController?.open()"
]) assert.ok(app.includes(token), `Service Heatmap app integration token missing: ${token}`);
for (const legacy of [
  "function openServiceHeatmap()",
  "function renderServiceHeatmap(",
  "function onServiceHeatmapClick("
]) assert.equal(app.includes(legacy), false, `legacy Service Heatmap orchestration must leave app.js: ${legacy}`);
console.log("service-heatmap-controller-smoke PASS");
''')

version_path.write_text('2.8.10\n')

readme = readme_path.read_text()
if readme.count('2.8.9') != 3:
    raise SystemExit(f'README version references: expected 3, found {readme.count("2.8.9")}')
readme = readme.replace('2.8.9', '2.8.10')
readme = replace_exact(
    readme,
    '- feature-level Service Matrix controller under `src/app/` that owns dependency-matrix rendering, filtered-scope semantics and service-filter actions while aggregation remains in `src/analysis/service-matrix.js`\n',
    '- feature-level Service Matrix controller under `src/app/` that owns dependency-matrix rendering, filtered-scope semantics and service-filter actions while aggregation remains in `src/analysis/service-matrix.js`\n- feature-level Dependency Heatmap controller under `src/app/` that owns time-bucket heatmap rendering, filtered-scope semantics and service-filter actions while bucketing remains in `src/analysis/service-heatmap.js`\n',
    'README Service Heatmap controller feature'
)
readme_path.write_text(readme)

technical = technical_path.read_text()
technical = replace_exact(technical, 'Current version: **2.8.9**.', 'Current version: **2.8.10**.', 'technical current version')
technical = replace_exact(
    technical,
    '`service-matrix-controller.js` owns Service Matrix rendering, filtered/all-log scope selection and service-filter actions. Dependency aggregation and bounded latency statistics remain in `src/analysis/service-matrix.js`; service filtering and dialog coordination are injected callbacks. Empty filtered results remain an explicit empty matrix instead of silently falling back to the all-log cache.\n',
    '`service-matrix-controller.js` owns Service Matrix rendering, filtered/all-log scope selection and service-filter actions. Dependency aggregation and bounded latency statistics remain in `src/analysis/service-matrix.js`; service filtering and dialog coordination are injected callbacks. Empty filtered results remain an explicit empty matrix instead of silently falling back to the all-log cache.\n\n`service-heatmap-controller.js` owns Dependency Heatmap rendering, filtered/all-log scope selection and target-service filter actions. Time bucketing and explicit parent-span dependency aggregation remain in `src/analysis/service-heatmap.js`; service filtering and dialog coordination are injected callbacks. Empty filtered results remain an explicit empty heatmap instead of silently falling back to all loaded logs.\n',
    'technical Service Heatmap controller boundary'
)
technical_path.write_text(technical)

source_layout = source_layout_path.read_text()
source_layout = replace_exact(
    source_layout,
    '`trace-outlier-controller.js`, `service-matrix-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    '`trace-outlier-controller.js`, `service-matrix-controller.js`, `service-heatmap-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'source layout Service Heatmap controller inventory'
)
source_layout_path.write_text(source_layout)

src_readme = src_readme_path.read_text()
src_readme = replace_exact(
    src_readme,
    '`app/service-matrix-controller.js` owns Service Matrix rendering, filtered-scope selection and service-filter coordination while dependency aggregation stays in `analysis/service-matrix.js`.\n',
    '`app/service-matrix-controller.js` owns Service Matrix rendering, filtered-scope selection and service-filter coordination while dependency aggregation stays in `analysis/service-matrix.js`.\n\n`app/service-heatmap-controller.js` owns Dependency Heatmap rendering, filtered-scope selection and target-service filter coordination while time bucketing stays in `analysis/service-heatmap.js`.\n',
    'src README Service Heatmap controller'
)
src_readme_path.write_text(src_readme)

changelog = changelog_path.read_text()
entry = '''## 2.8.10 — 2026-09-16

### Dependency Heatmap application boundary
- Extracted Dependency Heatmap rendering, scope reset and target-service filter actions from the root application into `src/app/service-heatmap-controller.js`.
- Kept timestamp bucketing, explicit parent-span dependency aggregation and bounded per-bucket latency samples in `src/analysis/service-heatmap.js`; filtering and dialog coordination remain injected callbacks.
- Fixed filtered-scope semantics so an active query with zero matching entries produces an empty heatmap instead of silently displaying all-log dependency edges.
- Added target-service/time/call/error/p95 accessible names to generated heatmap cells while preserving evidence-derived topology semantics.

### Maintainability and verification
- Removed legacy Dependency Heatmap functions and event listeners from `app.js`, with idempotent event ownership moved into the controller.
- Added isolated controller coverage for zero-result scope behavior, local-only constraints, load order and application integration.
- Extended source-layout, UI-foundation and permanent HTTP quality gates without changing persistence, network policy or the zero-build deployment model.

'''
changelog = replace_exact(changelog, '# Changelog\n\n', '# Changelog\n\n' + entry, 'changelog 2.8.10 entry')
changelog_path.write_text(changelog)

print('v2.8.10 Service Heatmap controller migration staged')
