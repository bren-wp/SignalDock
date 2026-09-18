import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, content) => fs.writeFileSync(path.join(root, name), content);
function replaceOnce(source,before,after,label){assert.ok(source.includes(before),`migration anchor missing: ${label}`);assert.equal(source.indexOf(before),source.lastIndexOf(before),`migration anchor ambiguous: ${label}`);return source.replace(before,after);}

assert.equal(read("VERSION").trim(),"2.8.20");
let app=read("app.js");
app=replaceOnce(app,'  const APP_VERSION = "2.8.20";','  const APP_VERSION = "2.8.21";',"APP_VERSION");
app=replaceOnce(app,'  const MAX_VIRTUAL_SCROLL_PX = 8000000;\n',"","virtual max constant");
app=replaceOnce(app,'  let datasetFilterController = null;\n  let virtualSpacerRules = null;\n','  let datasetFilterController = null;\n  let tableViewController = null;\n',"table controller slot");

const anchor='    datasetFilterController.bind();';
const wiring=[
 anchor,
 '    if (!window.SignalDockTableViewController?.create) throw new Error("SignalDock Table View controller is unavailable.");',
 '    tableViewController = window.SignalDockTableViewController.create({',
 '      state,',
 '      el,',
 '      ownerDocument: document,',
 '      ownerWindow: window,',
 '      debounce: (callback, wait) => utils().debounce(callback, wait),',
 '      scheduleFrame: (callback) => requestAnimationFrame(callback),',
 '      now: () => performance.now(),',
 '      calculateVirtualViewport: (options) => window.SignalDockVirtualViewport?.calculate?.(options) || null,',
 '      formatTime: (value) => utils().formatTime(value),',
 '      shortSource: (value) => utils().shortSource(value),',
 '      recordPerformance: (elapsed, meta) => profiler()?.record?.("table-render", elapsed, meta),',
 '      scheduleViewAutosave: () => scheduleViewAutosave(),',
 '      selectEntry',
 '    });',
 '    tableViewController.bind();'
].join("\n");
app=replaceOnce(app,anchor,wiring,"table controller wiring");

const listenerBlock=[
 '    el.prevPage.addEventListener("click", () => setPage(state.page - 1));',
 '    el.nextPage.addEventListener("click", () => setPage(state.page + 1));',
 '    el.pageSize.addEventListener("change", () => {',
 '      state.pageSize = Number(el.pageSize.value) || 100;',
 '      state.page = 1;',
 '      renderTable();',
 '      scheduleViewAutosave();',
 '    });',
 '    el.renderMode?.addEventListener("change", () => {',
 '      state.renderMode = el.renderMode.value === "virtual" ? "virtual" : "paged";',
 '      state.page = 1;',
 '      el.logTable.scrollTop = 0;',
 '      renderTable();',
 '      scheduleViewAutosave();',
 '    });',
 '    el.logTable.addEventListener("scroll", () => {',
 '      if (state.renderMode !== "virtual") return;',
 '      const now = performance.now();',
 '      const delta = Math.abs(el.logTable.scrollTop - state.virtual.lastScrollTop);',
 '      const elapsed = Math.max(1, now - state.virtual.lastScrollAt);',
 '      const velocity = delta / elapsed;',
 '      state.virtual.overscan = Math.max(10, Math.min(64, Math.round(10 + velocity * 10)));',
 '      state.virtual.lastScrollTop = el.logTable.scrollTop;',
 '      state.virtual.lastScrollAt = now;',
 '      if (state.virtual.raf) return;',
 '      state.virtual.raf = requestAnimationFrame(() => {',
 '        state.virtual.raf = 0;',
 '        renderVirtualTable(false);',
 '      });',
 '    });',
 '',
 '    el.logTable.addEventListener("click", (event) => {',
 '      const row = event.target.closest("[data-entry-id]");',
 '      if (row) selectEntry(row.dataset.entryId);',
 '    });',
].join("\n");
app=replaceOnce(app,listenerBlock,"","table listener ownership");
app=replaceOnce(app,'    window.addEventListener("resize", utils().debounce(() => { if (state.renderMode === "virtual") renderTable(); }, 120));\n\n',"","table resize ownership");

const start=app.indexOf("  function renderTable() {");
const end=app.indexOf("  function selectedEntry() {",start);
assert.ok(start>=0&&end>start,"table block not found");
const delegates=[
 '  function renderTable() { return tableViewController?.renderTable(); }',
 '',
 '  function canUseVirtualTable() { return tableViewController?.canUseVirtualTable() || false; }',
 '',
 '  function renderVirtualTable(resetScroll = false) { return tableViewController?.renderVirtualTable(resetScroll); }',
 '',
 '  function ensurePageInRange() { return tableViewController?.ensurePageInRange(); }',
 '',
 '  function setPage(page) { return tableViewController?.setPage(page); }',
 '',
].join("\n");
app=app.slice(0,start)+delegates+app.slice(end);

