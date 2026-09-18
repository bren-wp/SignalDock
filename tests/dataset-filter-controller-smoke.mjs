import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const controllerSource = read("src/app/dataset-filter-controller.js");
const compositionSource = read("src/app/dataset-view-composition.js");

assert.ok(html.includes('src/app/dataset-filter-controller.js'), "Dataset Filter controller missing from index.html");
assert.ok(html.indexOf('src/app/dataset-filter-controller.js') < html.indexOf('app.js'), "Dataset Filter controller must load before app.js");
assert.ok(compositionSource.includes("modules.datasetFilter.create"), "composition module create wiring missing: datasetFilter");
assert.ok(app.includes("datasetFilter: window.SignalDockDatasetFilterController"), "root composition module mapping missing: datasetFilter");
assert.ok(app.includes("datasetViewComposition.createDatasetFilter()"), "root composition call missing: datasetViewComposition.createDatasetFilter()");
assert.ok(app.includes("datasetFilterController.bind();"), "Dataset Filter controller bind() missing");

for (const token of [
  'el.queryInput.addEventListener("input"',
  'el.levelFilter.addEventListener("change"',
  'el.sourceFilter.addEventListener("change"',
  'el.timeFilter.addEventListener("change"',
  'el.sortFilter.addEventListener("change"',
  'el.levelChips.addEventListener("click"',
  'el.resetButton.addEventListener("click", resetFilters)',
  'el.fileTabs.addEventListener("click"',
  'el.sourceList.addEventListener("click"'
]) assert.ok(!app.includes(token), `root still owns filter UI listener: ${token}`);

for (const token of [
  "rebuildFilterIndex",
  "currentFilterRequest",
  "applyFilters",
  "applyFilteredIndexes",
  "updateQueryValidity",
  "resetFilters",
  "setControlsEnabled",
  "refreshFilters",
  "getSources",
  "function bind()",
  "function destroy()"
]) assert.ok(controllerSource.includes(token), `controller missing ownership token: ${token}`);

