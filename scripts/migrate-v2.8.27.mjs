import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(n)=>fs.readFileSync(path.join(root,n),"utf8");
const write=(n,c)=>fs.writeFileSync(path.join(root,n),c);
function r1(s,b,a,l){assert.ok(s.includes(b),"missing "+l);assert.equal(s.indexOf(b),s.lastIndexOf(b),"ambiguous "+l);return s.replace(b,a)}

assert.equal(read("VERSION").trim(),"2.8.26");
let app=read("app.js");
app=r1(app,'  const APP_VERSION = "2.8.26";','  const APP_VERSION = "2.8.27";',"version");
app=r1(app,"  let caseWorkspaceController = null;\n  let caseCheckpointController = null;\n","  let caseWorkspaceController = null;\n  let caseFileController = null;\n  let caseCheckpointController = null;\n","case file slot");

const workspaceBind="    caseWorkspaceController.bind();";
const createLines=[
 workspaceBind,
 '    if (!window.SignalDockCaseFileController?.create) throw new Error("SignalDock Case File controller is unavailable.");',
 '    caseFileController = window.SignalDockCaseFileController.create({',
 '      state, el, ownerDocument: document,',
 '      pruneEvidenceLinks: (caseFile, evidence) => window.SignalDockCaseWorkspace.pruneEvidenceLinks(caseFile, evidence),',
 '      summarizeCase: (caseFile, evidence) => window.SignalDockCaseWorkspace.summarize(caseFile, evidence),',
 '      exportCaseJsonText: (caseFile) => window.SignalDockCaseWorkspace.exportJson(caseFile),',
 '      exportCaseMarkdownText: (caseFile, investigation) => window.SignalDockCaseWorkspace.exportMarkdown(caseFile, investigation),',
 '      importCaseJsonText: (text) => window.SignalDockCaseWorkspace.importJson(text),',
 '      normalizeInvestigation: (value) => window.SignalDockInvestigation?.normalize?.(value) || value,',
 '      analyzeServiceHealth: (entries) => window.SignalDockServiceHealth?.analyze?.(entries) || null,',
 '      saveTextExport: async (request) => {',
 '        if (window.SignalDockStorageAdapter?.saveText) return window.SignalDockStorageAdapter.saveText(request);',
 '        utils().downloadParts(request.name, [request.text], request.mime);',
 '        return { mode: "download", name: request.name };',
 '      },',
 '      readCaseText: async (file, maxBytes) => {',
 '        if (!window.SignalDockStorageAdapter?.readTextFile) throw new Error("Local case-file reader is unavailable.");',
 '        const result = await window.SignalDockStorageAdapter.readTextFile(file, maxBytes);',
 '        return result.text;',
 '      },',
 '      renderCaseSurfaces: () => investigationController?.renderCaseSurfaces(),',
 '      renderWorkspace: (rebuild = true) => caseWorkspaceController?.render({ rebuildFindings: rebuild }),',
 '      renderCheckpoints: () => caseCheckpointController?.render(),',
 '      recordCaseActivity: (...args) => investigationController?.recordActivity(...args),',
 '      scheduleViewAutosave: () => scheduleViewAutosave(),',
 '      scheduleDatasetAutosave: () => scheduleDatasetAutosave(),',
 '      formatDuration,',
 '      todayStamp: () => new Date().toISOString().slice(0, 10),',
 '      toast',
 '    });'
].join("\n");
app=r1(app,workspaceBind,createLines,"case file wiring");

const checkpointBind="    caseCheckpointController.bind();";
app=r1(app,checkpointBind,checkpointBind+"\n    caseFileController.bind();","case file bind");

for(const line of [
'    el.exportCaseMarkdownButton?.addEventListener("click", exportCaseMarkdown);\n',
'    el.exportCaseJsonButton?.addEventListener("click", exportCaseJson);\n',
'    el.importCaseJsonButton?.addEventListener("click", () => el.caseFileInput?.click());\n',
'    el.caseFileInput?.addEventListener("change", importCaseJson);\n'
]) app=app.replace(line,"");