const entryStart=app.indexOf("  function entryRowIntoView(globalIndex) {");
const entryEnd=app.indexOf("  function filterByServiceValue(service) {",entryStart);
assert.ok(entryStart>=0&&entryEnd>entryStart,"entryRowIntoView block not found");
app=app.slice(0,entryStart)+'  function entryRowIntoView(globalIndex) { return tableViewController?.entryRowIntoView(globalIndex); }\n\n'+app.slice(entryEnd);
write("app.js",app);

let html=read("index.html");
html=replaceOnce(html,'  <script src="src/app/dataset-filter-controller.js" defer></script>\n','  <script src="src/app/dataset-filter-controller.js" defer></script>\n  <script src="src/app/table-view-controller.js" defer></script>\n',"table controller script");
write("index.html",html);

let layout=read("tests/source-layout-smoke.mjs");
layout=replaceOnce(layout,'  "src/app/dataset-filter-controller.js",\n','  "src/app/dataset-filter-controller.js",\n  "src/app/table-view-controller.js",\n',"layout table controller");
write("tests/source-layout-smoke.mjs",layout);

let foundationTest=read("tests/static-foundation-ui-smoke.mjs");
foundationTest=replaceOnce(
  foundationTest,
  'const baselineController = read("src/app/baseline-controller.js");\n',
  'const baselineController = read("src/app/baseline-controller.js");\nconst tableViewController = read("src/app/table-view-controller.js");\n',
  "foundation Table View owner"
);
foundationTest=replaceOnce(
  foundationTest,
  'assert.ok(app.includes(\'icon.setAttribute("aria-hidden", "true")\'));\n',
  'assert.ok(tableViewController.includes(\'icon.setAttribute("aria-hidden", "true")\'));\n',
  "foundation table icon assertion"
);
write("tests/static-foundation-ui-smoke.mjs",foundationTest);
write("tests/table-view-controller-smoke.mjs","import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst controllerSource = read(\"src/app/table-view-controller.js\");\n\nassert.ok(html.includes('src/app/table-view-controller.js'));\nassert.ok(html.indexOf('src/app/table-view-controller.js') < html.indexOf('app.js'));\nassert.ok(app.includes(\"SignalDockTableViewController.create\"));\nassert.ok(app.includes(\"tableViewController.bind();\"));\n\nfor (const token of [\n  'el.prevPage.addEventListener(\"click\"',\n  'el.nextPage.addEventListener(\"click\"',\n  'el.pageSize.addEventListener(\"change\"',\n  'el.renderMode?.addEventListener(\"change\"',\n  'el.logTable.addEventListener(\"scroll\"',\n  'el.logTable.addEventListener(\"click\"',\n  'window.addEventListener(\"resize\"'\n]) assert.ok(!app.includes(token), `root still owns table listener: ${token}`);\n\nfor (const token of [\n  \"SignalDockVirtualViewport\", \"SignalDockQueryEngine\", \"SignalDockPersistence\",\n  \"SignalDockStorageAdapter\", \"showOpenFilePicker\", \"indexedDB\", \"new Worker\",\n  \".postMessage(\", \"XMLHttpRequest\", \"WebSocket\", \"EventSource\", \".invoke(\"\n]) assert.ok(!controllerSource.includes(token), `forbidden Table View capability reference: ${token}`);\n\nclass FakeClassList {\n  constructor(){ this.values=new Set(); }\n  add(v){ this.values.add(v); }\n  remove(v){ this.values.delete(v); }\n  contains(v){ return this.values.has(v); }\n}\nclass FakeNode {\n  constructor(doc){ this.ownerDocument=doc; this.children=[]; this.dataset={}; this.listeners=new Map(); this.classList=new FakeClassList(); this.value=\"\"; this.disabled=false; this.scrollTop=0; this.clientHeight=420; this.textContent=\"\"; this.title=\"\"; }\n  addEventListener(t,h){ if(!this.listeners.has(t)) this.listeners.set(t,new Set()); this.listeners.get(t).add(h); }\n  removeEventListener(t,h){ this.listeners.get(t)?.delete(h); }\n  replaceChildren(...n){ this.children=[...n]; }\n  appendChild(n){ this.children.push(n); return n; }\n  append(...n){ this.children.push(...n); }\n  setAttribute(k,v){ this[k]=String(v); }\n}\nconst topRule={selectorText:\".virtual-spacer--top\",style:{}};\nconst bottomRule={selectorText:\".virtual-spacer--bottom\",style:{}};\nconst document={\n  body:new FakeNode(null),\n  styleSheets:[{cssRules:[topRule,bottomRule]}],\n  createElement:()=>new FakeNode(document),\n  createElementNS:()=>new FakeNode(document),\n  createDocumentFragment:()=>new FakeNode(document)\n};\ndocument.body.ownerDocument=document;\nconst windowObj={innerWidth:1200,listeners:new Map(),addEventListener(t,h){this.listeners.set(t,h);},removeEventListener(t,h){if(this.listeners.get(t)===h)this.listeners.delete(t);},cancelAnimationFrame(){}};\ndocument.defaultView=windowObj;\n\nconst rootGlobal={document};\nvm.runInNewContext(controllerSource,{self:rootGlobal,window:rootGlobal,console},{filename:\"table-view-controller.js\"});\n\nconst el={\n  logTable:new FakeNode(document),resultsSummary:new FakeNode(document),pageLabel:new FakeNode(document),\n  prevPage:new FakeNode(document),nextPage:new FakeNode(document),pageSize:new FakeNode(document),renderMode:new FakeNode(document)\n};\nel.pageSize.value=\"2\"; el.renderMode.value=\"virtual\";\n\nconst state={\n  entries:[\n    {id:\"sd-0\",timestamp:\"2026-09-18T10:00:00Z\",level:\"INFO\",source:\"a.log\",service:\"—\",message:\"a\"},\n    {id:\"sd-1\",timestamp:\"2026-09-18T10:01:00Z\",level:\"ERROR\",source:\"b.log\",service:\"api\",message:\"b\"},\n    {id:\"sd-2\",timestamp:\"2026-09-18T10:02:00Z\",level:\"WARN\",source:\"c.log\",service:\"—\",message:\"c\"}\n  ],\n  filteredIndexes:[0,1,2],\n  page:1,pageSize:2,renderMode:\"paged\",renderGeneration:0,selectedId:null,\n  settings:{wrap:false,compact:false},\n  virtual:{start:0,end:0,overscan:10,rowHeight:46,pitch:50,compressed:false,lastScrollTop:0,lastScrollAt:0,raf:0},\n  lastEngine:\"main\"\n};\nlet perf=0, selected=\"\", autosave=0, clock=0;\nconst calculate=({total,scrollTop})=>({start:Math.min(total-1,Math.max(0,Math.floor(scrollTop/50))),end:Math.min(total,Math.max(1,Math.floor(scrollTop/50)+2)),pitch:50,compressed:false,topSpacerPx:Math.max(0,Math.floor(scrollTop/50))*50,bottomSpacerPx:0,maxScrollPx:8000000,logicalHeight:total*50});\nconst controller=rootGlobal.SignalDockTableViewController.create({\n  state,el,ownerDocument:document,ownerWindow:windowObj,\n  debounce:(fn)=>fn,scheduleFrame:(fn)=>{fn();return 1;},now:()=>++clock,\n  calculateVirtualViewport:calculate,formatTime:()=> \"10:00\",shortSource:(s)=>s,\n  recordPerformance:()=>{perf+=1;},scheduleViewAutosave:()=>{autosave+=1;},selectEntry:(id)=>{selected=id;}\n});\ncontroller.bind(); controller.bind();\nassert.equal(el.prevPage.listeners.get(\"click\").size,1);\ncontroller.renderTable();\nassert.equal(el.logTable.children.length,2);\nassert.ok(el.resultsSummary.textContent.includes(\"Showing 1–2 of 3\"));\nstate.renderMode=\"virtual\";\ncontroller.renderTable();\nassert.ok(document.body.classList.contains(\"virtual-log-view\"));\nassert.equal(el.pageLabel.textContent,\"Windowed\");\n\nel.logTable.scrollTop=0;\ncontroller.entryRowIntoView(2);\nassert.equal(el.logTable.scrollTop,100,\"virtual navigation must preserve computed target scroll\");\nassert.equal(state.virtual.start,2);\n\ncontroller.setPage(1);\nstate.renderMode=\"paged\";\ncontroller.setPage(2);\nassert.equal(state.page,2);\nassert.equal(autosave,1);\n\ncontroller.destroy();\nassert.equal(el.prevPage.listeners.get(\"click\").size,0);\nconsole.log(\"table-view-controller-smoke PASS\");\n");
write("VERSION","2.8.21\n");

