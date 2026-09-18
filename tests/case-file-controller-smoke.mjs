import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(name)=>fs.readFileSync(path.join(root,name),"utf8");
const html=read("index.html"), app=read("app.js"), source=read("src/app/case-file-controller.js");

assert.ok(html.includes("src/app/case-file-controller.js"));
assert.ok(html.indexOf("src/app/case-file-controller.js") < html.indexOf("app.js"));
assert.ok(app.includes("SignalDockCaseFileController.create"));
assert.ok(app.includes("caseFileController.bind();"));
for(const token of ['el.exportCaseMarkdownButton?.addEventListener','el.exportCaseJsonButton?.addEventListener','el.caseFileInput?.addEventListener("change"']) assert.ok(!app.includes(token), token);
for(const token of ["SignalDockStorageAdapter","SignalDockCaseWorkspace","SignalDockInvestigation","SignalDockServiceHealth","file.text()","indexedDB","localStorage","showOpenFilePicker","new Worker",".postMessage(","XMLHttpRequest","WebSocket","EventSource",".invoke("]) assert.ok(!source.includes(token), token);
assert.ok(source.includes("const MAX_IMPORT_BYTES = 32 * 1024 * 1024"));
assert.ok(!/\bfetch\s*\(/.test(source));

class Node { constructor(){this.value="";this.files=[];this.listeners=new Map();this.textContent="";this.clicked=0;} addEventListener(t,h){if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(h);} removeEventListener(t,h){this.listeners.get(t)?.delete(h);} click(){this.clicked++;} }
const document={}; const make=()=>new Node();
const el={exportCaseMarkdownButton:make(),exportCaseJsonButton:make(),importCaseJsonButton:make(),caseFileInput:make(),caseWorkspaceStats:make(),investigationTitle:make(),investigationSummary:make(),caseStatus:make(),caseSeverity:make(),caseHypothesis:make(),caseImpact:make(),caseNextSteps:make()};
const state={caseFile:{title:"Incident",summary:"S",status:"open",severity:"sev2",hypothesis:"H",impact:"I",nextSteps:"N",findings:[{id:"f1"}]},investigation:{title:"Old",summary:"Old",items:[{id:"ev1"}]},entries:[{}],summary:{services:["api"],errors:1,warnings:2},exceptionGroups:[{}],exceptionTrends:{groups:new Map([["fp",{fingerprint:"fp",trend:"spiking",recent:3,previous:1}]])},healthData:null,settings:{autosave:true}};
let saved=[],readCount=0,caseRenders=0,surfaces=0,checkpoints=0,activity=0,viewAutosave=0,datasetAutosave=0,toasts=[];
const host={document};
vm.runInNewContext(source,{self:host,window:host,console,Map,Promise,Object,Array,Math,Number,JSON},{filename:"case-file-controller.js"});
const controller=host.SignalDockCaseFileController.create({
 state,el,ownerDocument:document,
 pruneEvidenceLinks:(c)=>({...c,pruned:true}),
 summarizeCase:()=>({findings:1,confirmed:1,linkedEvidence:1}),
 exportCaseJsonText:(c)=>JSON.stringify(c),
 exportCaseMarkdownText:()=>"# Incident",
 importCaseJsonText:(text)=>({title:"Imported",summary:"Imported summary",status:"investigating",severity:"sev1",hypothesis:"IH",impact:"II",nextSteps:"IN",findings:[{id:"f2"}],raw:text}),
 normalizeInvestigation:(v)=>v,
 analyzeServiceHealth:()=>({rows:[{service:"api",status:"critical",errorRate:.5,exceptionGroups:2,p95DurationMs:12}]}),
 saveTextExport:async (request)=>{saved.push(request);return {mode:"download",name:request.name};},
 readCaseText:async ()=>{readCount++;return '{"schema":"signaldock.case"}';},
 renderCaseSurfaces:()=>{surfaces++;},
 renderWorkspace:()=>{caseRenders++;},
 renderCheckpoints:()=>{checkpoints++;},
 recordCaseActivity:()=>{activity++;},
 scheduleViewAutosave:()=>{viewAutosave++;},
 scheduleDatasetAutosave:()=>{datasetAutosave++;},
 formatDuration:(v)=>v+" ms",
 todayStamp:()=> "2026-09-18",
 toast:(m)=>toasts.push(m)
});
controller.bind();controller.bind();
assert.equal(el.exportCaseJsonButton.listeners.get("click").size,1);

let out=await controller.exportCaseJson();
assert.equal(out.mode,"download"); assert.equal(saved.at(-1).name,"signaldock-case-2026-09-18.sdcase");
out=await controller.exportCaseMarkdown();
assert.equal(out.mode,"download"); assert.ok(saved.at(-1).text.includes("Observed dataset context")); assert.ok(saved.at(-1).text.includes("Spiking exception fingerprints"));

const oversized=await controller.importCaseFile({name:"huge.sdcase",size:33*1024*1024});
assert.equal(oversized,false); assert.equal(readCount,0);

const ok=await controller.importCaseFile({name:"incident.sdcase",size:1024});
assert.equal(ok,true); assert.equal(readCount,1); assert.equal(state.caseFile.title,"Imported"); assert.equal(state.caseFile.pruned,true);
assert.equal(state.investigation.title,"Imported"); assert.equal(el.caseStatus.value,"investigating"); assert.equal(activity,1); assert.equal(caseRenders,1); assert.equal(surfaces,1); assert.equal(checkpoints,1); assert.equal(viewAutosave,1); assert.equal(datasetAutosave,1);

const cancel=host.SignalDockCaseFileController.create({
 state,el,ownerDocument:document,
 pruneEvidenceLinks:(c)=>c,summarizeCase:()=>({findings:0,confirmed:0,linkedEvidence:0}),
 exportCaseJsonText:()=> "{}",exportCaseMarkdownText:()=>"# x",importCaseJsonText:()=>state.caseFile,normalizeInvestigation:(x)=>x,analyzeServiceHealth:()=>null,
 saveTextExport:async()=>({mode:"cancelled"}),readCaseText:async()=>"",renderCaseSurfaces:()=>{},renderWorkspace:()=>{},renderCheckpoints:()=>{},recordCaseActivity:()=>{},scheduleViewAutosave:()=>{},scheduleDatasetAutosave:()=>{},formatDuration:()=>"",todayStamp:()=> "2026-09-18",toast:(m)=>toasts.push(m)
});
assert.equal((await cancel.exportCaseJson()).mode,"cancelled");
assert.ok(toasts.includes("Case workspace export cancelled."));

controller.destroy();
assert.equal(el.exportCaseJsonButton.listeners.get("click").size,0);
console.log("case-file-controller-smoke PASS");