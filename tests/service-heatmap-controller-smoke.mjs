import fs from "node:fs";
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
const partialIndexes = [0];
const partialFiltered = api.selectScope(entries, partialIndexes, true);
assert.equal(partialFiltered.filtered, true);
assert.equal(partialFiltered.indexes, partialIndexes, "filtered Heatmap scope must reuse the read-only index array");
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
