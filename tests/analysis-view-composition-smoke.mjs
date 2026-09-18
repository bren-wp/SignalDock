import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/app/analysis-view-composition.js"), "utf8");
const host = {};
vm.runInNewContext(source, { self: host, window: host, Object, console }, { filename: "analysis-view-composition.js" });

const api = host.SignalDockAnalysisViewComposition;
assert.equal(api.VERSION, 1);
assert.equal(Object.isFrozen(api), true);

const created = {};
const optionsByName = {};
function moduleFor(name) {
  return {
    create(options) {
      created[name] = (created[name] || 0) + 1;
      optionsByName[name] = options;
      return Object.freeze({ name });
    }
  };
}
const modules = {
  traceExplorer: moduleFor("traceExplorer"),
  traceOutlier: moduleFor("traceOutlier"),
  serviceMap: moduleFor("serviceMap"),
  serviceMatrix: moduleFor("serviceMatrix"),
  serviceHeatmap: moduleFor("serviceHeatmap"),
  serviceTrends: moduleFor("serviceTrends"),
  health: moduleFor("health")
};
const noop = () => {};
const actions = {
  formatDuration: String,
  toast: noop,
  selectEntry: noop,
  renderInspector: noop,
  entryRowIntoView: noop,
  filterByCorrelation: noop,
  applyTraceFilter: noop,
  applyTopologyFilter: noop,
  filterByServiceValue: noop,
  closeCompetingDialogs: noop,
  showDialogSafely: () => true,
  setActiveNav: noop,
  recordPerformance: noop
};

const composition = api.create({ state: { entries: [] }, el: {}, modules, actions });
assert.equal(Object.isFrozen(composition), true);

for (const [name, factory] of [
  ["traceExplorer", "createTraceExplorer"],
  ["traceOutlier", "createTraceOutlier"],
  ["serviceMap", "createServiceMap"],
  ["serviceMatrix", "createServiceMatrix"],
  ["serviceHeatmap", "createServiceHeatmap"],
  ["serviceTrends", "createServiceTrends"],
  ["health", "createHealth"]
]) {
  assert.equal(composition[factory](), composition[factory](), factory + " must memoize");
  assert.equal(created[name], 1, factory + " must create exactly once");
}

assert.equal(optionsByName.traceExplorer.entryRowIntoView, actions.entryRowIntoView);
assert.equal(optionsByName.traceOutlier.applyTraceFilter, actions.applyTraceFilter);
assert.equal(optionsByName.serviceMap.applyMapNodeFilter, actions.applyTopologyFilter);
assert.equal(optionsByName.serviceMap.recordPerformance, actions.recordPerformance);
for (const name of ["serviceMatrix", "serviceHeatmap", "serviceTrends", "health"]) {
  assert.equal(optionsByName[name].filterByServiceValue, actions.filterByServiceValue);
}

console.log("analysis-view-composition-smoke PASS");
