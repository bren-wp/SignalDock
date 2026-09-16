from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# Canonical version surfaces.
write('VERSION', '2.8.11\n')
app = read('app.js')
app = replace_once(app, 'const APP_VERSION = "2.8.10";', 'const APP_VERSION = "2.8.11";', 'app version')
app = replace_once(app, '  let serviceHeatmapController = null;\n  let caseWorkspaceController = null;', '  let serviceHeatmapController = null;\n  let serviceTrendsController = null;\n  let caseWorkspaceController = null;', 'controller declaration')
app = replace_once(app, '      trends: openServiceTrends,', '      trends: () => serviceTrendsController?.open(),', 'trends nav route')

heatmap_init = '''    serviceHeatmapController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");'''
trends_init = '''    serviceHeatmapController.bind();
    if (!window.SignalDockServiceTrendsController?.create) throw new Error("SignalDock Service Trends controller is unavailable.");
    serviceTrendsController = window.SignalDockServiceTrendsController.create({
      state,
      el,
      formatDuration,
      toast,
      filterByServiceValue,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    serviceTrendsController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");'''
app = replace_once(app, heatmap_init, trends_init, 'Service Trends init')

start = app.find('  function serviceTrendSplitMs(indexes) {')
end = app.find('\n  function makeUiButton(', start)
if start < 0 or end < 0:
    raise SystemExit('Service Trends orchestration block markers not found')
app = app[:start] + app[end + 1:]

legacy_listeners = '''    el.closeServiceTrendsButton?.addEventListener("click", closeServiceTrends);
    el.serviceTrendsResetButton?.addEventListener("click", () => { state.serviceTrendsScopeFiltered = false; renderServiceTrends(false); });
    el.serviceTrendsSplit?.addEventListener("change", () => { state.serviceTrendsSplit = Number(el.serviceTrendsSplit.value) || 0.5; renderServiceTrends(); });
    el.serviceTrendsBody?.addEventListener("click", onServiceTrendsClick);
'''
app = replace_once(app, legacy_listeners, '', 'legacy Service Trends listeners')
write('app.js', app)

# Load order.
index = read('index.html')
index = replace_once(index,
    '  <script src="src/app/service-heatmap-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>',
    '  <script src="src/app/service-heatmap-controller.js" defer></script>\n  <script src="src/app/service-trends-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>',
    'index controller load order')
write('index.html', index)

# README version badge/caption/alt.
readme = read('README.md').replace('2.8.10', '2.8.11')
write('README.md', readme)

# Changelog.
changelog = read('CHANGELOG.md')
entry = '''## 2.8.11 — 2026-09-16

### Dependency Trends application boundary
- Extracted Dependency Trends rendering, split/window controls, scope reset and target-service filter actions from the root application into `src/app/service-trends-controller.js`.
- Kept explicit parent-span period aggregation, trend classification and before/after delta calculations in `src/analysis/service-trends.js`; service filtering and dialog coordination remain injected callbacks.
- Fixed filtered-scope semantics so an active query with zero matching entries produces an empty comparison instead of silently using all loaded logs.
- Normalized comparison split values to the supported 10–90% range and added target-specific accessible names to generated filter actions.

### Maintainability and verification
- Removed legacy Dependency Trends functions and event listeners from `app.js`, with idempotent event ownership moved into the controller.
- Added isolated controller coverage for split normalization, zero-result scope behavior, local-only constraints, load order and application integration.
- Extended source-layout, UI-foundation and permanent HTTP quality gates without changing dependency-analysis semantics, persistence, network policy or the zero-build deployment model.

'''
changelog = replace_once(changelog, '# Changelog\n\n', '# Changelog\n\n' + entry, 'changelog header')
write('CHANGELOG.md', changelog)

# Technical/source documentation.
source_layout = read('docs/SOURCE-LAYOUT.md')
source_layout = replace_once(source_layout,
    '`service-matrix-controller.js`, `service-heatmap-controller.js`, `case-workspace-controller.js`',
    '`service-matrix-controller.js`, `service-heatmap-controller.js`, `service-trends-controller.js`, `case-workspace-controller.js`',
    'source layout controller inventory')
