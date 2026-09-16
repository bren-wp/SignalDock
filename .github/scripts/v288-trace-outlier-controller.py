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
controller_test_path = root / 'tests' / 'trace-outlier-controller-smoke.mjs'
controller_path = root / 'src' / 'app' / 'trace-outlier-controller.js'
ci_path = root / '.github' / 'workflows' / 'ci.yml'

if not controller_path.exists():
    raise SystemExit('Trace Outliers controller must exist before migration')
if 'src/app/trace-outlier-controller.js' not in ci_path.read_text():
    raise SystemExit('Permanent CI must verify the Trace Outliers controller asset before migration')

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.8.7";', 'const APP_VERSION = "2.8.8";', 'app version')
app = replace_exact(
    app,
    '  let exceptionController = null;\n  let traceExplorerController = null;\n  let caseWorkspaceController = null;\n',
    '  let exceptionController = null;\n  let traceExplorerController = null;\n  let traceOutlierController = null;\n  let caseWorkspaceController = null;\n',
    'Trace Outliers controller state slot'
)
app = replace_exact(
    app,
    '      outliers: openTraceOutliers,\n',
    '      outliers: () => traceOutlierController?.open(),\n',
    'Trace Outliers navigation dispatch'
)

init_anchor = '''    traceExplorerController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
init_replacement = '''    traceExplorerController.bind();
    if (!window.SignalDockTraceOutlierController?.create) throw new Error("SignalDock Trace Outliers controller is unavailable.");
    traceOutlierController = window.SignalDockTraceOutlierController.create({
      state,
      el,
      formatDuration,
      toast,
      applyTraceFilter: (traceId) => {
        el.queryInput.value = `trace:${quoteIfNeeded(traceId)}`;
        applyFilters(true);
      },
      selectEntry,
      renderInspector,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    traceOutlierController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
app = replace_exact(app, init_anchor, init_replacement, 'Trace Outliers controller initialization')

trace_events = '''    el.closeTraceOutlierButton?.addEventListener("click", closeTraceOutliers);
    el.traceOutlierResetButton?.addEventListener("click", () => { state.traceOutlierScopeFiltered = false; renderTraceOutliers(false); });
    el.traceOutlierBody?.addEventListener("click", onTraceOutlierClick);
'''
app = replace_exact(app, trace_events, '', 'Trace Outliers event ownership')

block_start = app.find('  function openTraceOutliers() {')
block_end = app.find('  function makeUiButton(', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('Trace Outliers application block not found')
app = app[:block_start] + app[block_end:]

for forbidden in [
    'function openTraceOutliers()',
    'function closeTraceOutliers()',
    'function renderTraceOutliers(',
    'function onTraceOutlierClick(',
    'el.traceOutlierBody?.addEventListener',
    'el.traceOutlierResetButton?.addEventListener'
]:
    if forbidden in app:
        raise SystemExit(f'legacy Trace Outliers UI wiring remains: {forbidden}')
app_path.write_text(app)

index = index_path.read_text()
index = replace_exact(
    index,
    '  <script src="src/app/trace-explorer-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    '  <script src="src/app/trace-explorer-controller.js" defer></script>\n  <script src="src/app/trace-outlier-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    'Trace Outliers controller script order'
)
index_path.write_text(index)

source_test = source_layout_test_path.read_text()
source_test = replace_exact(
    source_test,
    '  "src/app/trace-explorer-controller.js",\n  "src/app/case-workspace-controller.js",\n',
    '  "src/app/trace-explorer-controller.js",\n  "src/app/trace-outlier-controller.js",\n  "src/app/case-workspace-controller.js",\n',
    'source layout Trace Outliers controller inventory'
)
source_layout_test_path.write_text(source_test)

ui_test = ui_foundations_path.read_text()
ui_test = replace_exact(
    ui_test,
    'const traceExplorerController = fs.readFileSync(path.join(root, "src/app/trace-explorer-controller.js"), "utf8");\nconst caseCheckpointController',
    'const traceExplorerController = fs.readFileSync(path.join(root, "src/app/trace-explorer-controller.js"), "utf8");\nconst traceOutlierController = fs.readFileSync(path.join(root, "src/app/trace-outlier-controller.js"), "utf8");\nconst caseCheckpointController',
    'UI foundation Trace Outliers controller source'
)
ui_test = replace_exact(
    ui_test,
    'for (const token of ["resolveSampleEntry", "traceSampleId", "aria-pressed", "renderComparison", "reconcileSelection"]) {\n  if (!traceExplorerController.includes(token)) throw new Error(`Missing Trace Explorer controller foundation token: ${token}`);\n}\n',
    'for (const token of ["resolveSampleEntry", "traceSampleId", "aria-pressed", "renderComparison", "reconcileSelection"]) {\n  if (!traceExplorerController.includes(token)) throw new Error(`Missing Trace Explorer controller foundation token: ${token}`);\n}\nfor (const token of ["selectScope", "buildSampleLookup", "resolveSampleEntry", "outlierSampleId", "No trace entries match the current filters"]) {\n  if (!traceOutlierController.includes(token)) throw new Error(`Missing Trace Outliers controller foundation token: ${token}`);\n}\n',
    'UI foundation Trace Outliers controller assertions'
)
ui_foundations_path.write_text(ui_test)

controller_test_path.write_text(r'''import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const domain = read("src/analysis/trace-outliers.js");
const source = read("src/app/trace-outlier-controller.js");
const app = read("app.js");
const index = read("index.html");
const ci = read(".github/workflows/ci.yml");

const sandbox = { self: {}, console, setTimeout };
vm.createContext(sandbox);
vm.runInContext(domain, sandbox, { filename: "trace-outliers.js" });
vm.runInContext(source, sandbox, { filename: "trace-outlier-controller.js" });
const api = sandbox.self.SignalDockTraceOutlierController;
assert.equal(api.VERSION, 1);
assert.equal(api.cleanTraceId("  trace-123  "), "trace-123");
assert.equal(Object.isFrozen(api), true);

const entries = [
  { id: "entry-a", correlations: { trace: "trace-a" }, level: "INFO", timestampMs: 1, traceMeta: { durationMs: 10 } },
  { id: "entry-b", correlations: { trace: "trace-b" }, level: "ERROR", timestampMs: 2, traceMeta: { durationMs: 50 } },
  { id: "entry-b2", correlations: { trace: "trace-b" }, level: "INFO", timestampMs: 3, traceMeta: { durationMs: 20 } }
];

const emptyFiltered = api.selectScope(entries, [], true);
assert.equal(emptyFiltered.filtered, true, "zero-result active filters must stay filtered");
assert.equal(emptyFiltered.entries.length, 0, "zero-result active filters must not fall back to all logs");
const allScope = api.selectScope(entries, [0, 1, 2], true);
assert.equal(allScope.filtered, false, "full-result filters can reuse the all-log cache");

const lookup = api.buildSampleLookup(entries, [1, 2]);
assert.deepEqual({ ...lookup.get("trace-b") }, { entryId: "entry-b", index: 1 });
assert.equal(api.resolveSampleEntry(entries, { entryId: "entry-b2", index: 0, traceId: "trace-a" }).id, "entry-b2", "stable entry ID must win over stale index/trace fallbacks");
assert.equal(api.resolveSampleEntry(entries, { entryId: "missing", index: 1, traceId: "trace-a" }).id, "entry-b", "index fallback should remain supported");
assert.equal(api.resolveSampleEntry(entries, { entryId: "missing", index: 99, traceId: "trace-a" }).id, "entry-a", "trace ID fallback should recover a representative entry");

function node(tag) {
  return {
    tag,
    className: "",
    textContent: "",
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
const state = { entries, filteredIndexes: [], traceOutlierData: sandbox.self.SignalDockTraceOutliers.rank(entries, { limit: 250 }), traceOutlierScopeFiltered: true, inspectorTab: "details" };
const controller = api.create({ state, el: { traceOutlierBody: body }, formatDuration: String });
const emptyData = controller.render(true);
assert.equal(emptyData.totalTraces, 0, "filtered zero-result render must analyze zero traces");
assert.equal(body.children[0].children[0].textContent, "No trace entries match the current filters.");

for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(source.includes(forbidden), false, `Trace Outliers controller must stay local-only and capability-narrow: ${forbidden}`);
}
assert.ok(index.includes('src/app/trace-outlier-controller.js'), "Trace Outliers controller must load from index.html");
assert.ok(ci.includes('src/app/trace-outlier-controller.js'), "CI must HTTP-smoke the Trace Outliers controller");
for (const token of [
  "SignalDockTraceOutlierController.create",
  "traceOutlierController.bind()",
  "outliers: () => traceOutlierController?.open()"
]) assert.ok(app.includes(token), `Trace Outliers app integration token missing: ${token}`);
for (const legacy of [
  "function openTraceOutliers()",
  "function renderTraceOutliers(",
  "function onTraceOutlierClick("
]) assert.equal(app.includes(legacy), false, `legacy Trace Outliers orchestration must leave app.js: ${legacy}`);
console.log("trace-outlier-controller-smoke PASS");
''')

version_path.write_text('2.8.8\n')

readme = readme_path.read_text()
if readme.count('2.8.7') != 3:
    raise SystemExit(f'README version references: expected 3, found {readme.count("2.8.7")}')
readme = readme.replace('2.8.7', '2.8.8')
readme = replace_exact(
    readme,
    '- feature-level Trace Explorer controller under `src/app/` that owns distributed-trace inventory, A/B comparison selection and trace-sample navigation while trace aggregation/comparison remains in `src/analysis/`\n',
    '- feature-level Trace Explorer controller under `src/app/` that owns distributed-trace inventory, A/B comparison selection and trace-sample navigation while trace aggregation/comparison remains in `src/analysis/`\n- feature-level Trace Outliers controller under `src/app/` that owns outlier result rendering, filtered-scope semantics and trace navigation while robust scoring remains in `src/analysis/trace-outliers.js`\n',
    'README Trace Outliers controller feature'
)
readme_path.write_text(readme)

technical = technical_path.read_text()
technical = replace_exact(technical, 'Current version: **2.8.7**.', 'Current version: **2.8.8**.', 'technical current version')
technical = replace_exact(
    technical,
    '`trace-explorer-controller.js` owns distributed Trace Explorer rendering, two-trace comparison selection/dialog coordination and representative trace-sample navigation. Trace inventory and A/B comparison calculations remain in `src/analysis/trace-explorer.js` and `src/analysis/trace-compare.js`; filtering, inspector rendering and dialog coordination are injected callbacks. Sample navigation prefers a stable entry ID before index and explicit trace-ID fallbacks.\n',
    '`trace-explorer-controller.js` owns distributed Trace Explorer rendering, two-trace comparison selection/dialog coordination and representative trace-sample navigation. Trace inventory and A/B comparison calculations remain in `src/analysis/trace-explorer.js` and `src/analysis/trace-compare.js`; filtering, inspector rendering and dialog coordination are injected callbacks. Sample navigation prefers a stable entry ID before index and explicit trace-ID fallbacks.\n\n`trace-outlier-controller.js` owns Trace Outliers rendering, filtered/all-log scope selection and trace-opening actions. Robust scoring remains in `src/analysis/trace-outliers.js`; query filtering, selected-log navigation, inspector rendering and dialog coordination are injected callbacks. A zero-result active filter remains an empty scope instead of silently falling back to all loaded logs, and rendered actions retain stable entry IDs with index/trace fallbacks.\n',
    'technical Trace Outliers controller boundary'
)
technical_path.write_text(technical)

source_layout = source_layout_path.read_text()
source_layout = replace_exact(
    source_layout,
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `investigation-controller.js`, `exception-controller.js`, `trace-explorer-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `investigation-controller.js`, `exception-controller.js`, `trace-explorer-controller.js`, `trace-outlier-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'source layout Trace Outliers controller inventory'
)
source_layout_path.write_text(source_layout)

src_readme = src_readme_path.read_text()
src_readme = replace_exact(
    src_readme,
    '`app/trace-explorer-controller.js` owns Trace Explorer inventory rendering, A/B comparison selection/dialog UI and representative trace-sample navigation.\n',
    '`app/trace-explorer-controller.js` owns Trace Explorer inventory rendering, A/B comparison selection/dialog UI and representative trace-sample navigation.\n\n`app/trace-outlier-controller.js` owns Trace Outliers rendering, scope selection and trace-opening coordination while robust ranking stays in `analysis/trace-outliers.js`.\n',
    'src README Trace Outliers controller'
)
src_readme_path.write_text(src_readme)

changelog = changelog_path.read_text()
entry = '''## 2.8.8 — 2026-09-16

### Trace Outliers application boundary
- Extracted Trace Outliers rendering, scope reset and trace-opening actions from the root application into `src/app/trace-outlier-controller.js`.
- Kept robust median/MAD-based duration scoring, explicit-error weighting and service-breadth scoring in `src/analysis/trace-outliers.js`; filtering, selected-log navigation and dialog coordination remain injected callbacks.
- Fixed filtered-scope semantics so an active query with zero matching entries shows an empty Outliers result instead of silently falling back to all loaded logs.
- Captured stable representative entry IDs for rendered trace actions and retained index/trace-ID fallbacks for restored or reordered workspaces.

### Maintainability and verification
- Removed legacy Trace Outliers functions and event listeners from `app.js`, with idempotent event ownership moved into the controller.
- Added isolated controller coverage for zero-result scope behavior, sample resolution, local-only constraints, load order and application integration.
- Extended source-layout, UI-foundation and permanent HTTP quality gates without changing persistence, scoring semantics, network policy or the zero-build deployment model.

'''
if not changelog.startswith('# Changelog\n\n'):
    raise SystemExit('unexpected changelog header')
changelog_path.write_text('# Changelog\n\n' + entry + changelog[len('# Changelog\n\n'):])

print('v2.8.8 Trace Outliers controller migration staged')