const start=app.indexOf("  function renderCaseWorkspace(rebuild = true) {");
const end=app.indexOf("  function entryRowIntoView(globalIndex) {",start);
assert.ok(start>=0&&end>start,"case file block missing");
const delegates=[
'  function renderCaseWorkspace(rebuild = true) { return caseFileController?.renderCaseWorkspace(rebuild); }',
'',
'  async function exportCaseJson() { return caseFileController?.exportCaseJson(); }',
'',
'  async function exportCaseMarkdown() { return caseFileController?.exportCaseMarkdown(); }',
'',
'  async function importCaseJson(event) {',
'    const file = event?.target?.files?.[0];',
'    try { if (file) return await caseFileController?.importCaseFile(file); }',
'    finally { if (event?.target) event.target.value = ""; }',
'  }',
'',
''
].join("\n");
app=app.slice(0,start)+delegates+app.slice(end);
write("app.js",app);

let html=read("index.html");
html=r1(html,'  <script src="src/app/case-workspace-controller.js" defer></script>\n','  <script src="src/app/case-workspace-controller.js" defer></script>\n  <script src="src/app/case-file-controller.js" defer></script>\n',"case file script");
write("index.html",html);

let layout=read("tests/source-layout-smoke.mjs");
layout=r1(layout,'  "src/app/case-workspace-controller.js",\n','  "src/app/case-workspace-controller.js",\n  "src/app/case-file-controller.js",\n',"source layout");
write("tests/source-layout-smoke.mjs",layout);
write("tests/case-file-controller-smoke.mjs","import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),\"..\");\nconst read=(name)=>fs.readFileSync(path.join(root,name),\"utf8\");\nconst html=read(\"index.html\"), app=read(\"app.js\"), source=read(\"src/app/case-file-controller.js\");\n\nassert.ok(html.includes(\"src/app/case-file-controller.js\"));\nassert.ok(html.indexOf(\"src/app/case-file-controller.js\") < html.indexOf(\"app.js\"));\nassert.ok(app.includes(\"SignalDockCaseFileController.create\"));\nassert.ok(app.includes(\"caseFileController.bind();\"));\nfor(const token of ['el.exportCaseMarkdownButton?.addEventListener','el.exportCaseJsonButton?.addEventListener','el.caseFileInput?.addEventListener(\"change\"']) assert.ok(!app.includes(token), token);\nfor(const token of [\"SignalDockStorageAdapter\",\"SignalDockCaseWorkspace\",\"SignalDockInvestigation\",\"SignalDockServiceHealth\",\"file.text()\",\"indexedDB\",\"localStorage\",\"showOpenFilePicker\",\"new Worker\",\".postMessage(\",\"XMLHttpRequest\",\"WebSocket\",\"EventSource\",\".invoke(\"]) assert.ok(!source.includes(token), token);\nassert.ok(source.includes(\"const MAX_IMPORT_BYTES = 32 * 1024 * 1024\"));\nassert.ok(!/\\bfetch\\s*\\(/.test(source));\n\nclass Node { constructor(){this.value=\"\";this.files=[];this.listeners=new Map();this.textContent=\"\";this.clicked=0;} addEventListener(t,h){if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(h);} removeEventListener(t,h){this.listeners.get(t)?.delete(h);} click(){this.clicked++;} }\nconst document={}; const make=()=>new Node();\nconst el={exportCaseMarkdownButton:make(),exportCaseJsonButton:make(),importCaseJsonButton:make(),caseFileInput:make(),caseWorkspaceStats:make(),investigationTitle:make(),investigationSummary:make(),caseStatus:make(),caseSeverity:make(),caseHypothesis:make(),caseImpact:make(),caseNextSteps:make()};\nconst state={caseFile:{title:\"Incident\",summary:\"S\",status:\"open\",severity:\"sev2\",hypothesis:\"H\",impact:\"I\",nextSteps:\"N\",findings:[{id:\"f1\"}]},investigation:{title:\"Old\",summary:\"Old\",items:[{id:\"ev1\"}]},entries:[{}],summary:{services:[\"api\"],errors:1,warnings:2},exceptionGroups:[{}],exceptionTrends:{groups:new Map([[\"fp\",{fingerprint:\"fp\",trend:\"spiking\",recent:3,previous:1}]])},healthData:null,settings:{autosave:true}};\nlet saved=[],readCount=0,caseRenders=0,surfaces=0,checkpoints=0,activity=0,viewAutosave=0,datasetAutosave=0,toasts=[];\nconst host={document};\nvm.runInNewContext(source,{self:host,window:host,console,Map,Promise,Object,Array,Math,Number,JSON},{filename:\"case-file-controller.js\"});\nconst controller=host.SignalDockCaseFileController.create({\n state,el,ownerDocument:document,\n pruneEvidenceLinks:(c)=>({...c,pruned:true}),\n summarizeCase:()=>({findings:1,confirmed:1,linkedEvidence:1}),\n exportCaseJsonText:(c)=>JSON.stringify(c),\n exportCaseMarkdownText:()=>\"# Incident\",\n importCaseJsonText:(text)=>({title:\"Imported\",summary:\"Imported summary\",status:\"investigating\",severity:\"sev1\",hypothesis:\"IH\",impact:\"II\",nextSteps:\"IN\",findings:[{id:\"f2\"}],raw:text}),\n normalizeInvestigation:(v)=>v,\n analyzeServiceHealth:()=>({rows:[{service:\"api\",status:\"critical\",errorRate:.5,exceptionGroups:2,p95DurationMs:12}]}),\n saveTextExport:async (request)=>{saved.push(request);return {mode:\"download\",name:request.name};},\n readCaseText:async ()=>{readCount++;return '{\"schema\":\"signaldock.case\"}';},\n renderCaseSurfaces:()=>{surfaces++;},\n renderWorkspace:()=>{caseRenders++;},\n renderCheckpoints:()=>{checkpoints++;},\n recordCaseActivity:()=>{activity++;},\n scheduleViewAutosave:()=>{viewAutosave++;},\n scheduleDatasetAutosave:()=>{datasetAutosave++;},\n formatDuration:(v)=>v+\" ms\",\n todayStamp:()=> \"2026-09-18\",\n toast:(m)=>toasts.push(m)\n});\ncontroller.bind();controller.bind();\nassert.equal(el.exportCaseJsonButton.listeners.get(\"click\").size,1);\n\nlet out=await controller.exportCaseJson();\nassert.equal(out.mode,\"download\"); assert.equal(saved.at(-1).name,\"signaldock-case-2026-09-18.sdcase\");\nout=await controller.exportCaseMarkdown();\nassert.equal(out.mode,\"download\"); assert.ok(saved.at(-1).text.includes(\"Observed dataset context\")); assert.ok(saved.at(-1).text.includes(\"Spiking exception fingerprints\"));\n\nconst oversized=await controller.importCaseFile({name:\"huge.sdcase\",size:33*1024*1024});\nassert.equal(oversized,false); assert.equal(readCount,0);\n\nconst ok=await controller.importCaseFile({name:\"incident.sdcase\",size:1024});\nassert.equal(ok,true); assert.equal(readCount,1); assert.equal(state.caseFile.title,\"Imported\"); assert.equal(state.caseFile.pruned,true);\nassert.equal(state.investigation.title,\"Imported\"); assert.equal(el.caseStatus.value,\"investigating\"); assert.equal(activity,1); assert.equal(caseRenders,1); assert.equal(surfaces,1); assert.equal(checkpoints,1); assert.equal(viewAutosave,1); assert.equal(datasetAutosave,1);\n\nconst cancel=host.SignalDockCaseFileController.create({\n state,el,ownerDocument:document,\n pruneEvidenceLinks:(c)=>c,summarizeCase:()=>({findings:0,confirmed:0,linkedEvidence:0}),\n exportCaseJsonText:()=> \"{}\",exportCaseMarkdownText:()=>\"# x\",importCaseJsonText:()=>state.caseFile,normalizeInvestigation:(x)=>x,analyzeServiceHealth:()=>null,\n saveTextExport:async()=>({mode:\"cancelled\"}),readCaseText:async()=>\"\",renderCaseSurfaces:()=>{},renderWorkspace:()=>{},renderCheckpoints:()=>{},recordCaseActivity:()=>{},scheduleViewAutosave:()=>{},scheduleDatasetAutosave:()=>{},formatDuration:()=>\"\",todayStamp:()=> \"2026-09-18\",toast:(m)=>toasts.push(m)\n});\nassert.equal((await cancel.exportCaseJson()).mode,\"cancelled\");\nassert.ok(toasts.includes(\"Case workspace export cancelled.\"));\n\ncontroller.destroy();\nassert.equal(el.exportCaseJsonButton.listeners.get(\"click\").size,0);\nconsole.log(\"case-file-controller-smoke PASS\");");