write('docs/SOURCE-LAYOUT.md', source_layout)

technical = read('docs/TECHNICAL.md')
heatmap_paragraph = '`service-heatmap-controller.js` owns Dependency Heatmap rendering, filtered/all-log scope selection and target-service filter actions. Time bucketing and explicit parent-span dependency aggregation remain in `src/analysis/service-heatmap.js`; service filtering and dialog coordination are injected callbacks. Empty filtered results remain an explicit empty heatmap instead of silently falling back to all loaded logs.\n\n'
trends_paragraph = '`service-trends-controller.js` owns Dependency Trends rendering, filtered/all-log scope selection, comparison split controls and target-service filter actions. Period edge aggregation, trend classification and before/after deltas remain in `src/analysis/service-trends.js`; service filtering and dialog coordination are injected callbacks. Empty filtered results remain explicit empty comparisons and split values are normalized to the supported 10–90% range.\n\n'
technical = replace_once(technical, heatmap_paragraph, heatmap_paragraph + trends_paragraph, 'technical controller paragraph')
technical = replace_once(technical, 'Current version: **2.8.10**.', 'Current version: **2.8.11**.', 'technical version')
write('docs/TECHNICAL.md', technical)

src_readme = read('src/README.md')
src_heatmap = '`app/service-heatmap-controller.js` owns Dependency Heatmap rendering, filtered-scope selection and target-service filter coordination while time bucketing stays in `analysis/service-heatmap.js`.\n\n'
src_trends = '`app/service-trends-controller.js` owns Dependency Trends rendering, split/window controls, filtered-scope selection and target-service filter coordination while period comparison stays in `analysis/service-trends.js`.\n\n'
src_readme = replace_once(src_readme, src_heatmap, src_heatmap + src_trends, 'src README controller entry')
write('src/README.md', src_readme)

# Source-layout gate.
source_test = read('tests/source-layout-smoke.mjs')
source_test = replace_once(source_test,
    '  "src/app/service-heatmap-controller.js",\n  "src/app/case-workspace-controller.js",',
    '  "src/app/service-heatmap-controller.js",\n  "src/app/service-trends-controller.js",\n  "src/app/case-workspace-controller.js",',
    'source-layout controller list')
write('tests/source-layout-smoke.mjs', source_test)

# UI foundation ownership gate.
ui_test = read('tests/ui-foundations-smoke.mjs')
ui_test = replace_once(ui_test,
    'const serviceHeatmapController = fs.readFileSync(path.join(root, "src/app/service-heatmap-controller.js"), "utf8");\nconst caseCheckpointController',
    'const serviceHeatmapController = fs.readFileSync(path.join(root, "src/app/service-heatmap-controller.js"), "utf8");\nconst serviceTrendsController = fs.readFileSync(path.join(root, "src/app/service-trends-controller.js"), "utf8");\nconst caseCheckpointController',
    'UI controller read')
ui_heatmap = '''for (const token of ["selectScope", "No log entries match the current filters", "Filter to target service", "dependency-heatmap-cell", "serviceHeatmapScopeFiltered"]) {
  if (!serviceHeatmapController.includes(token)) throw new Error(`Missing Service Heatmap controller foundation token: ${token}`);
}
'''
ui_trends = '''for (const token of ["selectScope", "normalizeSplit", "No log entries match the current filters", "Filter to target service", "serviceTrendsScopeFiltered"]) {
  if (!serviceTrendsController.includes(token)) throw new Error(`Missing Service Trends controller foundation token: ${token}`);
}
'''
ui_test = replace_once(ui_test, ui_heatmap, ui_heatmap + ui_trends, 'UI trends gate')
write('tests/ui-foundations-smoke.mjs', ui_test)

