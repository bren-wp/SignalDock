import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, content) => fs.writeFileSync(path.join(root, name), content);

function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), `migration anchor missing: ${label}`);
  assert.equal(source.indexOf(before), source.lastIndexOf(before), `migration anchor is ambiguous: ${label}`);
  return source.replace(before, after);
}

assert.equal(read("VERSION").trim(), "2.8.19", "migration must start from SignalDock 2.8.19");

let app = read("app.js");
assert.ok(app.includes('const APP_VERSION = "2.8.19";'), "unexpected APP_VERSION before migration");
assert.ok(app.includes("function rebuildFilterIndex()"), "dataset-index boundary already moved or missing");
assert.ok(app.includes("function applyFilters(resetPage)"), "filter boundary already moved or missing");

app = replaceOnce(app, '  const APP_VERSION = "2.8.19";', '  const APP_VERSION = "2.8.20";', "APP_VERSION");
app = replaceOnce(
  app,
  "  let importLiveTailController = null;\n",
  "  let importLiveTailController = null;\n  let datasetFilterController = null;\n",
  "Dataset Filter controller slot"
);

const importBind = "    importLiveTailController.bind();";
const filterWiring = [
  importBind,
  '    if (!window.SignalDockDatasetFilterController?.create) throw new Error("SignalDock Dataset Filter controller is unavailable.");',
  '    datasetFilterController = window.SignalDockDatasetFilterController.create({',
  '      state,',
  '      el,',
  '      debounce: (callback, wait) => utils().debounce(callback, wait),',
  '      parseSmartQuery: (query) => engine().parseSmartQuery(query),',
  '      filterIndexes: (entries, request) => engine().filterIndexes(entries, request),',
  '      shouldUseWorkerFilter: () => state.settings.useWorker !== false && state.workerReady && state.entries.length >= WORKER_THRESHOLD,',
  '      requestWorkerFilter: ({ requestId, request }) => state.worker.postMessage({ type: "filter", protocol: 1, token: state.workerToken, requestId, request }),',
  '      now: () => performance.now(),',
  '      recordPerformance: (elapsed, meta) => profiler()?.record?.("filter", elapsed, meta),',
  '      getExceptionFingerprint: (entry) => window.SignalDockExceptionGroups?.candidate?.(entry) ? window.SignalDockExceptionGroups.fingerprint(entry) : "",',
  '      refreshDerivedAnalysis: () => {',
  '        state.serviceGraph = null;',
  '        state.exceptionGroups = window.SignalDockExceptionGroups?.group?.(state.entries, { maxGroups: 1500 }) || [];',
  '        state.exceptionTrends = window.SignalDockExceptionTrends?.analyze?.(state.entries, { bucketCount: 20 }) || null;',
  '        state.healthData = window.SignalDockServiceHealth?.analyze?.(state.entries) || null;',
  '        state.serviceMatrixData = window.SignalDockServiceMatrix?.build?.(state.entries) || null;',
  '        state.serviceHeatmapData = window.SignalDockServiceHeatmap?.build?.(state.entries, null, { bucketCount: 12 }) || null;',
  '        state.serviceTrendsData = window.SignalDockServiceTrends?.compare?.(state.entries) || null;',
  '        state.traceExplorerData = window.SignalDockTraceExplorer?.buildWindow?.(state.entries, null, { limit: 1000 }) || window.SignalDockTraceExplorer?.build?.(state.entries) || null;',
  '        state.traceOutlierData = window.SignalDockTraceOutliers?.rank?.(state.entries, { limit: 250 }) || null;',
  '        traceExplorerController?.reconcileSelection(state.traceExplorerData);',
  '      },',
  '      syncLevelChips,',
  '      ensurePageInRange,',
  '      renderDataViews,',
  '      scheduleViewAutosave: () => scheduleViewAutosave(),',
  '      updateStats,',
  '      renderSourceNavigation,',
  '      getShortSource: (source) => utils().shortSource(source)',
  '    });',
  '    datasetFilterController.bind();'
].join("\n");
app = replaceOnce(app, importBind, filterWiring, "Dataset Filter controller wiring");

