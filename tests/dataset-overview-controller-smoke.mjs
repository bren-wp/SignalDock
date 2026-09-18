import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const controllerSource = read("src/app/dataset-overview-controller.js");
const compositionSource = read("src/app/dataset-view-composition.js");

assert.ok(html.includes('src/app/dataset-overview-controller.js'), "Dataset Overview controller missing from index.html");
assert.ok(html.indexOf('src/app/dataset-overview-controller.js') < html.indexOf('app.js'), "Dataset Overview controller must load before app.js");
assert.ok(compositionSource.includes("modules.datasetOverview.create"), "composition module create wiring missing: datasetOverview");
assert.ok(app.includes("datasetOverview: window.SignalDockDatasetOverviewController"), "root composition module mapping missing: datasetOverview");
assert.ok(app.includes("datasetViewComposition.createDatasetOverview()"), "root composition call missing: datasetViewComposition.createDatasetOverview()");
assert.ok(app.includes("datasetOverviewController.bind();"), "Dataset Overview controller bind missing");

for (const token of [
  "TIMELINE_BUCKETS",
  "TIMELINE_SEGMENTS",
  'className = "source-button"',
  'className = "file-tab"',
  'className = "timeline-empty"',
  'className = `timeline-bar${',
  'className = `timeline-segment${',
  'document.querySelectorAll(".source-button[data-source], .file-tab[data-source]")'
]) assert.ok(!app.includes(token), `root still owns Dataset Overview implementation token: ${token}`);

