import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(n)=>fs.readFileSync(path.join(root,n),"utf8");
const write=(n,c)=>fs.writeFileSync(path.join(root,n),c);
function r1(s,b,a,l){assert.ok(s.includes(b),"missing "+l);assert.equal(s.indexOf(b),s.lastIndexOf(b),"ambiguous "+l);return s.replace(b,a)}
assert.equal(read("VERSION").trim(),"2.8.25");
let app=read("app.js");
app=r1(app,'  const APP_VERSION = "2.8.25";','  const APP_VERSION = "2.8.26";',"version");
app=r1(app,"  let relatedContextController = null;\n","  let relatedContextController = null;\n  let datasetSessionController = null;\n","slot");

const contextAnchor='    relatedContextController = window.SignalDockRelatedContextController.create({';
const contextStart=app.indexOf(contextAnchor);
const investigationStart=app.indexOf("    state.investigation =",contextStart);
assert.ok(contextStart>=0&&investigationStart>contextStart);
const wiring=[
'    if (!window.SignalDockDatasetSessionController?.create) throw new Error("SignalDock Dataset Session controller is unavailable.");',
'    datasetSessionController = window.SignalDockDatasetSessionController.create({',
'      state, el, ownerDocument: document,',
'      todayStamp: () => new Date().toISOString().slice(0, 10),',
'      downloadJson: (name, payload) => utils().downloadJson(name, payload),',
'      downloadParts: (name, parts, mime) => utils().downloadParts(name, parts, mime),',
'      confirmClear: () => window.confirm("Clear all loaded logs from this SignalDock session?"),',
'      stopLiveTail,',
'      createEmptyInvestigation: () => window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] },',
'      createEmptyCase: () => window.SignalDockCaseWorkspace?.empty?.("Investigation") || { title: "Investigation", status: "open", severity: "none", findings: [] },',
'      syncLevelChips, syncWorkerIndex, renderEverything,',
'      clearRecoverySnapshot: () => recoveryDiagnosticsController?.clearRecoverySnapshot({ silent: true }) || Promise.resolve(),',
'      hideRecoveryBanner: () => recoveryDiagnosticsController?.hideRecoveryBanner(),',
'      toast',
'    });',
'    datasetSessionController.bind();',
''
].join("\n");
app=app.slice(0,investigationStart)+wiring+app.slice(investigationStart);
app=app.replace('    el.exportButton.addEventListener("click", exportFiltered);\n    el.clearAllButton.addEventListener("click", clearAll);\n\n',"");

const start=app.indexOf("  function exportFiltered() {");
const end=app.indexOf("  function saveCurrentView()",start);
assert.ok(start>=0&&end>start);
const delegates=[
'  function exportFiltered() { return datasetSessionController?.exportFiltered(); }',
'',
'  async function saveWorkspace() { return workspaceController?.saveWorkspace(); }',
'',
'  async function restoreWorkspace(file) { return workspaceController?.restoreWorkspace(file); }',
'',
'  function clearAll() { return datasetSessionController?.clearAll(); }',
'',
'  function resetFiltersWithoutRender() { return datasetSessionController?.resetFiltersWithoutRender(); }',
'',
''
].join("\n");
app=app.slice(0,start)+delegates+app.slice(end);
write("app.js",app);

let html=read("index.html");
html=r1(html,'  <script src="src/app/related-context-controller.js" defer></script>\n','  <script src="src/app/related-context-controller.js" defer></script>\n  <script src="src/app/dataset-session-controller.js" defer></script>\n',"script");
write("index.html",html);

