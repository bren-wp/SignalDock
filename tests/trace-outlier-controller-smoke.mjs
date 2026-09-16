import fs from "node:fs";
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
