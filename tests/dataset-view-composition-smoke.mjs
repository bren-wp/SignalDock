import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const source = read("src/app/dataset-view-composition.js");

assert.ok(html.includes("src/app/dataset-view-composition.js"));
assert.ok(html.indexOf("src/app/dataset-view-composition.js") < html.indexOf("app.js"));
assert.ok(app.includes("SignalDockDatasetViewComposition.create"));
for (const token of [
  "datasetViewComposition.createSavedViews()",
  "datasetViewComposition.createDatasetFilter()",
  "datasetViewComposition.createTableView()",
  "datasetViewComposition.createDatasetOverview()",
  "datasetViewComposition.createViewOrchestrator()"
]) assert.ok(app.includes(token), "app composition call missing: " + token);

for (const token of [
  "SignalDockStorageAdapter", "SignalDockPersistence", "localStorage", "sessionStorage",
  "indexedDB", "showOpenFilePicker", "new Worker", ".postMessage(", "XMLHttpRequest",
  "WebSocket", "EventSource", ".invoke("
]) assert.ok(!source.includes(token), "forbidden Dataset View composition capability: " + token);
assert.ok(!/\bfetch\s*\(/.test(source));

const created = {};
const optionsByName = {};
function moduleFor(name, extra = {}) {
  return {
    create(options) {
      created[name] = (created[name] || 0) + 1;
      optionsByName[name] = options;
      return Object.freeze({ name, ...extra });
    }
  };
}

const modules = {
  savedViews: moduleFor("savedViews", { render(){}, bind(){} }),
  datasetFilter: moduleFor("datasetFilter", {
    rebuildFilterIndex(){ return ["rebuild"]; },
    refreshFilters(){ return ["refresh"]; },
    setControlsEnabled(){},
    applyFilters(){ return ["apply"]; },
    bind(){}
  }),
  tableView: moduleFor("tableView", { renderTable(){}, bind(){} }),
  datasetOverview: moduleFor("datasetOverview", {
    updateStats(){},
    renderTimeline(){},
    updateActiveSourceUI(){},
    bind(){}
  }),
  viewOrchestrator: moduleFor("viewOrchestrator", {})
};

const state = {
  entries:[{ level:"ERROR" }],
  serviceGraph:{old:true},
  exceptionGroups:[],
  exceptionTrends:null,
  healthData:null,
  serviceMatrixData:null,
  serviceHeatmapData:null,
  serviceTrendsData:null,
  traceExplorerData:null,
  traceOutlierData:null
};
const el = {};
const document = { defaultView:{ innerWidth:1200 }, querySelectorAll(){ return []; } };
const calls = [];
const filterWorker = { canUseWorker(){ return true; }, requestFilter(payload){ calls.push(["worker",payload]); return true; } };
const traceController = { reconcileSelection(value){ calls.push(["trace",value]); } };
const inspector = { render(){ calls.push(["inspector"]); } };
const host = { document };
vm.runInNewContext(source, { self:host, window:host, console, Object, Date }, { filename:"dataset-view-composition.js" });

const composition = host.SignalDockDatasetViewComposition.create({
  state,
  el,
  ownerDocument:document,
  ownerWindow:document.defaultView,
  modules,
  services:{
    utils:{
      debounce:(fn)=>fn,
      shortSource:(value)=>"short:"+value,
      formatTime:(value)=>"time:"+value,
      formatBytes:(value)=>"bytes:"+value
    },
    engine:{
      parseSmartQuery:(query)=>({query}),
      filterIndexes:()=>({indexes:[0],parsed:{invalid:[]}})
    },
    getProfiler:()=>({ record:(name,elapsed,meta)=>calls.push(["perf",name,elapsed,meta]) }),
    analysis:{
      exceptionGroups:{ candidate:()=>true, fingerprint:()=>"fp", group:()=>[{id:"eg"}] },
      exceptionTrends:{ analyze:()=>({trend:true}) },
      serviceHealth:{ analyze:()=>({health:true}) },
      serviceMatrix:{ build:()=>({matrix:true}) },
      serviceHeatmap:{ build:()=>({heatmap:true}) },
      serviceTrends:{ compare:()=>({trends:true}) },
      traceExplorer:{ buildWindow:()=>({trace:true}) },
      traceOutliers:{ rank:()=>({outliers:true}) },
      virtualViewport:{ calculate:()=>({start:0,end:1}) }
    }
  },
  actions:{
    persistSavedViews:()=>calls.push(["persist"]),
    requestSavedViewName:()=>"View",
    createViewId:()=>"view-1",
    syncLevelChips:()=>calls.push(["chips"]),
    applyFilters:()=>calls.push(["applyFilters"]),
    toast:()=>{},
    ensurePageInRange:()=>{},
    renderDataViews:()=>{},
    scheduleViewAutosave:()=>{},
    updateStats:()=>{},
    renderSourceNavigation:()=>{},
    selectEntry:()=>{},
    getSources:()=>["a.log"],
    scheduleFrame:(fn)=>fn(),
    now:()=>10
  },
  getters:{
    getFilterWorker:()=>filterWorker,
    getTraceExplorerController:()=>traceController,
    getInspectorController:()=>inspector
  }
});

assert.ok(Object.isFrozen(composition));
assert.equal(composition.createSavedViews(), composition.createSavedViews());
assert.equal(created.savedViews, 1);
assert.equal(composition.createDatasetFilter(), composition.createDatasetFilter());
assert.equal(created.datasetFilter, 1);
assert.equal(optionsByName.datasetFilter.shouldUseWorkerFilter(), true);
assert.equal(optionsByName.datasetFilter.requestWorkerFilter({requestId:1}), true);
optionsByName.datasetFilter.refreshDerivedAnalysis();
assert.equal(state.serviceGraph, null);
assert.equal(state.exceptionGroups.length, 1);
assert.equal(state.exceptionTrends.trend, true);
assert.equal(state.healthData.health, true);
assert.equal(state.serviceMatrixData.matrix, true);
assert.equal(state.serviceHeatmapData.heatmap, true);
assert.equal(state.serviceTrendsData.trends, true);
assert.equal(state.traceExplorerData.trace, true);
assert.equal(state.traceOutlierData.outliers, true);
assert.ok(calls.some((item)=>item[0]==="trace"));

assert.equal(composition.createTableView(), composition.createTableView());
assert.equal(created.tableView, 1);
assert.equal(composition.createDatasetOverview(), composition.createDatasetOverview());
assert.equal(created.datasetOverview, 1);
assert.equal(composition.createViewOrchestrator(), composition.createViewOrchestrator());
assert.equal(created.viewOrchestrator, 1);

optionsByName.viewOrchestrator.renderInspector();
assert.ok(calls.some((item)=>item[0]==="inspector"));
console.log("dataset-view-composition-smoke PASS");
