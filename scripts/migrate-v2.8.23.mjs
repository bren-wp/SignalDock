import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, content) => fs.writeFileSync(path.join(root, name), content);

function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), `migration anchor missing: ${label}`);
  assert.equal(source.indexOf(before), source.lastIndexOf(before), `migration anchor ambiguous: ${label}`);
  return source.replace(before, after);
}

assert.equal(read("VERSION").trim(), "2.8.22", "migration must start from SignalDock 2.8.22");
let app = read("app.js");
assert.ok(app.includes('const APP_VERSION = "2.8.22";'));
assert.ok(app.includes("function updateStats()"));
assert.ok(app.includes("function renderTimeline()"));

app = replaceOnce(app, '  const APP_VERSION = "2.8.22";', '  const APP_VERSION = "2.8.23";', "APP_VERSION");
app = replaceOnce(app, "  const TIMELINE_BUCKETS = 36;\n  const TIMELINE_SEGMENTS = 8;\n", "", "timeline constants");
app = replaceOnce(
  app,
  "  let workspaceController = null;\n",
  "  let workspaceController = null;\n  let datasetOverviewController = null;\n",
  "Dataset Overview controller slot"
);

const workspaceBind = "    workspaceController.bind();";
const overviewWiring = [
  workspaceBind,
  '    if (!window.SignalDockDatasetOverviewController?.create) throw new Error("SignalDock Dataset Overview controller is unavailable.");',
  '    datasetOverviewController = window.SignalDockDatasetOverviewController.create({',
  '      state,',
  '      el,',
  '      ownerDocument: document,',
  '      getSources,',
  '      formatBytes: (value) => utils().formatBytes(value),',
  '      shortSource: (value) => utils().shortSource(value),',
  '      formatTimelineTime: (ms) => {',
  '        const date = new Date(ms);',
  '        return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;',
  '      }',
  '    });',
  '    datasetOverviewController.bind();'
].join("\n");
app = replaceOnce(app, workspaceBind, overviewWiring, "Dataset Overview controller wiring");

const statsStart = app.indexOf("  function updateStats() {");
const tableStart = app.indexOf("  function renderTable() {", statsStart);
assert.ok(statsStart >= 0 && tableStart > statsStart, "Dataset Overview implementation block not found");
const delegates = [
  "  function updateStats() { return datasetOverviewController?.updateStats(); }",
  "",
  "  function renderSourceNavigation() { return datasetOverviewController?.renderSourceNavigation(); }",
  "",
  "  function updateActiveSourceUI() { return datasetOverviewController?.updateActiveSourceUI(); }",
  "",
  "  function renderTimeline() { return datasetOverviewController?.renderTimeline(); }",
  "",
  ""
].join("\n");
app = app.slice(0, statsStart) + delegates + app.slice(tableStart);
write("app.js", app);

let html = read("index.html");
html = replaceOnce(
  html,
  '  <script src="src/app/workspace-controller.js" defer></script>\n',
  '  <script src="src/app/workspace-controller.js" defer></script>\n  <script src="src/app/dataset-overview-controller.js" defer></script>\n',
  "Dataset Overview controller script"
);
write("index.html", html);