for (const token of [
  "SignalDockQueryEngine",
  "SignalDockExceptionGroups",
  "SignalDockExceptionTrends",
  "SignalDockServiceHealth",
  "SignalDockServiceMatrix",
  "SignalDockServiceHeatmap",
  "SignalDockServiceTrends",
  "SignalDockTraceExplorer",
  "SignalDockTraceOutliers",
  "SignalDockPersistence",
  "SignalDockStorageAdapter",
  "showOpenFilePicker",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "new Worker",
  ".postMessage(",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  ".invoke("
]) assert.ok(!controllerSource.includes(token), `forbidden capability reference in Dataset Filter controller: ${token}`);
assert.ok(!/\bfetch\s*\(/.test(controllerSource), "Dataset Filter controller must not use fetch()");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
  toggle(name, force) {
    if (force === undefined) {
      if (this.values.has(name)) this.values.delete(name);
      else this.values.add(name);
      return;
    }
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
  contains(name) { return this.values.has(name); }
}

class FakeNode {
  constructor(document) {
    this.ownerDocument = document;
    this.value = "";
    this.disabled = false;
    this.textContent = "";
    this.title = "";
    this.scrollTop = 99;
    this.dataset = {};
    this.options = [];
    this.selectedIndex = 0;
    this.children = [];
    this.listeners = new Map();
    this.classList = new FakeClassList();
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  replaceChildren(...nodes) {
    this.children = [...nodes];
    this.options = [...nodes];
  }
}

const document = {
  body: new FakeNode(null),
  createElement(tag) {
    const node = new FakeNode(document);
    node.tagName = String(tag).toUpperCase();
    return node;
  }
};
document.body.ownerDocument = document;

const rootGlobal = { document };
vm.runInNewContext(controllerSource, { self: rootGlobal, window: rootGlobal, console }, { filename: "dataset-filter-controller.js" });

const select = (value = "") => {
  const node = new FakeNode(document);
  node.value = value;
  return node;
};

const el = {
  queryInput: new FakeNode(document),
  levelFilter: select(""),
  sourceFilter: select(""),
  timeFilter: select(""),
  sortFilter: select("original"),
  levelChips: new FakeNode(document),
  resetButton: new FakeNode(document),
  fileTabs: new FakeNode(document),
  sourceList: new FakeNode(document),
  resultsSummary: new FakeNode(document),
  logTable: new FakeNode(document),
  saveViewButton: new FakeNode(document),
  exportButton: new FakeNode(document),
  workspaceSaveButton: new FakeNode(document),
  clearAllButton: new FakeNode(document),
  pageSize: new FakeNode(document),
  renderMode: new FakeNode(document)
};
el.queryInput.value = "timeout";

const state = {
  entries: [
    { level: "ERROR", source: "api.log", service: "api", message: "timeout", timestamp: "2026-09-18T10:00:00Z", searchText: "timeout", correlations: { traceId: "t1" }, dimensions: { env: "prod" } },
    { level: "WARN", source: "worker.log", service: "worker", message: "slow", timestampMs: 2000, searchText: "slow" },
    { level: "INFO", source: "api.log", service: "api", message: "ok", timestampMs: 3000, searchText: "ok" }
  ],
  filterEntries: [],
  filteredIndexes: [],
  filterRequestId: 0,
  page: 4,
  renderMode: "virtual",
  settings: { showUnknown: true, useWorker: true },
  latestTimestampMs: null,
  summary: { sources: [] },
  lastEngine: ""
};

let derivedRefreshes = 0;
let ensureCalls = 0;
let renderCalls = 0;
let autosaves = 0;
let statsCalls = 0;
let sourceNavCalls = 0;
let recorded = null;
let workerPayload = null;
let shouldWorker = false;
let clock = 10;

const controller = rootGlobal.SignalDockDatasetFilterController.create({
  state,
  el,
  ownerDocument: document,
  debounce: (fn) => fn,
  parseSmartQuery: (query) => ({ query, invalid: [] }),
  filterIndexes: (entries, request) => ({
    indexes: entries.map((_, index) => index).filter((index) => !request.query || entries[index].searchText.includes(request.query)),
    parsed: { invalid: [] }
  }),
  shouldUseWorkerFilter: () => shouldWorker,
  requestWorkerFilter: (payload) => { workerPayload = payload; },
  now: () => { clock += 1.25; return clock; },
  recordPerformance: (elapsed, meta) => { recorded = { elapsed, meta }; },
  getExceptionFingerprint: (entry) => entry.level === "ERROR" ? "fp-timeout" : "",
  refreshDerivedAnalysis: () => { derivedRefreshes += 1; },
  syncLevelChips: () => {},
  ensurePageInRange: () => { ensureCalls += 1; },
  renderDataViews: () => { renderCalls += 1; },
  scheduleViewAutosave: () => { autosaves += 1; },
  updateStats: () => { statsCalls += 1; },
  renderSourceNavigation: () => { sourceNavCalls += 1; },
  getShortSource: (source) => source.replace(".log", "")
});

controller.bind();
controller.bind();
assert.equal(el.queryInput.listeners.get("input").size, 1, "bind() must be idempotent");
assert.equal(el.levelFilter.listeners.get("change").size, 1, "level listener must be singular");
assert.equal(el.fileTabs.listeners.get("click").size, 1, "source-tab listener must be singular");

controller.rebuildFilterIndex();
assert.equal(state.filterEntries.length, 3);
assert.equal(state.summary.total, 3);
assert.equal(state.summary.errors, 1);
assert.equal(state.summary.warnings, 1);
assert.deepEqual(Array.from(state.summary.sources), ["api.log", "worker.log"]);
assert.equal(state.summary.sourceCounts.get("api.log"), 2);
assert.equal(state.summary.serviceCounts.get("api"), 2);
assert.equal(state.entries[0].exceptionFingerprint, "fp-timeout");
assert.equal(derivedRefreshes, 1);

const mainResult = controller.applyFilters(true);
assert.equal(mainResult.engine, "main");
assert.deepEqual(Array.from(state.filteredIndexes), [0]);
assert.equal(state.page, 1);
assert.equal(el.logTable.scrollTop, 0);
assert.equal(ensureCalls, 1);
assert.equal(renderCalls, 1);
assert.equal(autosaves, 1);
assert.equal(recorded.meta.engine, "main");
assert.ok(state.lastEngine.startsWith("main · "));
assert.equal(document.body.classList.contains("filtering-active"), false);

controller.refreshFilters();
assert.equal(el.sourceFilter.options.length, 3);
assert.equal(el.sourceFilter.options[0].value, "");
assert.equal(el.sourceFilter.options[1].textContent, "api");
assert.equal(statsCalls, 1);
assert.equal(sourceNavCalls, 1);

shouldWorker = true;
el.queryInput.value = "";
const workerResult = controller.applyFilters(false);
assert.equal(workerResult.engine, "worker");
assert.equal(workerPayload.requestId, state.filterRequestId);
assert.equal(workerPayload.request.query, "");
assert.equal(el.resultsSummary.textContent, "Filtering in background…");
assert.equal(document.body.classList.contains("filtering-active"), true);

controller.applyFilteredIndexes([2, 1], ["bad:token"], false);
assert.deepEqual(Array.from(state.filteredIndexes), [2, 1]);
assert.equal(el.queryInput.classList.contains("has-query-error"), true);
assert.ok(el.queryInput.title.includes("bad:token"));
assert.equal(document.body.classList.contains("filtering-active"), false);

controller.setControlsEnabled(false);
assert.equal(el.queryInput.disabled, true);
assert.equal(el.resetButton.disabled, true);
controller.setControlsEnabled(true);
assert.equal(el.queryInput.disabled, false);

controller.destroy();
assert.equal(el.queryInput.listeners.get("input").size, 0, "destroy() must remove query listener");
assert.equal(el.fileTabs.listeners.get("click").size, 0, "destroy() must remove source-tab listener");

console.log("dataset-filter-controller-smoke PASS");