const listenerBlock = [
  '    const debouncedFilter = utils().debounce(() => applyFilters(true), 80);',
  '    el.queryInput.addEventListener("input", debouncedFilter);',
  '    el.levelFilter.addEventListener("change", () => { syncLevelChips(el.levelFilter.value); applyFilters(true); });',
  '    el.sourceFilter.addEventListener("change", () => applyFilters(true));',
  '    el.timeFilter.addEventListener("change", () => applyFilters(true));',
  '    el.sortFilter.addEventListener("change", () => applyFilters(true));',
  '    el.levelChips.addEventListener("click", (event) => {',
  '      const button = event.target.closest("[data-level]");',
  '      if (!button || el.levelFilter.disabled) return;',
  '      el.levelFilter.value = button.dataset.level;',
  '      syncLevelChips(button.dataset.level);',
  '      applyFilters(true);',
  '    });',
  '',
  '    el.resetButton.addEventListener("click", resetFilters);',
  '    el.exportButton.addEventListener("click", exportFiltered);',
  '    el.workspaceSaveButton.addEventListener("click", saveWorkspace);',
  '    el.clearAllButton.addEventListener("click", clearAll);',
  '',
  '    el.fileTabs.addEventListener("click", (event) => {',
  '      const tab = event.target.closest("[data-source]");',
  '      if (!tab || el.sourceFilter.disabled) return;',
  '      el.sourceFilter.value = tab.dataset.source;',
  '      applyFilters(true);',
  '    });',
  '    el.sourceList.addEventListener("click", (event) => {',
  '      const button = event.target.closest("[data-source]");',
  '      if (!button || el.sourceFilter.disabled) return;',
  '      el.sourceFilter.value = button.dataset.source;',
  '      applyFilters(true);',
  '    });'
].join("\n");

const retainedListeners = [
  '    el.exportButton.addEventListener("click", exportFiltered);',
  '    el.workspaceSaveButton.addEventListener("click", saveWorkspace);',
  '    el.clearAllButton.addEventListener("click", clearAll);'
].join("\n");
app = replaceOnce(app, listenerBlock, retainedListeners, "filter UI listener ownership");

const filterStart = app.indexOf("  function rebuildFilterIndex() {");
const renderEverythingStart = app.indexOf("  function renderEverything() {", filterStart);
assert.ok(filterStart >= 0 && renderEverythingStart > filterStart, "could not isolate dataset filter block");
const delegates = [
  "  function rebuildFilterIndex() { return datasetFilterController?.rebuildFilterIndex(); }",
  "",
  "  function currentFilterRequest() { return datasetFilterController?.currentFilterRequest() || {}; }",
  "",
  "  function applyFilters(resetPage) { return datasetFilterController?.applyFilters(resetPage); }",
  "",
  "  function applyFilteredIndexes(indexes, invalidTokens, resetPage) { return datasetFilterController?.applyFilteredIndexes(indexes, invalidTokens, resetPage); }",
  "",
  "  function updateQueryValidity(invalidTokens) { return datasetFilterController?.updateQueryValidity(invalidTokens); }",
  "",
  "  function resetFilters() { return datasetFilterController?.resetFilters(); }",
  "",
  "  function setControlsEnabled(enabled) { return datasetFilterController?.setControlsEnabled(enabled); }",
  "",
  "  function refreshFilters() { return datasetFilterController?.refreshFilters(); }",
  "",
  "  function getSources() { return datasetFilterController?.getSources() || []; }",
  "",
  ""
].join("\n");
app = app.slice(0, filterStart) + delegates + app.slice(renderEverythingStart);
write("app.js", app);

let html = read("index.html");
html = replaceOnce(
  html,
  '  <script src="src/app/import-live-tail-controller.js" defer></script>\n',
  '  <script src="src/app/import-live-tail-controller.js" defer></script>\n  <script src="src/app/dataset-filter-controller.js" defer></script>\n',
  "Dataset Filter controller script order"
);
write("index.html", html);

let sourceLayoutTest = read("tests/source-layout-smoke.mjs");
sourceLayoutTest = replaceOnce(
  sourceLayoutTest,
  '  "src/app/import-live-tail-controller.js",\n',
  '  "src/app/import-live-tail-controller.js",\n  "src/app/dataset-filter-controller.js",\n',
  "source-layout Dataset Filter controller list"
);
write("tests/source-layout-smoke.mjs", sourceLayoutTest);