let layout=read("tests/source-layout-smoke.mjs");
layout=r1(layout,'  "src/app/related-context-controller.js",\n','  "src/app/related-context-controller.js",\n  "src/app/dataset-session-controller.js",\n',"layout");
write("tests/source-layout-smoke.mjs",layout);
write("tests/dataset-session-controller-smoke.mjs","import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\nconst root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),\"..\");\nconst read=(n)=>fs.readFileSync(path.join(root,n),\"utf8\");\nconst html=read(\"index.html\"), app=read(\"app.js\"), source=read(\"src/app/dataset-session-controller.js\");\nassert.ok(html.includes(\"src/app/dataset-session-controller.js\"));\nassert.ok(html.indexOf(\"src/app/dataset-session-controller.js\")<html.indexOf(\"app.js\"));\nassert.ok(app.includes(\"SignalDockDatasetSessionController.create\"));\nassert.ok(app.includes(\"datasetSessionController.bind();\"));\nassert.ok(!app.includes('el.exportButton.addEventListener(\"click\", exportFiltered)'));\nassert.ok(!app.includes('el.clearAllButton.addEventListener(\"click\", clearAll)'));\nfor(const token of [\"SignalDockPersistence\",\"SignalDockInvestigation\",\"SignalDockCaseWorkspace\",\"indexedDB\",\"localStorage\",\"showOpenFilePicker\",\"new Worker\",\".postMessage(\",\"XMLHttpRequest\",\"WebSocket\",\"EventSource\",\".invoke(\"]) assert.ok(!source.includes(token),token);\nassert.ok(!/\\bfetch\\s*\\(/.test(source));\nclass N{constructor(){this.value=\"\";this.listeners=new Map();}addEventListener(t,h){if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(h);}removeEventListener(t,h){this.listeners.get(t)?.delete(h);}}\nconst document={}; const make=()=>new N();\nconst el={exportButton:make(),clearAllButton:make(),queryInput:make(),levelFilter:make(),sourceFilter:make(),timeFilter:make(),sortFilter:make()}; el.sortFilter.value=\"newest\";\nconst state={entries:[{timestamp:\"t\",level:\"INFO\",service:\"api\",source:\"a.log\",message:\"a\",correlations:{},traceMeta:{},dimensions:{},raw:\"a\"},{timestamp:\"t\",level:\"ERROR\",service:\"api\",source:\"b.log\",message:\"b\",correlations:{},traceMeta:{},dimensions:{},raw:\"b\"}],filteredIndexes:[0,1],filterEntries:[{},{}],loadedBytes:10,inputFileCount:1,latestTimestampMs:5,summary:{total:2},page:2,selectedId:\"sd-0\",correlatedIndexes:[1],traceIndexes:[1],correlationEngine:\"worker\",traceEngine:\"worker\",investigation:{items:[1]},caseFile:{title:\"x\"},caseCheckpoints:[1],serviceGraph:{x:1},exceptionGroups:[1],exceptionTrends:{x:1},healthData:{x:1},exceptionViewFingerprint:\"fp\",serviceMatrixData:{rows:[1]},serviceHeatmapData:{rows:[1]},serviceTrendsData:{summary:{changed:1}},traceExplorerData:{rows:[1]},traceOutlierData:{rows:[1]},searchIndex:{enabled:true,candidateCount:2},filterRequestId:4,correlationRequestId:5,traceRequestId:6};\nlet parts=null,json=null,workerSync=0,renders=0,hidden=0,recovery=0,chips=\"\",toasts=[];\nconst host={document};\nvm.runInNewContext(source,{self:host,window:host,console,Map,Promise,JSON,Math},{filename:\"dataset-session-controller.js\"});\nconst c=host.SignalDockDatasetSessionController.create({state,el,ownerDocument:document,todayStamp:()=> \"2026-09-18\",downloadJson:(n,p)=>{json={n,p}},downloadParts:(n,p,m)=>{parts={n,p,m}},confirmClear:()=>true,stopLiveTail:()=>{},createEmptyInvestigation:()=>({title:\"Investigation\",items:[]}),createEmptyCase:()=>({title:\"Investigation\",findings:[]}),syncLevelChips:(v)=>{chips=v},syncWorkerIndex:()=>{workerSync++},renderEverything:()=>{renders++},clearRecoverySnapshot:()=>{recovery++;return Promise.resolve()},hideRecoveryBanner:()=>{hidden++},toast:(m)=>toasts.push(m)});\nc.bind();c.bind();assert.equal(el.exportButton.listeners.get(\"click\").size,1);\nlet r=c.exportFiltered();assert.equal(r.mode,\"json\");assert.equal(json.n,\"signaldock-export-2026-09-18.json\");assert.equal(json.p.length,2);\nstate.filteredIndexes=Array.from({length:50001},(_,i)=>i%2);r=c.exportFiltered();assert.equal(r.mode,\"ndjson\");assert.ok(parts.n.endsWith(\".ndjson\"));assert.ok(parts.p.length>1);\nstate.filteredIndexes=[0,1];\nr=c.clearAll();assert.equal(r.cleared,true);assert.equal(state.entries.length,0);assert.equal(state.serviceMatrixData,null);assert.equal(state.serviceHeatmapData,null);assert.equal(state.serviceTrendsData,null);assert.equal(state.traceExplorerData,null);assert.equal(state.traceOutlierData,null);assert.equal(state.searchIndex.candidateCount,0);assert.equal(state.filterRequestId,5);assert.equal(state.correlationRequestId,6);assert.equal(state.traceRequestId,7);assert.equal(workerSync,1);assert.equal(renders,1);assert.equal(hidden,1);assert.equal(chips,\"\");assert.equal(el.sortFilter.value,\"original\");\nc.destroy();assert.equal(el.exportButton.listeners.get(\"click\").size,0);\nconsole.log(\"dataset-session-controller-smoke PASS\");");

