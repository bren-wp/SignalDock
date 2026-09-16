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
write('VERSION', '2.8.13\n')

app = read('app.js')
app = replace_once(app, 'const APP_VERSION = "2.8.12";', 'const APP_VERSION = "2.8.13";', 'app version')
app = replace_once(app, '      map: openServiceMap,', '      map: () => serviceMapController?.open(),', 'map nav')
app = replace_once(app,
'''  let traceOutlierController = null;
  let serviceMatrixController = null;''',
'''  let traceOutlierController = null;
  let serviceMapController = null;
  let serviceMatrixController = null;''', 'service map controller variable')

init_anchor = '''    traceOutlierController.bind();
    if (!window.SignalDockServiceMatrixController?.create) throw new Error("SignalDock Service Matrix controller is unavailable.");'''
init_replacement = '''    traceOutlierController.bind();
    if (!window.SignalDockServiceMapController?.create) throw new Error("SignalDock Service Map controller is unavailable.");
    serviceMapController = window.SignalDockServiceMapController.create({
      state,
      el,
      formatDuration,
      toast,
      applyMapNodeFilter: applyTopologyFilter,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav,
      recordPerformance: (...args) => profiler()?.record?.(...args)
    });
    serviceMapController.bind();
    if (!window.SignalDockServiceMatrixController?.create) throw new Error("SignalDock Service Matrix controller is unavailable.");'''
app = replace_once(app, init_anchor, init_replacement, 'service map controller init')

# Event ownership moves completely into the controller.
app = replace_once(app, '    el.closeServiceMapButton?.addEventListener("click", closeServiceMap);\n', '', 'map close listener')
start = app.index('    el.serviceMapResetButton?.addEventListener("click", () => renderServiceMap(null));')
end = app.index('    el.commandPaletteButton?.addEventListener("click", openCommandPalette);', start)
app = app[:start] + app[end:]

# Root retains only the query mutation callback, with no DOM-node dependency.
start = app.index('\n  function applyMapNodeFilter(node) {')
end = app.index('\n  function quoteIfNeeded(value) {', start)
replacement = '''
  function applyTopologyFilter({ kind = "service", value = "", scopeKind = "", scopeValue = "" } = {}) {
    kind = String(kind || "service");
    value = String(value || "").trim();
    scopeKind = String(scopeKind || "");
    scopeValue = String(scopeValue || "").trim();
    if (!value) return;
    const operator = kind === "environment" ? "env" : kind === "namespace" ? "namespace" : "service";
    const patterns = {
      service: /(?:^|\\s)service:(?:"[^"]+"|[^\\s]+)/gi,
      env: /(?:^|\\s)(?:env|environment):(?:"[^"]+"|[^\\s]+)/gi,
      namespace: /(?:^|\\s)(?:ns|namespace):(?:"[^"]+"|[^\\s]+)/gi
    };
    let cleanQuery = el.queryInput.value.replace(patterns[operator], " ").trim();
    cleanQuery = `${cleanQuery}${cleanQuery ? " " : ""}${operator}:${quoteIfNeeded(value)}`;
    if (scopeKind && scopeValue) {
      const scopeOperator = scopeKind === "environment" ? "env" : "namespace";
      cleanQuery = cleanQuery.replace(patterns[scopeOperator], " ").trim();
      cleanQuery += ` ${scopeOperator}:${quoteIfNeeded(scopeValue)}`;
    }
    el.queryInput.value = cleanQuery.trim();
    applyFilters(true);
    toast(`Applied topology filter: ${el.queryInput.value}.`);
  }
'''
app = app[:start] + replacement + app[end:]

# Remove legacy Service Map UI/render lifecycle from root app.
start = app.index('\n  function openServiceMap() {')
end = app.index('\n  function formatMetricMs(value) {', start)
app = app[:start] + '\n' + app[end:]
write('app.js', app)

# Load controller before dependent app entrypoint.
index = read('index.html')
index = replace_once(index,
'  <script src="src/app/trace-outlier-controller.js" defer></script>\n  <script src="src/app/service-matrix-controller.js" defer></script>',
'  <script src="src/app/trace-outlier-controller.js" defer></script>\n  <script src="src/app/service-map-controller.js" defer></script>\n  <script src="src/app/service-matrix-controller.js" defer></script>', 'index controller order')
write('index.html', index)

