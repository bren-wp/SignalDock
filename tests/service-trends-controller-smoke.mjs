import fs from "node:fs";
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
assert.equal(api.normalizeSplit(null), 0.5);
assert.equal(api.normalizeSplit(undefined), 0.5);
assert.equal(api.normalizeSplit(""), 0.5);

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
const partialIndexes = [0, 1];
const partialFiltered = api.selectScope(entries, partialIndexes, true);
assert.equal(partialFiltered.filtered, true);
assert.equal(partialFiltered.indexes, partialIndexes, "filtered Trends scope must reuse the read-only index array");
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
