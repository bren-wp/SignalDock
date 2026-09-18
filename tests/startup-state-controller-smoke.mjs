import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const source = read("src/app/startup-state-controller.js");

assert.ok(html.includes("src/app/startup-state-controller.js"));
assert.ok(html.indexOf("src/app/startup-state-controller.js") < html.indexOf("app.js"));
assert.ok(app.includes("SignalDockStartupStateController.create"));
for (const token of [
  "hydratePreferences()", "hydrateInvestigation()", "hydrateBaselineHistory()",
  "hydrateProjects()", "hydrateCaseCheckpoints()"
]) assert.ok(app.includes("startupStateController." + token), "missing startup hydration call: " + token);

for (const token of [
  "localStorage", "sessionStorage", "indexedDB", "showOpenFilePicker",
  "SignalDockStorageAdapter", "SignalDockPersistence", "new Worker", ".postMessage(",
  "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("
]) assert.ok(!source.includes(token), "forbidden Startup State capability: " + token);
assert.ok(!/\bfetch\s*\(/.test(source));

const loads = [];
const values = new Map([
  ["views-current", null],
  ["views-v2", [{ id:"legacy-view" }]],
  ["views-v1", [{ id:"oldest-view" }]],
  ["settings-v1", { wrap:true, parserProfile:"auto" }],
  ["settings-v2", { compact:true }],
  ["settings-current", { parserProfile:"json", autosave:false }],
  ["active-project", "project-7"]
]);
const state = {
  savedViews: [],
  settings: { wrap:false, compact:false, autosave:true, parserProfile:"auto" },
  investigation:null,
  caseFile:null,
  queryLibrary:[],
  baselineHistory:[],
  projects:[],
  activeProjectId:"",
  caseCheckpoints:[]
};
const host = {};
vm.runInNewContext(source, { self:host, window:host, console, Object, String, Set }, { filename:"startup-state-controller.js" });

let investigationCalls=0;
let caseCalls=0;
let queryCalls=0;
let baselineCalls=0;
let projectCalls=0;
let checkpointCalls=0;

const controller = host.SignalDockStartupStateController.create({
  state,
  loadJson:(key,fallback)=>{
    loads.push(key);
    return values.has(key) ? values.get(key) : fallback;
  },
  savedViewKeys:["views-current","views-v2","views-v1"],
  settingsKeys:["settings-v1","settings-v2","settings-current"],
  activeProjectKey:"active-project",
  createInvestigation:()=>{ investigationCalls += 1; return { title:"Hydrated investigation", items:[] }; },
  createCase:(title)=>{ caseCalls += 1; assert.equal(title,"Investigation"); return { title, status:"open", findings:[] }; },
  loadQueryLibrary:()=>{ queryCalls += 1; return [{ id:"q1" }]; },
  loadBaselineHistory:()=>{ baselineCalls += 1; return [{ id:"b1" }]; },
  loadProjects:()=>{ projectCalls += 1; return [{ id:"project-7" }]; },
  normalizeCheckpoints:(items)=>{ checkpointCalls += 1; assert.equal(Array.isArray(items),true); assert.equal(items.length,0); return [{ id:"cp1" }]; }
});

assert.equal(controller.hydratePreferences(), true);
assert.equal(controller.hydratePreferences(), false);
assert.deepEqual(state.savedViews,[{id:"legacy-view"}]);
assert.equal(state.settings.wrap,true);
assert.equal(state.settings.compact,true);
assert.equal(state.settings.parserProfile,"json");
assert.equal(state.settings.autosave,false);
assert.deepEqual(loads.slice(0,5),["views-current","views-v2","settings-v1","settings-v2","settings-current"]);

assert.equal(controller.hydrateInvestigation(), true);
assert.equal(controller.hydrateInvestigation(), false);
assert.equal(investigationCalls,1);
assert.equal(caseCalls,1);
assert.equal(queryCalls,1);
assert.equal(state.investigation.title,"Hydrated investigation");
assert.equal(state.caseFile.title,"Investigation");
assert.deepEqual(state.queryLibrary,[{id:"q1"}]);

assert.equal(controller.hydrateBaselineHistory(), true);
assert.equal(controller.hydrateBaselineHistory(), false);
assert.equal(baselineCalls,1);
assert.deepEqual(state.baselineHistory,[{id:"b1"}]);

assert.equal(controller.hydrateProjects(), true);
assert.equal(controller.hydrateProjects(), false);
assert.equal(projectCalls,1);
assert.deepEqual(state.projects,[{id:"project-7"}]);
assert.equal(state.activeProjectId,"project-7");

assert.equal(controller.hydrateCaseCheckpoints(), true);
assert.equal(controller.hydrateCaseCheckpoints(), false);
assert.equal(checkpointCalls,1);
assert.deepEqual(state.caseCheckpoints,[{id:"cp1"}]);

assert.ok(Object.isFrozen(controller));
assert.ok(Object.isFrozen(host.SignalDockStartupStateController));
console.log("startup-state-controller-smoke PASS");
