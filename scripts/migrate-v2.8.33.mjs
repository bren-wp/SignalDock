import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, content) => fs.writeFileSync(path.join(root, name), content);

function r1(source, before, after, label) {
  assert.ok(source.includes(before), "migration anchor missing: " + label);
  assert.equal(source.indexOf(before), source.lastIndexOf(before), "migration anchor ambiguous: " + label);
  return source.replace(before, after);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "migration block missing: " + label);
  return source.slice(0, start) + replacement + source.slice(end);
}

assert.equal(read("VERSION").trim(), "2.8.32");

let app = read("app.js");
app = r1(app, '  const APP_VERSION = "2.8.32";', '  const APP_VERSION = "2.8.33";', "APP_VERSION");
app = r1(
  app,
  '  let startupStateController = null;\n',
  '  let startupStateController = null;\n  let datasetViewComposition = null;\n',
  "Dataset View composition slot"
);

const preferenceHydration = '    startupStateController.hydratePreferences();';
const compositionWiring = [
  preferenceHydration,
  '    if (!window.SignalDockDatasetViewComposition?.create) throw new Error("SignalDock Dataset View composition is unavailable.");',
  '    datasetViewComposition = window.SignalDockDatasetViewComposition.create({',
  '      state,',
  '      el,',
  '      ownerDocument: document,',
  '      ownerWindow: window,',
  '      modules: {',
  '        savedViews: window.SignalDockSavedViewsController,',
  '        datasetFilter: window.SignalDockDatasetFilterController,',
  '        tableView: window.SignalDockTableViewController,',
  '        datasetOverview: window.SignalDockDatasetOverviewController,',
  '        viewOrchestrator: window.SignalDockViewOrchestratorController',
  '      },',
  '      services: {',
  '        utils: utils(),',
  '        engine: engine(),',
  '        getProfiler: profiler,',
  '        analysis: {',
  '          exceptionGroups: window.SignalDockExceptionGroups,',
  '          exceptionTrends: window.SignalDockExceptionTrends,',
  '          serviceHealth: window.SignalDockServiceHealth,',
  '          serviceMatrix: window.SignalDockServiceMatrix,',
  '          serviceHeatmap: window.SignalDockServiceHeatmap,',
  '          serviceTrends: window.SignalDockServiceTrends,',
  '          traceExplorer: window.SignalDockTraceExplorer,',
  '          traceOutliers: window.SignalDockTraceOutliers,',
  '          virtualViewport: window.SignalDockVirtualViewport',
  '        }',
  '      },',
  '      actions: {',
  '        persistSavedViews: (views) => utils().saveJson(STORAGE_VIEWS, views),',
  '        requestSavedViewName: (message, suggested) => window.prompt(message, suggested),',
  '        createViewId: () => Date.now() + "-" + Math.random().toString(36).slice(2, 7),',
  '        syncLevelChips,',
  '        applyFilters,',
  '        toast,',
  '        ensurePageInRange,',
  '        renderDataViews,',
  '        scheduleViewAutosave: () => scheduleViewAutosave(),',
  '        updateStats,',
  '        renderSourceNavigation,',
  '        selectEntry,',
  '        getSources,',
  '        scheduleFrame: (callback) => requestAnimationFrame(callback),',
  '        now: () => performance.now()',
  '      },',
  '      getters: {',
  '        getFilterWorker: () => filterWorkerController,',
  '        getTraceExplorerController: () => traceExplorerController,',
  '        getInspectorController: () => inspectorController',
  '      }',
  '    });'
].join("\n");
app = r1(app, preferenceHydration, compositionWiring, "Dataset View composition wiring");