write("VERSION","2.8.26\n");
write("README.md",read("README.md").replaceAll("2.8.25","2.8.26"));
let tech=read("docs/TECHNICAL.md").replace("Current version: **2.8.25**.","Current version: **2.8.26**.");
tech += "\n\nDataset Session controller: filtered export, Clear-all state reset and export/clear button lifecycle are isolated under src/app/dataset-session-controller.js. Downloads, recovery cleanup, worker synchronization and domain factories remain injected callbacks. Clear-all invalidates active requests and clears derived analysis/search-index caches before rerendering.\n";
write("docs/TECHNICAL.md",tech);
let src=read("src/README.md");
src += "\n\napp/dataset-session-controller.js owns filtered export and loaded-dataset clearing while download, recovery, worker synchronization and domain factories remain injected.\n";
write("src/README.md",src);
let sl=read("docs/SOURCE-LAYOUT.md");
sl=sl.replace("filter-worker-controller.js\x60, \x60related-context-controller.js\x60, \x60investigation-controller.js","filter-worker-controller.js\x60, \x60related-context-controller.js\x60, \x60dataset-session-controller.js\x60, \x60investigation-controller.js");
write("docs/SOURCE-LAYOUT.md",sl);
let ch=read("CHANGELOG.md");
ch=ch.replace("# Changelog\n\n","# Changelog\n\n## 2.8.26 — 2026-09-18\n\n### Dataset session lifecycle\n- Extracted filtered export and Clear-all lifecycle into src/app/dataset-session-controller.js.\n- Clear-all now invalidates in-flight filter/correlation/trace requests and clears stale service, trace, exception, health and search-index derived state before rerendering.\n- Kept downloads, recovery cleanup, worker sync and investigation/case factories behind injected callbacks.\n\n");
write("CHANGELOG.md",ch);

const finalApp=read("app.js");
assert.ok(!finalApp.includes('el.exportButton.addEventListener("click", exportFiltered)'));
assert.ok(!finalApp.includes('el.clearAllButton.addEventListener("click", clearAll)'));
assert.ok(finalApp.includes("datasetSessionController?.clearAll"));
assert.ok(finalApp.includes("datasetSessionController?.exportFiltered"));
console.log("v2.8.26 migration prepared");