const controllerSmoke = "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst controllerSource = read(\"src/app/dataset-filter-controller.js\");\n\nassert.ok(html.includes('src/app/dataset-filter-controller.js'), \"Dataset Filter controller missing from index.html\");\nassert.ok(html.indexOf('src/app/dataset-filter-controller.js') < html.indexOf('app.js'), \"Dataset Filter controller must load before app.js\");\nassert.ok(app.includes(\"SignalDockDatasetFilterController.create\"), \"Dataset Filter controller factory wiring missing\");\nassert.ok(app.includes(\"datasetFilterController.bind();\"), \"Dataset Filter controller bind() missing\");\n\nfor (const token of [\n  'el.queryInput.addEventListener(\"input\"',\n  'el.levelFilter.addEventListener(\"change\"',\n  'el.sourceFilter.addEventListener(\"change\"',\n  'el.timeFilter.addEventListener(\"change\"',\n  'el.sortFilter.addEventListener(\"change\"',\n  'el.levelChips.addEventListener(\"click\"',\n  'el.resetButton.addEventListener(\"click\", resetFilters)',\n  'el.fileTabs.addEventListener(\"click\"',\n  'el.sourceList.addEventListener(\"click\"'\n]) assert.ok(!app.includes(token), `root still owns filter UI listener: ${token}`);\n\nfor (const token of [\n  \"rebuildFilterIndex\",\n  \"currentFilterRequest\",\n  \"applyFilters\",\n  \"applyFilteredIndexes\",\n  \"updateQueryValidity\",\n  \"resetFilters\",\n  \"setControlsEnabled\",\n  \"refreshFilters\",\n  \"getSources\",\n  \"function bind()\",\n  \"function destroy()\"\n]) assert.ok(controllerSource.includes(token), `controller missing ownership token: ${token}`);\n\nfor (const token of [\n  \"SignalDockQueryEngine\",\n  \"SignalDockExceptionGroups\",\n  \"SignalDockExceptionTrends\",\n  \"SignalDockServiceHealth\",\n  \"SignalDockServiceMatrix\",\n  \"SignalDockServiceHeatmap\",\n  \"SignalDockServiceTrends\",\n  \"SignalDockTraceExplorer\",\n  \"SignalDockTraceOutliers\",\n  \"SignalDockPersistence\",\n  \"SignalDockStorageAdapter\",\n  \"showOpenFilePicker\",\n  \"indexedDB\",\n  \"localStorage\",\n  \"sessionStorage\",\n  \"new Worker\",\n  \".postMessage(\",\n  \"XMLHttpRequest\",\n  \"WebSocket\",\n  \"EventSource\",\n  \".invoke(\"\n]) assert.ok(!controllerSource.includes(token), `forbidden capability reference in Dataset Filter controller: ${token}`);\nassert.ok(!/\\bfetch\\s*\\(/.test(controllerSource), \"Dataset Filter controller must not use fetch()\");\n\nclass FakeClassList {\n  constructor() { this.values = new Set(); }\n  add(name) { this.values.add(name); }\n  remove(name) { this.values.delete(name); }\n  toggle(name, force) {\n    if (force === undefined) {\n      if (this.values.has(name)) this.values.delete(name);\n      else this.values.add(name);\n      return;\n    }\n    if (force) this.values.add(name);\n    else this.values.delete(name);\n  }\n  contains(name) { return this.values.has(name); }\n}\n\nclass FakeNode {\n  constructor(document) {\n    this.ownerDocument = document;\n    this.value = \"\";\n    this.disabled = false;\n    this.textContent = \"\";\n    this.title = \"\";\n    this.scrollTop = 99;\n    this.dataset = {};\n    this.options = [];\n    this.selectedIndex = 0;\n    this.children = [];\n    this.listeners = new Map();\n    this.classList = new FakeClassList();\n  }\n  addEventListener(type, handler) {\n    if (!this.listeners.has(type)) this.listeners.set(type, new Set());\n    this.listeners.get(type).add(handler);\n  }\n  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }\n  replaceChildren(...nodes) {\n    this.children = [...nodes];\n    this.options = [...nodes];\n  }\n}\n\nconst document = {\n  body: new FakeNode(null),\n  createElement(tag) {\n    const node = new FakeNode(document);\n    node.tagName = String(tag).toUpperCase();\n    return node;\n  }\n};\ndocument.body.ownerDocument = document;\n\nconst rootGlobal = { document };\nvm.runInNewContext(controllerSource, { self: rootGlobal, window: rootGlobal, console }, { filename: \"dataset-filter-controller.js\" });\n\nconst select = (value = \"\") => {\n  const node = new FakeNode(document);\n  node.value = value;\n  return node;\n};\n\nconst el = {\n  queryInput: new FakeNode(document),\n  levelFilter: select(\"\"),\n  sourceFilter: select(\"\"),\n  timeFilter: select(\"\"),\n  sortFilter: select(\"original\"),\n  levelChips: new FakeNode(document),\n  resetButton: new FakeNode(document),\n  fileTabs: new FakeNode(document),\n  sourceList: new FakeNode(document),\n  resultsSummary: new FakeNode(document),\n  logTable: new FakeNode(document),\n  saveViewButton: new FakeNode(document),\n  exportButton: new FakeNode(document),\n  workspaceSaveButton: new FakeNode(document),\n  clearAllButton: new FakeNode(document),\n  pageSize: new FakeNode(document),\n  renderMode: new FakeNode(document)\n};\nel.queryInput.value = \"timeout\";\n\nconst state = {\n  entries: [\n    { level: \"ERROR\", source: \"api.log\", service: \"api\", message: \"timeout\", timestamp: \"2026-09-18T10:00:00Z\", searchText: \"timeout\", correlations: { traceId: \"t1\" }, dimensions: { env: \"prod\" } },\n    { level: \"WARN\", source: \"worker.log\", service: \"worker\", message: \"slow\", timestampMs: 2000, searchText: \"slow\" },\n    { level: \"INFO\", source: \"api.log\", service: \"api\", message: \"ok\", timestampMs: 3000, searchText: \"ok\" }\n  ],\n  filterEntries: [],\n  filteredIndexes: [],\n  filterRequestId: 0,\n  page: 4,\n  renderMode: \"virtual\",\n  settings: { showUnknown: true, useWorker: true },\n  latestTimestampMs: null,\n  summary: { sources: [] },\n  lastEngine: \"\"\n};\n\nlet derivedRefreshes = 0;\nlet ensureCalls = 0;\nlet renderCalls = 0;\nlet autosaves = 0;\nlet statsCalls = 0;\nlet sourceNavCalls = 0;\nlet recorded = null;\nlet workerPayload = null;\nlet shouldWorker = false;\nlet clock = 10;\n\nconst controller = rootGlobal.SignalDockDatasetFilterController.create({\n  state,\n  el,\n  ownerDocument: document,\n  debounce: (fn) => fn,\n  parseSmartQuery: (query) => ({ query, invalid: [] }),\n  filterIndexes: (entries, request) => ({\n    indexes: entries.map((_, index) => index).filter((index) => !request.query || entries[index].searchText.includes(request.query)),\n    parsed: { invalid: [] }\n  }),\n  shouldUseWorkerFilter: () => shouldWorker,\n  requestWorkerFilter: (payload) => { workerPayload = payload; },\n  now: () => { clock += 1.25; return clock; },\n  recordPerformance: (elapsed, meta) => { recorded = { elapsed, meta }; },\n  getExceptionFingerprint: (entry) => entry.level === \"ERROR\" ? \"fp-timeout\" : \"\",\n  refreshDerivedAnalysis: () => { derivedRefreshes += 1; },\n  syncLevelChips: () => {},\n  ensurePageInRange: () => { ensureCalls += 1; },\n  renderDataViews: () => { renderCalls += 1; },\n  scheduleViewAutosave: () => { autosaves += 1; },\n  updateStats: () => { statsCalls += 1; },\n  renderSourceNavigation: () => { sourceNavCalls += 1; },\n  getShortSource: (source) => source.replace(\".log\", \"\")\n});\n\ncontroller.bind();\ncontroller.bind();\nassert.equal(el.queryInput.listeners.get(\"input\").size, 1, \"bind() must be idempotent\");\nassert.equal(el.levelFilter.listeners.get(\"change\").size, 1, \"level listener must be singular\");\nassert.equal(el.fileTabs.listeners.get(\"click\").size, 1, \"source-tab listener must be singular\");\n\ncontroller.rebuildFilterIndex();\nassert.equal(state.filterEntries.length, 3);\nassert.equal(state.summary.total, 3);\nassert.equal(state.summary.errors, 1);\nassert.equal(state.summary.warnings, 1);\nassert.deepEqual(Array.from(state.summary.sources), [\"api.log\", \"worker.log\"]);\nassert.equal(state.summary.sourceCounts.get(\"api.log\"), 2);\nassert.equal(state.summary.serviceCounts.get(\"api\"), 2);\nassert.equal(state.entries[0].exceptionFingerprint, \"fp-timeout\");\nassert.equal(derivedRefreshes, 1);\n\nconst mainResult = controller.applyFilters(true);\nassert.equal(mainResult.engine, \"main\");\nassert.deepEqual(Array.from(state.filteredIndexes), [0]);\nassert.equal(state.page, 1);\nassert.equal(el.logTable.scrollTop, 0);\nassert.equal(ensureCalls, 1);\nassert.equal(renderCalls, 1);\nassert.equal(autosaves, 1);\nassert.equal(recorded.meta.engine, \"main\");\nassert.ok(state.lastEngine.startsWith(\"main · \"));\nassert.equal(document.body.classList.contains(\"filtering-active\"), false);\n\ncontroller.refreshFilters();\nassert.equal(el.sourceFilter.options.length, 3);\nassert.equal(el.sourceFilter.options[0].value, \"\");\nassert.equal(el.sourceFilter.options[1].textContent, \"api\");\nassert.equal(statsCalls, 1);\nassert.equal(sourceNavCalls, 1);\n\nshouldWorker = true;\nel.queryInput.value = \"\";\nconst workerResult = controller.applyFilters(false);\nassert.equal(workerResult.engine, \"worker\");\nassert.equal(workerPayload.requestId, state.filterRequestId);\nassert.equal(workerPayload.request.query, \"\");\nassert.equal(el.resultsSummary.textContent, \"Filtering in background…\");\nassert.equal(document.body.classList.contains(\"filtering-active\"), true);\n\ncontroller.applyFilteredIndexes([2, 1], [\"bad:token\"], false);\nassert.deepEqual(Array.from(state.filteredIndexes), [2, 1]);\nassert.equal(el.queryInput.classList.contains(\"has-query-error\"), true);\nassert.ok(el.queryInput.title.includes(\"bad:token\"));\nassert.equal(document.body.classList.contains(\"filtering-active\"), false);\n\ncontroller.setControlsEnabled(false);\nassert.equal(el.queryInput.disabled, true);\nassert.equal(el.resetButton.disabled, true);\ncontroller.setControlsEnabled(true);\nassert.equal(el.queryInput.disabled, false);\n\ncontroller.destroy();\nassert.equal(el.queryInput.listeners.get(\"input\").size, 0, \"destroy() must remove query listener\");\nassert.equal(el.fileTabs.listeners.get(\"click\").size, 0, \"destroy() must remove source-tab listener\");\n\nconsole.log(\"dataset-filter-controller-smoke PASS\");\n";
write("tests/dataset-filter-controller-smoke.mjs", controllerSmoke);
write("VERSION", "2.8.20\n");