let investigationTest=read("tests/investigation-controller-smoke.mjs");
investigationTest=r1(
  investigationTest,
  'const controller = read("src/app/investigation-controller.js");\n',
  'const controller = read("src/app/investigation-controller.js");\nconst caseFileController = read("src/app/case-file-controller.js");\n',
  "investigation test case-file source"
);
investigationTest=r1(
  investigationTest,
  '  "investigationController?.recordActivity(\\"case.imported\\""\n]) assert.ok(app.includes(token), \`Investigation app integration token missing: \${token}\`);',
  '  "investigationController?.recordActivity"\n]) assert.ok(app.includes(token), \`Investigation app integration token missing: \${token}\`);\nassert.ok(caseFileController.includes(\'recordCaseActivity("case.imported", "Case file imported"\'), "Case import activity ownership must live in Case File controller.");',
  "investigation case-import ownership"
);
write("tests/investigation-controller-smoke.mjs",investigationTest);


write("VERSION","2.8.27\n");
write("README.md",read("README.md").replaceAll("2.8.26","2.8.27"));

let tech=read("docs/TECHNICAL.md").replace("Current version: **2.8.26**.","Current version: **2.8.27**.");
tech += "\n\nCase File controller: JSON/Markdown export, case import, report assembly and Case Workspace summary refresh are isolated under src/app/case-file-controller.js. Storage Adapter reads/writes, Case Workspace domain operations, Investigation normalization and Service Health analysis remain root-injected callbacks. Case import is rejected above 32 MB before content is read.\n";
write("docs/TECHNICAL.md",tech);