app = replaceBlock(
  app,
  '    if (!window.SignalDockSavedViewsController?.create)',
  '    if (!window.SignalDockImportLiveTailController?.create)',
  '    savedViewsController = datasetViewComposition.createSavedViews();\n    savedViewsController.bind();\n',
  "Saved Views factory wiring"
);
app = replaceBlock(
  app,
  '    if (!window.SignalDockDatasetFilterController?.create)',
  '    if (!window.SignalDockTableViewController?.create)',
  '    datasetFilterController = datasetViewComposition.createDatasetFilter();\n    datasetFilterController.bind();\n',
  "Dataset Filter factory wiring"
);
app = replaceBlock(
  app,
  '    if (!window.SignalDockTableViewController?.create)',
  '    if (!window.SignalDockWorkspaceController?.create)',
  '    tableViewController = datasetViewComposition.createTableView();\n    tableViewController.bind();\n',
  "Table View factory wiring"
);
app = replaceBlock(
  app,
  '    if (!window.SignalDockDatasetOverviewController?.create)',
  '    if (!window.SignalDockFilterWorkerController?.create)',
  '    datasetOverviewController = datasetViewComposition.createDatasetOverview();\n    datasetOverviewController.bind();\n',
  "Dataset Overview factory wiring"
);
app = replaceBlock(
  app,
  '    if (!window.SignalDockViewOrchestratorController?.create)',
  '    startupStateController.hydrateInvestigation();',
  '    viewOrchestratorController = datasetViewComposition.createViewOrchestrator();\n',
  "View Orchestrator factory wiring"
);
write("app.js", app);

let html = read("index.html");
html = r1(
  html,
  '  <script src="src/app/startup-state-controller.js" defer></script>\n  <script src="app.js" defer></script>',
  '  <script src="src/app/startup-state-controller.js" defer></script>\n  <script src="src/app/dataset-view-composition.js" defer></script>\n  <script src="app.js" defer></script>',
  "Dataset View composition script"
);
write("index.html", html);