let readme=read("README.md").replaceAll("2.8.20","2.8.21");
const readmeAnchor="- feature-level Dataset Filter controller under `src/app/` that owns filter-index summaries, filter request/application state and filter/source UI listeners while Query Engine, worker protocol, analysis modules and performance timing remain root-injected callbacks\n";
if(readme.includes(readmeAnchor)) readme=readme.replace(readmeAnchor,readmeAnchor+"- feature-level Table View controller under `src/app/` that owns paged/windowed rendering, pagination, virtual spacers, row DOM and table listeners while virtual-viewport calculation and performance recording remain root-injected callbacks\n");
write("README.md",readme);

let technical=read("docs/TECHNICAL.md").replace("Current version: **2.8.20**.","Current version: **2.8.21**.");
const techAnchor="`dataset-filter-controller.js` owns the normalized filter index, dataset summary counts, filter request/application state, query validity feedback, filter control enablement and filter/source UI listener lifecycle. Query Engine calls, worker dispatch, exception/health/service/trace analysis and performance timing stay in the root boundary and are exposed only through narrow callbacks.\n";
technical=replaceOnce(technical,techAnchor,techAnchor+"\n`table-view-controller.js` owns paged and virtual table rendering, pagination, virtual spacer management, row DOM construction, scroll/page/render-mode listeners and row navigation. Virtual viewport calculation, formatting, selection and performance recording remain explicit root-injected callbacks.\n","technical table boundary");
write("docs/TECHNICAL.md",technical);