# Isolated controller regression.
trend_test = '''import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const domain = read("src/analysis/service-trends.js");
const source = read("src/app/service-trends-controller.js");
const app = read("app.js");
const index = read("index.html");
const ci = read(".github/workflows/ci.yml");

const sandbox = { self: {}, console };
vm.createContext(sandbox);
vm.runInContext(domain, sandbox, { filename: "service-trends.js" });
vm.runInContext(source, sandbox, { filename: "service-trends-controller.js" });
const api = sandbox.self.SignalDockServiceTrendsController;
assert.equal(api.VERSION, 1);
assert.equal(Object.isFrozen(api), true);
assert.equal(api.normalizeSplit(-1), 0.1);
assert.equal(api.normalizeSplit(2), 0.9);
assert.equal(api.normalizeSplit("bad"), 0.5);

const entries = [
  { id: "p1", service: "api", level: "INFO", timestampMs: 1000, correlations: { span: "p1", trace: "t1" }, traceMeta: { durationMs: 5 } },
  { id: "c1", service: "db", level: "INFO", timestampMs: 1100, correlations: { span: "c1", trace: "t1" }, traceMeta: { parentSpan: "p1", durationMs: 20 } },
  { id: "p2", service: "api", level: "INFO", timestampMs: 3000, correlations: { span: "p2", trace: "t2" }, traceMeta: { durationMs: 6 } },
  { id: "c2", service: "db", level: "ERROR", timestampMs: 3100, correlations: { span: "c2", trace: "t2" }, traceMeta: { parentSpan: "p2", durationMs: 45 } }
];
const emptyFiltered = api.selectScope(entries, [], true);
assert.equal(emptyFiltered.filtered, true, "zero-result active filters must stay filtered");
assert.equal(Array.isArray(emptyFiltered.indexes), true);
assert.equal(emptyFiltered.indexes.length, 0);
const fullFiltered = api.selectScope(entries, [0, 1, 2, 3], true);
assert.equal(fullFiltered.filtered, false, "full-result filters may reuse all-log analysis");
assert.equal(fullFiltered.indexes, null);
assert.equal(api.splitTimestamp(entries, null, 0.5), 2050);
assert.equal(api.splitTimestamp(entries, [], 0.5), null);

function node(tag) {
  return {
    tag,
    className: "",
    textContent: "",
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
  serviceTrendsData: sandbox.self.SignalDockServiceTrends.compare(entries),
  serviceTrendsScopeFiltered: true,
  serviceTrendsSplit: 0.5
};
const controller = api.create({ state, el: { serviceTrendsBody: body }, formatDuration: String });
const emptyData = controller.render(true);
assert.equal(emptyData.rows.length, 0, "filtered zero-result render must analyze zero entries");
assert.equal(body.children[0].children[0].textContent, "No log entries match the current filters.");

for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(source.includes(forbidden), false, `Service Trends controller must stay local-only and capability-narrow: ${forbidden}`);
}
assert.ok(source.includes('setAttribute("aria-label", `Filter to target service'), "trend actions must expose target-service labels");
assert.ok(index.includes('src/app/service-trends-controller.js'), "Service Trends controller must load from index.html");
assert.ok(ci.includes('src/app/service-trends-controller.js'), "CI must HTTP-smoke the Service Trends controller");
for (const token of [
  "SignalDockServiceTrendsController.create",
  "serviceTrendsController.bind()",
  "trends: () => serviceTrendsController?.open()"
]) assert.ok(app.includes(token), `Service Trends app integration token missing: ${token}`);
for (const legacy of [
  "function serviceTrendSplitMs(",
  "function openServiceTrends()",
  "function renderServiceTrends(",
  "function onServiceTrendsClick("
]) assert.equal(app.includes(legacy), false, `legacy Service Trends orchestration must leave app.js: ${legacy}`);
console.log("service-trends-controller-smoke PASS");
'''
write('tests/service-trends-controller-smoke.mjs', trend_test)

print('v2.8.11 Service Trends controller migration staged')