let layout = read("tests/source-layout-smoke.mjs");
layout = r1(
  layout,
  '  "src/app/startup-state-controller.js",\n',
  '  "src/app/startup-state-controller.js",\n  "src/app/dataset-view-composition.js",\n',
  "source layout Dataset View composition"
);
write("tests/source-layout-smoke.mjs", layout);
write("tests/dataset-view-composition-smoke.mjs", "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst source = read(\"src/app/dataset-view-composition.js\");\n\nassert.ok(html.includes(\"src/app/dataset-view-composition.js\"));\nassert.ok(html.indexOf(\"src/app/dataset-view-composition.js\") < html.indexOf(\"app.js\"));\nassert.ok(app.includes(\"SignalDockDatasetViewComposition.create\"));\nfor (const token of [\n  \"datasetViewComposition.createSavedViews()\",\n  \"datasetViewComposition.createDatasetFilter()\",\n  \"datasetViewComposition.createTableView()\",\n  \"datasetViewComposition.createDatasetOverview()\",\n  \"datasetViewComposition.createViewOrchestrator()\"\n]) assert.ok(app.includes(token), \"app composition call missing: \" + token);\n\nfor (const token of [\n  \"SignalDockStorageAdapter\", \"SignalDockPersistence\", \"localStorage\", \"sessionStorage\",\n  \"indexedDB\", \"showOpenFilePicker\", \"new Worker\", \".postMessage(\", \"XMLHttpRequest\",\n  \"WebSocket\", \"EventSource\", \".invoke(\"\n]) assert.ok(!source.includes(token), \"forbidden Dataset View composition capability: \" + token);\nassert.ok(!/\\bfetch\\s*\\(/.test(source));\n\nconst created = {};\nconst optionsByName = {};\nfunction moduleFor(name, extra = {}) {\n  return {\n    create(options) {\n      created[name] = (created[name] || 0) + 1;\n      optionsByName[name] = options;\n      return Object.freeze({ name, ...extra });\n    }\n  };\n}\n\nconst modules = {\n  savedViews: moduleFor(\"savedViews\", { render(){}, bind(){} }),\n  datasetFilter: moduleFor(\"datasetFilter\", {\n    rebuildFilterIndex(){ return [\"rebuild\"]; },\n    refreshFilters(){ return [\"refresh\"]; },\n    setControlsEnabled(){},\n    applyFilters(){ return [\"apply\"]; },\n    bind(){}\n  }),\n  tableView: moduleFor(\"tableView\", { renderTable(){}, bind(){} }),\n  datasetOverview: moduleFor(\"datasetOverview\", {\n    updateStats(){},\n    renderTimeline(){},\n    updateActiveSourceUI(){},\n    bind(){}\n  }),\n  viewOrchestrator: moduleFor(\"viewOrchestrator\", {})\n};\n\nconst state = {\n  entries:[{ level:\"ERROR\" }],\n  serviceGraph:{old:true},\n  exceptionGroups:[],\n  exceptionTrends:null,\n  healthData:null,\n  serviceMatrixData:null,\n  serviceHeatmapData:null,\n  serviceTrendsData:null,\n  traceExplorerData:null,\n  traceOutlierData:null\n};\nconst el = {};\nconst document = { defaultView:{ innerWidth:1200 }, querySelectorAll(){ return []; } };\nconst calls = [];\nconst filterWorker = { canUseWorker(){ return true; }, requestFilter(payload){ calls.push([\"worker\",payload]); return true; } };\nconst traceController = { reconcileSelection(value){ calls.push([\"trace\",value]); } };\nconst inspector = { render(){ calls.push([\"inspector\"]); } };\nconst host = { document };\nvm.runInNewContext(source, { self:host, window:host, console, Object, Date }, { filename:\"dataset-view-composition.js\" });\n\nconst composition = host.SignalDockDatasetViewComposition.create({\n  state,\n  el,\n  ownerDocument:document,\n  ownerWindow:document.defaultView,\n  modules,\n  services:{\n    utils:{\n      debounce:(fn)=>fn,\n      shortSource:(value)=>\"short:\"+value,\n      formatTime:(value)=>\"time:\"+value,\n      formatBytes:(value)=>\"bytes:\"+value\n    },\n    engine:{\n      parseSmartQuery:(query)=>({query}),\n      filterIndexes:()=>({indexes:[0],parsed:{invalid:[]}})\n    },\n    getProfiler:()=>({ record:(name,elapsed,meta)=>calls.push([\"perf\",name,elapsed,meta]) }),\n    analysis:{\n      exceptionGroups:{ candidate:()=>true, fingerprint:()=>\"fp\", group:()=>[{id:\"eg\"}] },\n      exceptionTrends:{ analyze:()=>({trend:true}) },\n      serviceHealth:{ analyze:()=>({health:true}) },\n      serviceMatrix:{ build:()=>({matrix:true}) },\n      serviceHeatmap:{ build:()=>({heatmap:true}) },\n      serviceTrends:{ compare:()=>({trends:true}) },\n      traceExplorer:{ buildWindow:()=>({trace:true}) },\n      traceOutliers:{ rank:()=>({outliers:true}) },\n      virtualViewport:{ calculate:()=>({start:0,end:1}) }\n    }\n  },\n  actions:{\n    persistSavedViews:()=>calls.push([\"persist\"]),\n    requestSavedViewName:()=>\"View\",\n    createViewId:()=>\"view-1\",\n    syncLevelChips:()=>calls.push([\"chips\"]),\n    applyFilters:()=>calls.push([\"applyFilters\"]),\n    toast:()=>{},\n    ensurePageInRange:()=>{},\n    renderDataViews:()=>{},\n    scheduleViewAutosave:()=>{},\n    updateStats:()=>{},\n    renderSourceNavigation:()=>{},\n    selectEntry:()=>{},\n    getSources:()=>[\"a.log\"],\n    scheduleFrame:(fn)=>fn(),\n    now:()=>10\n  },\n  getters:{\n    getFilterWorker:()=>filterWorker,\n    getTraceExplorerController:()=>traceController,\n    getInspectorController:()=>inspector\n  }\n});\n\nassert.ok(Object.isFrozen(composition));\nassert.equal(composition.createSavedViews(), composition.createSavedViews());\nassert.equal(created.savedViews, 1);\nassert.equal(composition.createDatasetFilter(), composition.createDatasetFilter());\nassert.equal(created.datasetFilter, 1);\nassert.equal(optionsByName.datasetFilter.shouldUseWorkerFilter(), true);\nassert.equal(optionsByName.datasetFilter.requestWorkerFilter({requestId:1}), true);\noptionsByName.datasetFilter.refreshDerivedAnalysis();\nassert.equal(state.serviceGraph, null);\nassert.equal(state.exceptionGroups.length, 1);\nassert.equal(state.exceptionTrends.trend, true);\nassert.equal(state.healthData.health, true);\nassert.equal(state.serviceMatrixData.matrix, true);\nassert.equal(state.serviceHeatmapData.heatmap, true);\nassert.equal(state.serviceTrendsData.trends, true);\nassert.equal(state.traceExplorerData.trace, true);\nassert.equal(state.traceOutlierData.outliers, true);\nassert.ok(calls.some((item)=>item[0]===\"trace\"));\n\nassert.equal(composition.createTableView(), composition.createTableView());\nassert.equal(created.tableView, 1);\nassert.equal(composition.createDatasetOverview(), composition.createDatasetOverview());\nassert.equal(created.datasetOverview, 1);\nassert.equal(composition.createViewOrchestrator(), composition.createViewOrchestrator());\nassert.equal(created.viewOrchestrator, 1);\n\noptionsByName.viewOrchestrator.renderInspector();\nassert.ok(calls.some((item)=>item[0]===\"inspector\"));\nconsole.log(\"dataset-view-composition-smoke PASS\");\n");