let layout = read("tests/source-layout-smoke.mjs");
layout = replaceOnce(
  layout,
  '  "src/app/workspace-controller.js",\n',
  '  "src/app/workspace-controller.js",\n  "src/app/dataset-overview-controller.js",\n',
  "source-layout Dataset Overview controller"
);
write("tests/source-layout-smoke.mjs", layout);
write("tests/dataset-overview-controller-smoke.mjs", "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst controllerSource = read(\"src/app/dataset-overview-controller.js\");\n\nassert.ok(html.includes('src/app/dataset-overview-controller.js'), \"Dataset Overview controller missing from index.html\");\nassert.ok(html.indexOf('src/app/dataset-overview-controller.js') < html.indexOf('app.js'), \"Dataset Overview controller must load before app.js\");\nassert.ok(app.includes(\"SignalDockDatasetOverviewController.create\"), \"Dataset Overview controller factory wiring missing\");\nassert.ok(app.includes(\"datasetOverviewController.bind();\"), \"Dataset Overview controller bind missing\");\n\nfor (const token of [\n  \"TIMELINE_BUCKETS\",\n  \"TIMELINE_SEGMENTS\",\n  'document.createElement(\"button\")',\n  'document.querySelectorAll(\".source-button[data-source], .file-tab[data-source]\")'\n]) assert.ok(!app.includes(token), `root still owns Dataset Overview implementation token: ${token}`);\n\nfor (const token of [\n  \"SignalDockQueryEngine\",\n  \"SignalDockParser\",\n  \"SignalDockWorkspace\",\n  \"SignalDockDesktopBridge\",\n  \"SignalDockProjectManager\",\n  \"SignalDockPersistence\",\n  \"SignalDockStorageAdapter\",\n  \"showOpenFilePicker\",\n  \"indexedDB\",\n  \"localStorage\",\n  \"sessionStorage\",\n  \"new Worker\",\n  \".postMessage(\",\n  \"XMLHttpRequest\",\n  \"WebSocket\",\n  \"EventSource\",\n  \".invoke(\"\n]) assert.ok(!controllerSource.includes(token), `forbidden Dataset Overview capability reference: ${token}`);\nassert.ok(!/\\bfetch\\s*\\(/.test(controllerSource), \"Dataset Overview controller must not use fetch()\");\n\nclass FakeClassList {\n  constructor(initial = \"\") { this.values = new Set(String(initial).split(/\\s+/).filter(Boolean)); }\n  add(name) { this.values.add(name); }\n  remove(name) { this.values.delete(name); }\n  toggle(name, force) {\n    if (force === undefined) {\n      if (this.values.has(name)) this.values.delete(name);\n      else this.values.add(name);\n      return;\n    }\n    if (force) this.values.add(name);\n    else this.values.delete(name);\n  }\n  contains(name) { return this.values.has(name); }\n}\n\nclass FakeNode {\n  constructor(document, tag = \"div\") {\n    this.ownerDocument = document;\n    this.tagName = tag.toUpperCase();\n    this.children = [];\n    this.dataset = {};\n    this.attributes = new Map();\n    this.textContent = \"\";\n    this.title = \"\";\n    this.type = \"\";\n    this._className = \"\";\n    this.classList = new FakeClassList();\n  }\n  set className(value) {\n    this._className = String(value);\n    this.classList = new FakeClassList(this._className);\n  }\n  get className() { return this._className; }\n  setAttribute(name, value) { this.attributes.set(name, String(value)); }\n  getAttribute(name) { return this.attributes.get(name) ?? null; }\n  replaceChildren(...nodes) { this.children = nodes.flatMap((node) => node?.isFragment ? node.children : [node]); }\n  appendChild(node) {\n    if (node?.isFragment) this.children.push(...node.children);\n    else this.children.push(node);\n    return node;\n  }\n  append(...nodes) { this.children.push(...nodes.flatMap((node) => node?.isFragment ? node.children : [node])); }\n}\n\nconst allNodes = [];\nconst document = {\n  createElement(tag) {\n    const node = new FakeNode(document, tag);\n    allNodes.push(node);\n    return node;\n  },\n  createDocumentFragment() {\n    const node = new FakeNode(document, \"fragment\");\n    node.isFragment = true;\n    return node;\n  },\n  querySelectorAll(selector) {\n    if (selector !== \".source-button[data-source], .file-tab[data-source]\") return [];\n    return allNodes.filter((node) =>\n      Object.prototype.hasOwnProperty.call(node.dataset, \"source\") &&\n      (node.classList.contains(\"source-button\") || node.classList.contains(\"file-tab\"))\n    );\n  }\n};\n\nconst make = () => new FakeNode(document);\nconst el = {\n  metricEntries: make(),\n  metricErrors: make(),\n  metricWarnings: make(),\n  metricSources: make(),\n  chipErrors: make(),\n  chipWarnings: make(),\n  navLogCount: make(),\n  serviceMapCount: make(),\n  serviceMatrixCount: make(),\n  serviceHeatmapCount: make(),\n  serviceTrendsCount: make(),\n  traceExplorerCount: make(),\n  traceOutlierCount: make(),\n  investigationCount: make(),\n  exceptionGroupCount: make(),\n  healthIssueCount: make(),\n  loadedMeta: make(),\n  sourceList: make(),\n  fileTabs: make(),\n  sourceFilter: make(),\n  timelineBars: make(),\n  timelineStart: make(),\n  timelineEnd: make(),\n  timelineTitle: make(),\n  timelineMeta: make()\n};\nel.sourceFilter.value = \"api.log\";\n\nconst state = {\n  entries: [\n    { timestampMs: 1000, level: \"INFO\" },\n    { timestampMs: 1500, level: \"ERROR\" },\n    { timestampMs: 2000, level: \"WARN\" },\n    { timestampMs: null, level: \"INFO\" }\n  ],\n  filteredIndexes: [0, 1, 2, 3],\n  inputFileCount: 2,\n  loadedBytes: 4096,\n  lastEngine: \"main · 1 ms\",\n  summary: {\n    total: 4,\n    errors: 1,\n    warnings: 1,\n    sources: [\"api.log\", \"worker.log\"],\n    sourceCounts: new Map([[\"api.log\", 3], [\"worker.log\", 1]]),\n    services: [\"api\", \"worker\"]\n  },\n  serviceMatrixData: { rows: [{}, {}] },\n  serviceHeatmapData: { rows: [{}] },\n  serviceTrendsData: { summary: { changed: 3 } },\n  traceExplorerData: { summary: { traces: 2 } },\n  traceOutlierData: { rows: [{}, {}, {}] },\n  investigation: { items: [{}, {}] },\n  exceptionGroups: [{}, {}, {}, {}],\n  healthData: { summary: { critical: 1, degraded: 2 } }\n};\n\nconst rootGlobal = { document };\nvm.runInNewContext(controllerSource, { self: rootGlobal, window: rootGlobal, console, Map, Set }, { filename: \"dataset-overview-controller.js\" });\n\nconst controller = rootGlobal.SignalDockDatasetOverviewController.create({\n  state,\n  el,\n  ownerDocument: document,\n  getSources: () => state.summary.sources,\n  formatBytes: (value) => `${value} B`,\n  shortSource: (source) => source.replace(\".log\", \"\"),\n  formatTimelineTime: (ms) => `T${ms}`\n});\n\ncontroller.bind();\ncontroller.bind();\nassert.equal(Object.isFrozen(rootGlobal.SignalDockDatasetOverviewController), true);\n\ncontroller.updateStats();\nassert.equal(el.metricEntries.textContent, \"4\");\nassert.equal(el.metricErrors.textContent, \"1\");\nassert.equal(el.metricWarnings.textContent, \"1\");\nassert.equal(el.metricSources.textContent, \"2\");\nassert.equal(el.loadedMeta.textContent, \"2 files · 4096 B\");\nassert.equal(el.healthIssueCount.textContent, \"3\");\nassert.equal(el.exceptionGroupCount.textContent, \"4\");\n\ncontroller.renderSourceNavigation();\nassert.equal(el.sourceList.children.length, 2);\nassert.equal(el.fileTabs.children.length, 3);\nassert.equal(el.sourceList.children[0].children[1].textContent, \"api\");\nassert.equal(el.sourceList.children[0].children[2].textContent, \"3\");\nassert.equal(el.sourceList.children[0].getAttribute(\"aria-pressed\"), \"true\");\nassert.equal(el.sourceList.children[1].getAttribute(\"aria-pressed\"), \"false\");\nassert.equal(el.fileTabs.children[0].getAttribute(\"aria-pressed\"), \"false\");\nassert.equal(el.fileTabs.children[1].getAttribute(\"aria-pressed\"), \"true\");\nassert.equal(el.sourceList.children[0].children[0].getAttribute(\"aria-hidden\"), \"true\");\n\ncontroller.renderTimeline();\nassert.equal(el.timelineBars.children.length, 36);\nassert.equal(el.timelineBars.children[35].classList.contains(\"is-last\"), true);\nassert.equal(el.timelineStart.textContent, \"T1000\");\nassert.equal(el.timelineEnd.textContent, \"T2000\");\nassert.equal(el.timelineTitle.textContent, \"All activity\");\nassert.ok(el.timelineMeta.textContent.includes(\"3 timestamped\"));\nconst activeBar = el.timelineBars.children.find((bar) => bar.title.includes(\"1 entries\"));\nassert.ok(activeBar, \"expected at least one populated timeline bar\");\nassert.ok(activeBar.getAttribute(\"aria-label\"));\nassert.equal(activeBar.children.length, 8);\nassert.equal(activeBar.children[0].getAttribute(\"aria-hidden\"), \"true\");\n\nstate.filteredIndexes = [3];\ncontroller.renderTimeline();\nassert.equal(el.timelineBars.children.length, 1);\nassert.equal(el.timelineBars.children[0].className, \"timeline-empty\");\nassert.equal(el.timelineTitle.textContent, \"Filtered activity\");\nassert.ok(el.timelineMeta.textContent.includes(\"1 results\"));\n\ncontroller.destroy();\nconsole.log(\"dataset-overview-controller-smoke PASS\");\n");
write("VERSION", "2.8.23\n");