let readme = read("README.md").replaceAll("2.8.19", "2.8.20");
readme = replaceOnce(
  readme,
  "- feature-level Import + Live Tail controller under `src/app/` that owns file-input/drag-drop orchestration, parsed-entry append state and local tail lifecycle while parser, File System Access and Project Manager capabilities remain root-injected callbacks\n",
  "- feature-level Import + Live Tail controller under `src/app/` that owns file-input/drag-drop orchestration, parsed-entry append state and local tail lifecycle while parser, File System Access and Project Manager capabilities remain root-injected callbacks\n- feature-level Dataset Filter controller under `src/app/` that owns filter-index summaries, filter request/application state and filter/source UI listeners while Query Engine, worker protocol, analysis modules and performance timing remain root-injected callbacks\n",
  "README Dataset Filter feature"
);
write("README.md", readme);

let technical = read("docs/TECHNICAL.md");
technical = replaceOnce(technical, "Current version: **2.8.19**.", "Current version: **2.8.20**.", "technical version");
technical = replaceOnce(
  technical,
  "`import-live-tail-controller.js` owns file-input and drag/drop listeners, import progress/state coordination, parsed-entry append state and the Live Tail lifecycle. Parser execution, File System Access picker/handle reads, Project Manager persistence, worker synchronization and recovery autosave remain root-injected callbacks; the controller never receives those capabilities directly.\n",
  "`import-live-tail-controller.js` owns file-input and drag/drop listeners, import progress/state coordination, parsed-entry append state and the Live Tail lifecycle. Parser execution, File System Access picker/handle reads, Project Manager persistence, worker synchronization and recovery autosave remain root-injected callbacks; the controller never receives those capabilities directly.\n\n`dataset-filter-controller.js` owns the normalized filter index, dataset summary counts, filter request/application state, query validity feedback, filter control enablement and filter/source UI listener lifecycle. Query Engine calls, worker dispatch, exception/health/service/trace analysis and performance timing stay in the root boundary and are exposed only through narrow callbacks.\n",
  "technical Dataset Filter boundary"
);
write("docs/TECHNICAL.md", technical);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout = replaceOnce(
  sourceLayout,
  "`saved-views-controller.js`, `import-live-tail-controller.js`, `investigation-controller.js`",
  "`saved-views-controller.js`, `import-live-tail-controller.js`, `dataset-filter-controller.js`, `investigation-controller.js`",
  "source layout Dataset Filter controller list"
);
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let srcReadme = read("src/README.md");
srcReadme = replaceOnce(
  srcReadme,
  "`app/import-live-tail-controller.js` owns file import/drag-drop UI orchestration, parsed-entry append state and Live Tail lifecycle while parser, File System Access, Project Manager, worker and recovery capabilities remain root-injected callbacks.\n",
  "`app/import-live-tail-controller.js` owns file import/drag-drop UI orchestration, parsed-entry append state and Live Tail lifecycle while parser, File System Access, Project Manager, worker and recovery capabilities remain root-injected callbacks.\n\n`app/dataset-filter-controller.js` owns normalized filter-index/summary state, filter request/application orchestration and filter/source UI listeners while Query Engine, worker dispatch, analysis modules and performance timing remain root-injected callbacks.\n",
  "src README Dataset Filter boundary"
);
write("src/README.md", srcReadme);