const ownershipTests = [
  ["tests/saved-views-controller-smoke.mjs", 'const controllerSource = read("src/app/saved-views-controller.js");\n', 'assert.ok(app.includes("SignalDockSavedViewsController.create"), "Saved Views controller factory wiring missing");', "savedViews", "SignalDockSavedViewsController", "datasetViewComposition.createSavedViews()"],
  ["tests/dataset-filter-controller-smoke.mjs", 'const controllerSource = read("src/app/dataset-filter-controller.js");\n', 'assert.ok(app.includes("SignalDockDatasetFilterController.create"), "Dataset Filter controller factory wiring missing");', "datasetFilter", "SignalDockDatasetFilterController", "datasetViewComposition.createDatasetFilter()"],
  ["tests/table-view-controller-smoke.mjs", 'const controllerSource = read("src/app/table-view-controller.js");\n', 'assert.ok(app.includes("SignalDockTableViewController.create"));', "tableView", "SignalDockTableViewController", "datasetViewComposition.createTableView()"],
  ["tests/dataset-overview-controller-smoke.mjs", 'const controllerSource = read("src/app/dataset-overview-controller.js");\n', 'assert.ok(app.includes("SignalDockDatasetOverviewController.create"), "Dataset Overview controller factory wiring missing");', "datasetOverview", "SignalDockDatasetOverviewController", "datasetViewComposition.createDatasetOverview()"],
  ["tests/view-orchestrator-controller-smoke.mjs", 'const source = read("src/app/view-orchestrator-controller.js");\n', 'assert.ok(app.includes("SignalDockViewOrchestratorController.create"));', "viewOrchestrator", "SignalDockViewOrchestratorController", "datasetViewComposition.createViewOrchestrator()"]
];

for (const [file, declarationAnchor, oldAssertion, moduleName, globalName, appToken] of ownershipTests) {
  let test = read(file);
  test = r1(
    test,
    declarationAnchor,
    declarationAnchor + 'const compositionSource = read("src/app/dataset-view-composition.js");\n',
    file + " composition source"
  );
  test = r1(
    test,
    oldAssertion,
    'assert.ok(compositionSource.includes("modules.' + moduleName + '.create"), "composition module create wiring missing: ' + moduleName + '");\n'
      + 'assert.ok(app.includes("' + moduleName + ': window.' + globalName + '"), "root composition module mapping missing: ' + moduleName + '");\n'
      + 'assert.ok(app.includes("' + appToken + '"), "root composition call missing: ' + appToken + '");',
    file + " factory ownership"
  );
  write(file, test);
}

write("VERSION", "2.8.33\n");
write("README.md", read("README.md").replaceAll("2.8.32", "2.8.33"));