let readme = read("README.md").replaceAll("2.8.22", "2.8.23");
const readmeAnchor = "- feature-level Workspace controller under `src/app/` that owns workspace snapshots, save/restore orchestration and workspace UI shortcuts while serialization, file reads, native/browser save capabilities and Project handle metadata remain root-injected callbacks\n";
if (readme.includes(readmeAnchor)) {
  readme = readme.replace(readmeAnchor, readmeAnchor + "- feature-level Dataset Overview controller under `src/app/` that owns summary metrics, source navigation and timeline rendering while filter/index ownership and domain analytics remain outside the UI renderer\n");
}
write("README.md", readme);

let technical = read("docs/TECHNICAL.md").replace("Current version: **2.8.22**.", "Current version: **2.8.23**.");
const techAnchor = "`workspace-controller.js` owns portable workspace/view snapshots, save/restore state orchestration, the workspace save button and the Ctrl/Cmd+Shift+S shortcut. Session serialization/parsing, file reads, Desktop Bridge saves/downloads, Project Manager handle metadata and domain normalization remain in the root/platform boundary behind narrow callbacks.\n";
technical = replaceOnce(
  technical,
  techAnchor,
  techAnchor + "\n`dataset-overview-controller.js` owns dataset summary metrics, source sidebar/tab rendering, active-source presentation and the activity timeline. Filter/index state remains authoritative in the Dataset Filter controller; formatting is root-injected and the overview controller receives no parser, worker, storage, filesystem or network capability.\n",
  "technical Dataset Overview boundary"
);
write("docs/TECHNICAL.md", technical);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout = replaceOnce(
  sourceLayout,
  "`table-view-controller.js`, `workspace-controller.js`, `investigation-controller.js`",
  "`table-view-controller.js`, `workspace-controller.js`, `dataset-overview-controller.js`, `investigation-controller.js`",
  "source layout Dataset Overview list"
);
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let srcReadme = read("src/README.md");
const srcAnchor = "`app/workspace-controller.js` owns workspace/view snapshots, save/restore orchestration and workspace UI shortcuts while serialization, file I/O, Desktop Bridge/Project handle capabilities and domain normalization remain root-injected callbacks.\n";
srcReadme = replaceOnce(
  srcReadme,
  srcAnchor,
  srcAnchor + "\n`app/dataset-overview-controller.js` owns dataset metrics, source navigation, active-source UI state and timeline rendering while filter/index state, formatting and all privileged capabilities remain outside the controller.\n",
  "src README Dataset Overview boundary"
);
write("src/README.md", srcReadme);