# Controller regression coverage.
test = r'''import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controllerPath = path.join(rootDir, "src/app/service-map-controller.js");
const source = fs.readFileSync(controllerPath, "utf8");
const app = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");

assert.ok(html.includes('src/app/service-map-controller.js'), "Service Map controller must load from index.html");
assert.ok(app.includes("SignalDockServiceMapController.create"), "app must initialize Service Map controller");
assert.ok(app.includes("serviceMapController.bind()"), "app must bind Service Map controller");
assert.ok(app.includes("map: () => serviceMapController?.open()"), "map navigation must route through controller");
for (const legacy of ["function openServiceMap()", "function closeServiceMap()", "function renderServiceMap(", "el.serviceMapResetButton?.addEventListener", "el.serviceMapCanvas?.addEventListener"]) {
  assert.ok(!app.includes(legacy), `legacy Service Map ownership remains in app.js: ${legacy}`);
}
for (const token of ["normalizeGroupBy", "No log entries match the current filters", "aria-label", "scopeFiltered", "recordPerformance", "bind", "destroy"]) {
  assert.ok(source.includes(token), `controller missing expected token: ${token}`);
}
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.ok(!source.includes(forbidden), `Service Map controller must remain local-only: ${forbidden}`);
}

function node() {
  return {
    children: [], dataset: {}, attributes: {}, open: false, value: "service",
    replaceChildren(...items) { this.children = [...items]; },
    appendChild(item) { this.children.push(item); return item; },
    append(...items) { this.children.push(...items); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener() {}, removeEventListener() {},
    closest() { return null; }
  };
}
const document = { createElement: () => node(), createElementNS: () => node() };
const buildCalls = [];
const sandbox = {
  self: {
    performance: { now: () => 10 },
    SignalDockServiceMap: {
      GROUP_MODES: ["service", "environment", "namespace", "environment-service", "namespace-service"],
      build(entries, indexes, options) {
        buildCalls.push({ entries, indexes, options });
        return { groupBy: options.groupBy, nodes: [], edges: [], stats: { services: 0, groups: 0, visibleServices: 0, hiddenServices: 0, edges: 0, traces: 0, entries: indexes === null ? entries.length : indexes.length } };
      },
      layout() { return { nodes: [], edges: [], width: 920, height: 500 }; }
    }
  },
  console
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: controllerPath });
const api = sandbox.self.SignalDockServiceMapController;
assert.equal(api.VERSION, 1);
assert.equal(api.normalizeGroupBy("environment-service"), "environment-service");
assert.equal(api.normalizeGroupBy("invalid"), "service");

const state = { entries: [{ service: "api" }, { service: "db" }], filteredIndexes: [], serviceMapGroupBy: "service", serviceGraph: null };
const body = node(); body.ownerDocument = document;
const el = {
  serviceMapCanvas: body,
  serviceMapSummary: node(),
  serviceMapList: node(),
  serviceMapMeta: node(),
  serviceMapDialog: node(),
  serviceMapGroupBy: node(),
  closeServiceMapButton: node(),
  serviceMapResetButton: node()
};
el.serviceMapSummary.ownerDocument = document;
el.serviceMapList.ownerDocument = document;
const controller = api.create({ state, el });
controller.render(true);
assert.ok(Array.isArray(buildCalls.at(-1).indexes), "filtered scope must pass an explicit index list");
assert.equal(buildCalls.at(-1).indexes.length, 0, "zero-result filtered scope must remain empty");
controller.render(false);
assert.equal(buildCalls.at(-1).indexes, null, "all-log scope must use null indexes");
console.log("service-map-controller-smoke PASS");
'''
write('tests/service-map-controller-smoke.mjs', test)

# Source layout requires every application controller.
layout = read('tests/source-layout-smoke.mjs')
layout = replace_once(layout,
'  "src/app/trace-outlier-controller.js",\n  "src/app/service-matrix-controller.js",',
'  "src/app/trace-outlier-controller.js",\n  "src/app/service-map-controller.js",\n  "src/app/service-matrix-controller.js",', 'source layout controller list')
write('tests/source-layout-smoke.mjs', layout)