let sourceLayout=read("docs/SOURCE-LAYOUT.md");
sourceLayout=replaceOnce(sourceLayout,"`import-live-tail-controller.js`, `dataset-filter-controller.js`, `investigation-controller.js`","`import-live-tail-controller.js`, `dataset-filter-controller.js`, `table-view-controller.js`, `investigation-controller.js`","source layout list");
write("docs/SOURCE-LAYOUT.md",sourceLayout);

let srcReadme=read("src/README.md");
const srcAnchor="`app/dataset-filter-controller.js` owns normalized filter-index/summary state, filter request/application orchestration and filter/source UI listeners while Query Engine, worker dispatch, analysis modules and performance timing remain root-injected callbacks.\n";
srcReadme=replaceOnce(srcReadme,srcAnchor,srcAnchor+"\n`app/table-view-controller.js` owns paged/windowed rendering, pagination, virtual spacers, row DOM and table listeners while viewport calculation, formatting, selection and performance timing remain root-injected callbacks.\n","src README table");
write("src/README.md",srcReadme);

let changelog=read("CHANGELOG.md");
const notes=[
 "## 2.8.21 — 2026-09-18","",
 "### Table View application boundary",
 "- Extracted paged rendering, virtual/windowed rendering, pagination, virtual spacer CSS coordination, row DOM construction, table listeners and entry-row navigation into `src/app/table-view-controller.js`.",
 "- Kept virtual viewport calculation, formatting, Inspector selection and performance recording behind explicit root callbacks.",
 "- Fixed virtual entry navigation so the computed target scroll position is preserved instead of being immediately reset to the top.","",
 "### Maintainability and verification",
 "- Added isolated Table View controller coverage for paged rendering, virtual mode, pagination, listener lifecycle and virtual entry navigation.",
 "- Added capability assertions preventing direct worker, storage, filesystem, Query Engine or network access from the controller.",
 "- Updated permanent source-layout and HTTP smoke gates while preserving the zero-build local-first runtime.","",""
].join("\n");
changelog=replaceOnce(changelog,"# Changelog\n\n","# Changelog\n\n"+notes,"changelog");
write("CHANGELOG.md",changelog);

const finalController=read("src/app/table-view-controller.js");
for(const token of ["SignalDockVirtualViewport","SignalDockQueryEngine","SignalDockPersistence","SignalDockStorageAdapter","showOpenFilePicker","indexedDB","new Worker",".postMessage(","XMLHttpRequest","WebSocket","EventSource",".invoke("]) assert.ok(!finalController.includes(token),`forbidden table capability: ${token}`);
const finalApp=read("app.js");
assert.ok(finalApp.includes("window.SignalDockVirtualViewport?.calculate"));
for(const token of ['el.prevPage.addEventListener("click"','el.logTable.addEventListener("scroll"','window.addEventListener("resize"']) assert.ok(!finalApp.includes(token),`root still owns table listener: ${token}`);
assert.ok(read("index.html").indexOf("src/app/table-view-controller.js")<read("index.html").indexOf("app.js"));
console.log("SignalDock v2.8.21 migration prepared successfully.");