let changelog = read("CHANGELOG.md");
const notes = [
  "## 2.8.23 — 2026-09-18",
  "",
  "### Dataset Overview application boundary",
  "- Extracted dataset summary metrics, source sidebar/tab rendering, active-source presentation and the main activity timeline into `src/app/dataset-overview-controller.js`.",
  "- Kept filter/index ownership in the Dataset Filter controller and kept parser, worker, storage, filesystem, project and network capabilities out of the overview renderer.",
  "- Improved source-navigation accessibility with synchronized `aria-pressed` state and marked timeline segment cells as decorative while preserving descriptive bar labels.",
  "- Hardened source-count and empty-timeline rendering against incomplete UI summary data without changing filter semantics.",
  "",
  "### Maintainability and verification",
  "- Added isolated Dataset Overview coverage for metric summaries, source counts/tabs, active-source accessibility state, populated timeline buckets and empty timeline results.",
  "- Added capability assertions preventing direct parser, worker, workspace, storage, filesystem or network access from the controller.",
  "- Updated permanent source-layout and HTTP smoke gates while preserving the zero-build local-first runtime.",
  "",
  ""
].join("\n");
changelog = replaceOnce(changelog, "# Changelog\n\n", "# Changelog\n\n" + notes, "changelog");
write("CHANGELOG.md", changelog);

const finalController = read("src/app/dataset-overview-controller.js");
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
]) assert.ok(!finalController.includes(token), `forbidden Dataset Overview capability: ${token}`);
assert.ok(!/\bfetch\s*\(/.test(finalController), "Dataset Overview controller must not use fetch()");

const finalApp = read("app.js");
assert.ok(finalApp.includes("function renderEverything()"));
assert.ok(finalApp.includes("function renderDataViews()"));
assert.ok(finalApp.includes("return datasetOverviewController?.updateStats()"));
assert.ok(finalApp.includes("return datasetOverviewController?.renderTimeline()"));
assert.ok(!finalApp.includes("TIMELINE_BUCKETS"));
assert.ok(!finalApp.includes("TIMELINE_SEGMENTS"));
assert.ok(read("index.html").indexOf("src/app/dataset-overview-controller.js") < read("index.html").indexOf("app.js"));
console.log("SignalDock v2.8.23 migration prepared successfully.");