let changelog = read("CHANGELOG.md");
const releaseNotes = [
  "## 2.8.20 — 2026-09-18",
  "",
  "### Dataset filter application boundary",
  "- Extracted normalized filter-index construction, dataset summary counts, filter request/application state, query-validity feedback, control enablement and filter/source event ownership into `src/app/dataset-filter-controller.js`.",
  "- Kept Query Engine evaluation, worker protocol/dispatch, exception and service analysis, trace aggregation and performance timing in the root boundary behind narrow callbacks.",
  "- Preserved worker threshold behavior, request IDs, background-filter UI state, page reset/windowed-scroll semantics and source filter restoration.",
  "",
  "### Maintainability and verification",
  "- Added isolated Dataset Filter controller coverage for index/summary construction, main-thread filtering, worker dispatch handoff, source options, query errors and listener lifecycle.",
  "- Added capability assertions preventing direct worker, Query Engine, analysis-module, storage, filesystem or network access from the controller.",
  "- Updated permanent source-layout and HTTP smoke gates while preserving the zero-build local-first runtime.",
  "",
  ""
].join("\n");
changelog = replaceOnce(changelog, "# Changelog\n\n", "# Changelog\n\n" + releaseNotes, "changelog release insertion");
write("CHANGELOG.md", changelog);

const finalController = read("src/app/dataset-filter-controller.js");
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
]) assert.ok(!finalController.includes(token), `forbidden Dataset Filter controller capability reference: ${token}`);
assert.ok(!/\bfetch\s*\(/.test(finalController), "forbidden Dataset Filter controller fetch() capability");

const finalApp = read("app.js");
assert.ok(finalApp.includes("engine().filterIndexes"), "Query Engine filtering must remain root-owned");
assert.ok(finalApp.includes("state.worker.postMessage"), "worker dispatch must remain root-owned");
assert.ok(finalApp.includes("window.SignalDockExceptionGroups"), "analysis capability must remain root-owned");
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
]) assert.ok(!finalApp.includes(token), `root still owns filter UI listener: ${token}`);

assert.ok(read("index.html").indexOf("src/app/dataset-filter-controller.js") < read("index.html").indexOf("app.js"), "Dataset Filter controller must load before app.js");
console.log("SignalDock v2.8.20 migration prepared successfully.");