for (const token of [
  "SignalDockQueryEngine",
  "SignalDockParser",
  "SignalDockWorkspace",
  "SignalDockDesktopBridge",
  "SignalDockProjectManager",
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
]) assert.ok(!controllerSource.includes(token), `forbidden Dataset Overview capability reference: ${token}`);
assert.ok(!/\bfetch\s*\(/.test(controllerSource), "Dataset Overview controller must not use fetch()");
assert.ok(!controllerSource.includes("timestamped.push("), "Dataset Overview timeline must not retain a duplicate O(N) timestamped entry list");

class FakeClassList {
  constructor(initial = "") { this.values = new Set(String(initial).split(/\s+/).filter(Boolean)); }
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
  constructor(document, tag = "div") {
    this.ownerDocument = document;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = "";
    this.title = "";
    this.type = "";
    this._className = "";
    this.classList = new FakeClassList();
  }
  set className(value) {
    this._className = String(value);
    this.classList = new FakeClassList(this._className);
  }
  get className() { return this._className; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  replaceChildren(...nodes) { this.children = nodes.flatMap((node) => node?.isFragment ? node.children : [node]); }
  appendChild(node) {
    if (node?.isFragment) this.children.push(...node.children);
    else this.children.push(node);
    return node;
  }
  append(...nodes) { this.children.push(...nodes.flatMap((node) => node?.isFragment ? node.children : [node])); }
}

const allNodes = [];
const document = {
  createElement(tag) {
    const node = new FakeNode(document, tag);
    allNodes.push(node);
    return node;
  },
  createDocumentFragment() {
    const node = new FakeNode(document, "fragment");
    node.isFragment = true;
    return node;
  },
  querySelectorAll(selector) {
    if (selector !== ".source-button[data-source], .file-tab[data-source]") return [];
    return allNodes.filter((node) =>
      Object.prototype.hasOwnProperty.call(node.dataset, "source") &&
      (node.classList.contains("source-button") || node.classList.contains("file-tab"))
    );
  }
};

const make = () => new FakeNode(document);
const el = {
  metricEntries: make(),
  metricErrors: make(),
  metricWarnings: make(),
  metricSources: make(),
  chipErrors: make(),
  chipWarnings: make(),
  navLogCount: make(),
  serviceMapCount: make(),
  serviceMatrixCount: make(),
  serviceHeatmapCount: make(),
  serviceTrendsCount: make(),
  traceExplorerCount: make(),
  traceOutlierCount: make(),
  investigationCount: make(),
  exceptionGroupCount: make(),
  healthIssueCount: make(),
  loadedMeta: make(),
  sourceList: make(),
  fileTabs: make(),
  sourceFilter: make(),
  timelineBars: make(),
  timelineStart: make(),
  timelineEnd: make(),
  timelineTitle: make(),
  timelineMeta: make()
};
el.sourceFilter.value = "api.log";

const state = {
  entries: [
    { timestampMs: 1000, level: "INFO" },
    { timestampMs: 1500, level: "ERROR" },
    { timestampMs: 2000, level: "WARN" },
    { timestampMs: null, level: "INFO" }
  ],
  filteredIndexes: [0, 1, 2, 3],
  inputFileCount: 2,
  loadedBytes: 4096,
  lastEngine: "main · 1 ms",
  summary: {
    total: 4,
    errors: 1,
    warnings: 1,
    sources: ["api.log", "worker.log"],
    sourceCounts: new Map([["api.log", 3], ["worker.log", 1]]),
    services: ["api", "worker"]
  },
  serviceMatrixData: { rows: [{}, {}] },
  serviceHeatmapData: { rows: [{}] },
  serviceTrendsData: { summary: { changed: 3 } },
  traceExplorerData: { summary: { traces: 2 } },
  traceOutlierData: { rows: [{}, {}, {}] },
  investigation: { items: [{}, {}] },
  exceptionGroups: [{}, {}, {}, {}],
  healthData: { summary: { critical: 1, degraded: 2 } }
};

const rootGlobal = { document };
vm.runInNewContext(controllerSource, { self: rootGlobal, window: rootGlobal, console, Map, Set }, { filename: "dataset-overview-controller.js" });

const controller = rootGlobal.SignalDockDatasetOverviewController.create({
  state,
  el,
  ownerDocument: document,
  getSources: () => state.summary.sources,
  formatBytes: (value) => `${value} B`,
  shortSource: (source) => source.replace(".log", ""),
  formatTimelineTime: (ms) => `T${ms}`
});

controller.bind();
controller.bind();
assert.equal(Object.isFrozen(rootGlobal.SignalDockDatasetOverviewController), true);

controller.updateStats();
assert.equal(el.metricEntries.textContent, "4");
assert.equal(el.metricErrors.textContent, "1");
assert.equal(el.metricWarnings.textContent, "1");
assert.equal(el.metricSources.textContent, "2");
assert.equal(el.loadedMeta.textContent, "2 files · 4096 B");
assert.equal(el.healthIssueCount.textContent, "3");
assert.equal(el.exceptionGroupCount.textContent, "4");

controller.renderSourceNavigation();
assert.equal(el.sourceList.children.length, 2);
assert.equal(el.fileTabs.children.length, 3);
assert.equal(el.sourceList.children[0].children[1].textContent, "api");
assert.equal(el.sourceList.children[0].children[2].textContent, "3");
assert.equal(el.sourceList.children[0].getAttribute("aria-pressed"), "true");
assert.equal(el.sourceList.children[1].getAttribute("aria-pressed"), "false");
assert.equal(el.fileTabs.children[0].getAttribute("aria-pressed"), "false");
assert.equal(el.fileTabs.children[1].getAttribute("aria-pressed"), "true");
assert.equal(el.sourceList.children[0].children[0].getAttribute("aria-hidden"), "true");

controller.renderTimeline();
assert.equal(el.timelineBars.children.length, 36);
assert.equal(el.timelineBars.children[35].classList.contains("is-last"), true);
assert.equal(el.timelineStart.textContent, "T1000");
assert.equal(el.timelineEnd.textContent, "T2000");
assert.equal(el.timelineTitle.textContent, "All activity");
assert.ok(el.timelineMeta.textContent.includes("3 timestamped"));
const activeBar = el.timelineBars.children.find((bar) => bar.title.includes("1 entries"));
assert.ok(activeBar, "expected at least one populated timeline bar");
assert.ok(activeBar.getAttribute("aria-label"));
assert.equal(activeBar.children.length, 8);
assert.equal(activeBar.children[0].getAttribute("aria-hidden"), "true");

state.filteredIndexes = [3];
controller.renderTimeline();
assert.equal(el.timelineBars.children.length, 1);
assert.equal(el.timelineBars.children[0].className, "timeline-empty");
assert.equal(el.timelineTitle.textContent, "Filtered activity");
assert.ok(el.timelineMeta.textContent.includes("1 results"));

state.entries = Array.from({ length: 200000 }, (_, index) => ({
  timestampMs: index,
  level: index % 1000 === 0 ? "ERROR" : index % 250 === 0 ? "WARN" : "INFO"
}));
state.filteredIndexes = Array.from({ length: state.entries.length }, (_, index) => index);
state.lastEngine = "large-test";
controller.renderTimeline();
assert.equal(el.timelineBars.children.length, 36);
assert.equal(el.timelineStart.textContent, "T0");
assert.equal(el.timelineEnd.textContent, "T199999");
assert.ok(el.timelineMeta.textContent.includes("200,000 timestamped"));
assert.ok(el.timelineMeta.textContent.includes("200,000 results"));

controller.destroy();
console.log("dataset-overview-controller-smoke PASS");