# UI ownership smoke follows implementation ownership.
ui = read('tests/ui-foundations-smoke.mjs')
ui = replace_once(ui,
'const traceOutlierController = fs.readFileSync(path.join(root, "src/app/trace-outlier-controller.js"), "utf8");\nconst serviceMatrixController =',
'const traceOutlierController = fs.readFileSync(path.join(root, "src/app/trace-outlier-controller.js"), "utf8");\nconst serviceMapController = fs.readFileSync(path.join(root, "src/app/service-map-controller.js"), "utf8");\nconst serviceMatrixController =', 'ui controller read')
ui = replace_once(ui,
'for (const token of ["selectScope", "No log entries match the current filters", "Filter to source service", "Filter to target service", "serviceMatrixScopeFiltered"]) {',
'for (const token of ["normalizeGroupBy", "No log entries match the current filters", "service-map-node", "recordPerformance", "scopeFiltered"]) {\n  if (!serviceMapController.includes(token)) throw new Error(`Missing Service Map controller foundation token: ${token}`);\n}\nfor (const token of ["selectScope", "No log entries match the current filters", "Filter to source service", "Filter to target service", "serviceMatrixScopeFiltered"]) {', 'ui map ownership')
write('tests/ui-foundations-smoke.mjs', ui)

# Documentation/version surfaces.
readme = read('README.md').replace('2.8.12', '2.8.13')
write('README.md', readme)

tech = read('docs/TECHNICAL.md')
tech = replace_once(tech,
'`service-matrix-controller.js` owns Service Matrix rendering, filtered/all-log scope selection and service-filter actions.',
'`service-map-controller.js` owns Service Map SVG/list rendering, grouping controls, filtered/all-log scope selection and topology-filter actions. Explicit parent-span topology aggregation and deterministic layout remain in `src/analysis/service-map.js`; query mutation, dialog coordination and performance recording are injected callbacks. Resetting to all logs remains sticky when grouping changes, and zero-result filtered scopes remain explicitly empty.\n\n`service-matrix-controller.js` owns Service Matrix rendering, filtered/all-log scope selection and service-filter actions.', 'technical map paragraph')
tech = tech.replace('Current version: **2.8.12**.', 'Current version: **2.8.13**.')
write('docs/TECHNICAL.md', tech)

source_layout = read('docs/SOURCE-LAYOUT.md')
source_layout = replace_once(source_layout,
'`trace-outlier-controller.js`, `service-matrix-controller.js`',
'`trace-outlier-controller.js`, `service-map-controller.js`, `service-matrix-controller.js`', 'docs controller list')
write('docs/SOURCE-LAYOUT.md', source_layout)

src_readme = read('src/README.md')
src_readme = replace_once(src_readme,
'`app/service-matrix-controller.js` owns Service Matrix rendering, filtered-scope selection and service-filter coordination while dependency aggregation stays in `analysis/service-matrix.js`.',
'`app/service-map-controller.js` owns Service Map rendering, grouping, scope reset and topology-filter event coordination while topology aggregation/layout stays in `analysis/service-map.js`.\n\n`app/service-matrix-controller.js` owns Service Matrix rendering, filtered-scope selection and service-filter coordination while dependency aggregation stays in `analysis/service-matrix.js`.', 'src readme map entry')
write('src/README.md', src_readme)

changelog = read('CHANGELOG.md')
entry = '''# Changelog\n\n## 2.8.13 — 2026-09-16\n\n### Service Map application boundary\n- Extracted Service Map SVG/list rendering, grouping controls, scope reset and topology-node actions from the root application into `src/app/service-map-controller.js`.\n- Kept explicit parent-span topology aggregation, dimension grouping and deterministic layout in `src/analysis/service-map.js`; query mutation, dialog coordination and performance recording remain injected callbacks.\n- Preserved zero-result filtered scopes as explicit empty topology results and made all-log reset sticky across later grouping changes.\n- Added accessible names to generated SVG topology nodes and list actions while preserving keyboard activation.\n\n### Maintainability and verification\n- Removed legacy Service Map rendering and event listeners from `app.js`, leaving only the narrow topology-query mutation callback in the root application.\n- Added isolated controller coverage for zero-result/all-log scope behavior, local-only constraints, load order and application integration.\n- Extended source-layout, UI-foundation and permanent HTTP quality gates without changing parser, worker, storage, network policy or the zero-build deployment model.\n\n'''
if not changelog.startswith('# Changelog\n\n'):
    raise SystemExit('unexpected changelog header')
changelog = entry + changelog[len('# Changelog\n\n'):]
write('CHANGELOG.md', changelog)

print('v2.8.13 Service Map controller migration staged')