let src=read("src/README.md");
src += "\n\napp/case-file-controller.js owns case JSON/Markdown export, bounded case import and case-summary refresh while storage, domain parsing/normalization and analytics remain injected.\n";
write("src/README.md",src);

let sl=read("docs/SOURCE-LAYOUT.md");
sl += "\n\nCase file application boundary: src/app/case-file-controller.js owns bounded Case import/export and report orchestration. Storage and domain capabilities remain injected.\n";
write("docs/SOURCE-LAYOUT.md",sl);

let ch=read("CHANGELOG.md");
ch=ch.replace("# Changelog\n\n","# Changelog\n\n## 2.8.27 — 2026-09-18\n\n### Case file boundary\n- Extracted Case JSON/Markdown export, import orchestration, observed-dataset report assembly and Case Workspace summary refresh into src/app/case-file-controller.js.\n- Added a 32 MB case-import safety limit before local file contents are read.\n- Export cancellation is now surfaced as cancelled instead of incorrectly reporting success.\n- Kept Storage Adapter I/O, Case Workspace domain parsing/normalization, Investigation normalization and Service Health analysis behind injected callbacks.\n\n");
write("CHANGELOG.md",ch);

const controller=read("src/app/case-file-controller.js");
for(const token of ["SignalDockStorageAdapter","SignalDockCaseWorkspace","SignalDockInvestigation","SignalDockServiceHealth","file.text()","indexedDB","localStorage","showOpenFilePicker","new Worker",".postMessage(","XMLHttpRequest","WebSocket","EventSource",".invoke("]) assert.ok(!controller.includes(token),"forbidden case file capability "+token);
assert.ok(controller.includes("const MAX_IMPORT_BYTES = 32 * 1024 * 1024"));
const finalApp=read("app.js");
assert.ok(finalApp.includes("SignalDockStorageAdapter.readTextFile"));
assert.ok(finalApp.includes("SignalDockStorageAdapter.saveText"));
assert.ok(!finalApp.includes('el.exportCaseMarkdownButton?.addEventListener'));
assert.ok(finalApp.includes("caseFileController?.renderCaseWorkspace"));
console.log("SignalDock v2.8.27 migration prepared successfully.");