let website = read("website/index.html").replaceAll("2.8.32", "2.8.33");
website = r1(
  website,
  '        <li>Startup state hydration now has one explicit application owner</li>\n        <li>Saved Views and settings preserve legacy migration order without root storage glue</li>\n        <li>Investigation, baseline, project and checkpoint initialization is phase-idempotent</li>\n        <li>Startup composition is thinner while domain loaders stay injected and testable</li>',
  '        <li>Dataset View controllers now share one explicit lazy composition factory</li>\n        <li>Saved Views, Filter, Table, Overview and View Orchestrator keep their existing bind order</li>\n        <li>Worker, Inspector and trace dependencies remain late-bound through narrow getters</li>\n        <li>Platform-heavy Live Tail and Workspace flows stay outside the pure view composition boundary</li>',
  "website release highlights"
);
write("website/index.html", website);

let websiteTest = read("tests/website-production-smoke.mjs")
  .replace('assert.equal(version, "2.8.32");', 'assert.equal(version, "2.8.33");')
  .replace("SignalDock v2.8.32", "SignalDock v2.8.33");
write("tests/website-production-smoke.mjs", websiteTest);

let technical = read("docs/TECHNICAL.md").replace("Current version: **2.8.32**.", "Current version: **2.8.33**.");
technical += "\n\nDataset View composition: src/app/dataset-view-composition.js lazily creates Saved Views, Dataset Filter, Table View, Dataset Overview and View Orchestrator controllers from explicit modules, services, actions and late-bound getters. Root init keeps the original create/bind ordering. Worker, Inspector and trace-controller dependencies remain getter-injected; platform-heavy Import/Live Tail and Workspace orchestration intentionally remain outside this composition boundary.\n";
write("docs/TECHNICAL.md", technical);

let srcReadme = read("src/README.md");
srcReadme += "\n\napp/dataset-view-composition.js is the lazy composition factory for Saved Views, Dataset Filter, Table View, Dataset Overview and View Orchestrator. It owns wiring only; feature logic remains in the individual controllers.\n";
write("src/README.md", srcReadme);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout += "\n\nDataset View composition boundary: src/app/dataset-view-composition.js owns explicit lazy wiring for the pure dataset-view controller stack. It must not acquire storage, filesystem, worker-construction or network capabilities.\n";
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let changelog = read("CHANGELOG.md");
const notes = [
  "## 2.8.33 — 2026-09-18",
  "",
  "### Dataset View composition",
  "- Added src/app/dataset-view-composition.js as the lazy wiring owner for Saved Views, Dataset Filter, Table View, Dataset Overview and View Orchestrator.",
  "- Replaced five large Controller.create option blocks in app.js with explicit composition create calls while preserving the original bind/startup order.",
  "- Kept Worker, Inspector and Trace Explorer dependencies late-bound through injected getters so the composition factory does not own those sibling controllers.",
  "- Kept Import/Live Tail and Workspace outside this factory because they cross File System Access and save/read capability boundaries.",
  "",
  ""
].join("\n");
changelog = r1(changelog, "# Changelog\n\n", "# Changelog\n\n" + notes, "changelog");
write("CHANGELOG.md", changelog);

const finalApp = read("app.js");
assert.ok(finalApp.includes("SignalDockDatasetViewComposition.create"));
for (const token of [
  "datasetViewComposition.createSavedViews()",
  "datasetViewComposition.createDatasetFilter()",
  "datasetViewComposition.createTableView()",
  "datasetViewComposition.createDatasetOverview()",
  "datasetViewComposition.createViewOrchestrator()"
]) assert.ok(finalApp.includes(token), "final app composition call missing: " + token);
assert.ok(!finalApp.includes("SignalDockSavedViewsController.create({"));
assert.ok(!finalApp.includes("SignalDockDatasetFilterController.create({"));
assert.ok(!finalApp.includes("SignalDockTableViewController.create({"));
assert.ok(!finalApp.includes("SignalDockDatasetOverviewController.create({"));
assert.ok(!finalApp.includes("SignalDockViewOrchestratorController.create({"));
assert.ok(read("website/index.html").includes("SignalDock v2.8.33"));
console.log("SignalDock v2.8.33 migration prepared successfully.");
