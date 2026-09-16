import fs from "node:fs";
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
  el: { traceExplorerDialog: { ownerDocument: {} }, traceCompareButton: compareButton },
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
