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
controller_test_path = root / 'tests' / 'trace-explorer-controller-smoke.mjs'
controller_path = root / 'src' / 'app' / 'trace-explorer-controller.js'
ci_path = root / '.github' / 'workflows' / 'ci.yml'

if not controller_path.exists():
    raise SystemExit('Trace Explorer controller must exist before migration')
if 'src/app/trace-explorer-controller.js' not in ci_path.read_text():
    raise SystemExit('Permanent CI must verify the Trace Explorer controller asset before migration')

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.8.6";', 'const APP_VERSION = "2.8.7";', 'app version')
app = replace_exact(
    app,
    '  let investigationController = null;\n  let exceptionController = null;\n  let caseWorkspaceController = null;\n',
    '  let investigationController = null;\n  let exceptionController = null;\n  let traceExplorerController = null;\n  let caseWorkspaceController = null;\n',
    'Trace Explorer controller state slot'
)
app = replace_exact(
    app,
    '      traces: openTraceExplorer,\n',
    '      traces: () => traceExplorerController?.open(),\n',
    'Trace Explorer navigation dispatch'
)

init_anchor = '''    exceptionController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
init_replacement = '''    exceptionController.bind();
    if (!window.SignalDockTraceExplorerController?.create) throw new Error("SignalDock Trace Explorer controller is unavailable.");
    traceExplorerController = window.SignalDockTraceExplorerController.create({
      state,
      el,
      formatDuration,
      toast,
      selectEntry,
      renderInspector,
      entryRowIntoView,
      filterByCorrelation,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    traceExplorerController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
app = replace_exact(app, init_anchor, init_replacement, 'Trace Explorer controller initialization')

trace_events = '''    el.closeTraceExplorerButton?.addEventListener("click", closeTraceExplorer);
    el.traceExplorerResetButton?.addEventListener("click", () => { state.traceExplorerScopeFiltered = false; renderTraceExplorer(false); });
    el.traceExplorerBody?.addEventListener("click", onTraceExplorerClick);
    el.traceCompareButton?.addEventListener("click", openTraceComparison);
    el.closeTraceCompareButton?.addEventListener("click", closeTraceComparison);
'''
app = replace_exact(app, trace_events, '', 'Trace Explorer event ownership')

block_start = app.find('  function openTraceExplorer() {')
block_end = app.find('  function openTraceOutliers() {', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('Trace Explorer application block not found')
app = app[:block_start] + app[block_end:]

selection_block = '''    const traceIds = new Set((state.traceExplorerData?.rows || []).map((row) => row.traceId));
    state.traceCompareSelection = state.traceCompareSelection.filter((id) => traceIds.has(id)).slice(-2);
    if (el.traceCompareButton) { el.traceCompareButton.disabled = state.traceCompareSelection.length !== 2; el.traceCompareButton.textContent = `Compare selected (${state.traceCompareSelection.length}/2)`; }
'''
app = replace_exact(
    app,
    selection_block,
    '    traceExplorerController?.reconcileSelection(state.traceExplorerData);\n',
    'Trace Explorer selection reconciliation'
)

for forbidden in [
    'function openTraceExplorer()',
    'function closeTraceExplorer()',
    'function renderTraceExplorer(',
    'function onTraceExplorerClick(',
    'function openTraceComparison()',
    'function closeTraceComparison()',
    'function renderTraceComparison(',
    'el.traceExplorerBody?.addEventListener',
    'el.traceCompareButton?.addEventListener'
]:
    if forbidden in app:
        raise SystemExit(f'legacy Trace Explorer UI wiring remains: {forbidden}')
app_path.write_text(app)

index = index_path.read_text()
index = replace_exact(
    index,
    '  <script src="src/app/exception-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    '  <script src="src/app/exception-controller.js" defer></script>\n  <script src="src/app/trace-explorer-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    'Trace Explorer controller script order'
)
index_path.write_text(index)

source_test = source_layout_test_path.read_text()
source_test = replace_exact(
    source_test,
    '  "src/app/exception-controller.js",\n  "src/app/case-workspace-controller.js",\n',
    '  "src/app/exception-controller.js",\n  "src/app/trace-explorer-controller.js",\n  "src/app/case-workspace-controller.js",\n',
    'source layout Trace Explorer controller inventory'
)
source_layout_test_path.write_text(source_test)

ui_test = ui_foundations_path.read_text()
ui_test = replace_exact(
    ui_test,
    'const exceptionController = fs.readFileSync(path.join(root, "src/app/exception-controller.js"), "utf8");\nconst caseCheckpointController',
    'const exceptionController = fs.readFileSync(path.join(root, "src/app/exception-controller.js"), "utf8");\nconst traceExplorerController = fs.readFileSync(path.join(root, "src/app/trace-explorer-controller.js"), "utf8");\nconst caseCheckpointController',
    'UI foundation Trace Explorer controller source'
)
ui_test = replace_exact(
    ui_test,
    'for (const token of ["composeFingerprintQuery", "resolveSampleEntry", "sampleIds", "exception-trend-badge"]) {\n  if (!exceptionController.includes(token)) throw new Error(`Missing Exception controller foundation token: ${token}`);\n}\n',
    'for (const token of ["composeFingerprintQuery", "resolveSampleEntry", "sampleIds", "exception-trend-badge"]) {\n  if (!exceptionController.includes(token)) throw new Error(`Missing Exception controller foundation token: ${token}`);\n}\nfor (const token of ["resolveSampleEntry", "traceSampleId", "aria-pressed", "renderComparison", "reconcileSelection"]) {\n  if (!traceExplorerController.includes(token)) throw new Error(`Missing Trace Explorer controller foundation token: ${token}`);\n}\n',
    'UI foundation Trace Explorer controller assertions'
)
ui_foundations_path.write_text(ui_test)

controller_test_path.write_text(r'''import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const explorerDomain = read("src/analysis/trace-explorer.js");
const compareDomain = read("src/analysis/trace-compare.js");
const source = read("src/app/trace-explorer-controller.js");
const app = read("app.js");
const index = read("index.html");
const ci = read(".github/workflows/ci.yml");

const sandbox = { self: {}, console };
vm.createContext(sandbox);
vm.runInContext(explorerDomain, sandbox, { filename: "trace-explorer.js" });
vm.runInContext(compareDomain, sandbox, { filename: "trace-compare.js" });
vm.runInContext(source, sandbox, { filename: "trace-explorer-controller.js" });
const api = sandbox.self.SignalDockTraceExplorerController;
assert.equal(api.VERSION, 1);
assert.equal(api.cleanTraceId("  trace-123  "), "trace-123");
assert.equal(Object.isFrozen(api), true);

const stable = { id: "stable-id", globalIndex: 8, correlations: { trace: "trace-stable" } };
const indexed = { id: "indexed-id", globalIndex: 1, correlations: { trace: "trace-index" } };
const fallback = { id: "fallback-id", globalIndex: 2, correlations: { trace: "trace-fallback" } };
const compareButton = { disabled: true, textContent: "" };
const state = {
  entries: [null, indexed, fallback, stable],
  filteredIndexes: [],
  traceExplorerData: { rows: [{ traceId: "trace-index" }, { traceId: "trace-fallback" }] },
  traceExplorerScopeFiltered: true,
  traceCompareSelection: ["missing", "trace-index", "trace-fallback"],
  inspectorTab: "details"
};
const noop = () => {};
const controller = api.create({
  state,
  el: { traceExplorerBody: { ownerDocument: {} }, traceCompareButton: compareButton },
  formatDuration: String,
  toast: noop,
  selectEntry: noop,
  renderInspector: noop,
  entryRowIntoView: noop,
  filterByCorrelation: noop,
  closeCompetingDialogs: noop,
  showDialogSafely: noop,
  setActiveNav: noop
});
assert.equal(controller.resolveSampleEntry({ sampleId: "stable-id", sampleIndex: 1, traceId: "trace-index" }), stable, "stable entry ID must win over a stale sample index");
assert.equal(controller.resolveSampleEntry({ sampleId: "missing", sampleIndex: 1, traceId: "trace-fallback" }), indexed, "sample index fallback should remain supported");
assert.equal(controller.resolveSampleEntry({ sampleId: "missing", sampleIndex: 99, traceId: "trace-fallback" }), fallback, "trace ID fallback should recover a representative entry");
assert.equal(controller.resolveSampleEntry({ sampleId: "missing", sampleIndex: 99, traceId: "unknown" }), null);
assert.deepEqual([...controller.reconcileSelection(state.traceExplorerData)], ["trace-index", "trace-fallback"]);
assert.equal(compareButton.disabled, false);
assert.equal(compareButton.textContent, "Compare selected (2/2)");
controller.toggleComparison("trace-index");
assert.deepEqual([...state.traceCompareSelection], ["trace-fallback"]);
assert.equal(compareButton.disabled, true);

for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(source.includes(forbidden), false, `Trace Explorer controller must stay local-only and capability-narrow: ${forbidden}`);
}
assert.ok(index.includes('src/app/trace-explorer-controller.js'), "Trace Explorer controller must load from index.html");
assert.ok(ci.includes('src/app/trace-explorer-controller.js'), "CI must HTTP-smoke the Trace Explorer controller");
for (const token of [
  "SignalDockTraceExplorerController.create",
  "traceExplorerController.bind()",
  "traces: () => traceExplorerController?.open()",
  "traceExplorerController?.reconcileSelection(state.traceExplorerData)"
]) assert.ok(app.includes(token), `Trace Explorer app integration token missing: ${token}`);
for (const legacy of [
  "function openTraceExplorer()",
  "function renderTraceExplorer(",
  "function onTraceExplorerClick(",
  "function openTraceComparison()",
  "function renderTraceComparison("
]) assert.equal(app.includes(legacy), false, `legacy Trace Explorer orchestration must leave app.js: ${legacy}`);
console.log("trace-explorer-controller-smoke PASS");
''')

version_path.write_text('2.8.7\n')

readme = readme_path.read_text()
if readme.count('2.8.6') != 3:
    raise SystemExit(f'README version references: expected 3, found {readme.count("2.8.6")}')
readme = readme.replace('2.8.6', '2.8.7')
readme = replace_exact(
    readme,
    '- feature-level Exception controller under `src/app/` that owns recurring-failure rendering, fingerprint filtering and representative-sample actions while exception grouping/trend analysis remains in `src/analysis/`\n',
    '- feature-level Exception controller under `src/app/` that owns recurring-failure rendering, fingerprint filtering and representative-sample actions while exception grouping/trend analysis remains in `src/analysis/`\n- feature-level Trace Explorer controller under `src/app/` that owns distributed-trace inventory, A/B comparison selection and trace-sample navigation while trace aggregation/comparison remains in `src/analysis/`\n',
    'README Trace Explorer controller feature'
)
readme_path.write_text(readme)

technical = technical_path.read_text()
technical = replace_exact(technical, 'Current version: **2.8.6**.', 'Current version: **2.8.7**.', 'technical current version')
technical = replace_exact(
    technical,
    '`exception-controller.js` owns Exception Explorer rendering, deterministic fingerprint query coordination and representative-sample actions. Grouping and trend classification remain in `src/analysis/exception-groups.js` and `src/analysis/exception-trends.js`; log filtering, evidence pinning and selected-log navigation are injected callbacks. Sample resolution prefers stable entry IDs before index and fingerprint fallbacks so restored workspaces do not depend on stale array positions.\n',
    '`exception-controller.js` owns Exception Explorer rendering, deterministic fingerprint query coordination and representative-sample actions. Grouping and trend classification remain in `src/analysis/exception-groups.js` and `src/analysis/exception-trends.js`; log filtering, evidence pinning and selected-log navigation are injected callbacks. Sample resolution prefers stable entry IDs before index and fingerprint fallbacks so restored workspaces do not depend on stale array positions.\n\n`trace-explorer-controller.js` owns distributed Trace Explorer rendering, two-trace comparison selection/dialog coordination and representative trace-sample navigation. Trace inventory and A/B comparison calculations remain in `src/analysis/trace-explorer.js` and `src/analysis/trace-compare.js`; filtering, inspector rendering and dialog coordination are injected callbacks. Sample navigation prefers a stable entry ID before index and explicit trace-ID fallbacks.\n',
    'technical Trace Explorer controller boundary'
)
technical_path.write_text(technical)

source_layout = source_layout_path.read_text()
source_layout = replace_exact(
    source_layout,
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `investigation-controller.js`, `exception-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `investigation-controller.js`, `exception-controller.js`, `trace-explorer-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'source layout Trace Explorer controller inventory'
)
source_layout_path.write_text(source_layout)

src_readme = src_readme_path.read_text()
src_readme = replace_exact(
    src_readme,
    '`app/exception-controller.js` owns recurring-failure rendering, fingerprint-filter actions and representative exception sample navigation/pinning.\n',
    '`app/exception-controller.js` owns recurring-failure rendering, fingerprint-filter actions and representative exception sample navigation/pinning.\n\n`app/trace-explorer-controller.js` owns Trace Explorer inventory rendering, A/B comparison selection/dialog UI and representative trace-sample navigation.\n',
    'src README Trace Explorer controller'
)
src_readme_path.write_text(src_readme)

changelog = changelog_path.read_text()
entry = '''## 2.8.7 — 2026-09-16

### Trace Explorer application boundary
- Extracted distributed Trace Explorer inventory rendering, scope reset, row actions and two-trace comparison UI from the root application into `src/app/trace-explorer-controller.js`.
- Kept trace inventory and A/B comparison calculations in `src/analysis/trace-explorer.js` and `src/analysis/trace-compare.js`; filtering, inspector navigation and dialog coordination are explicit injected callbacks.
- Hardened representative trace navigation to prefer the stable entry ID captured at render time before sample-index and explicit trace-ID fallbacks.
- Added explicit pressed-state semantics and trace-specific accessible names to comparison/open actions while preserving the two-selection FIFO behavior.

### Maintainability and verification
- Removed legacy Trace Explorer/Trace Compare functions and event listeners from `app.js`; dataset rebuilds now reconcile compare selection through the controller boundary.
- Added an isolated Trace Explorer controller smoke test covering stable-ID resolution, selection reconciliation, local-only constraints, load order and application integration.
- Extended source-layout, UI-foundation and permanent HTTP quality gates so the controller is a required production asset without introducing a bundler, backend or persistence change.

'''
changelog = replace_exact(changelog, '## 2.8.6 — 2026-09-16\n', entry + '## 2.8.6 — 2026-09-16\n', 'CHANGELOG 2.8.7 entry')
changelog_path.write_text(changelog)

print('v2.8.7 Trace Explorer controller migration staged')
