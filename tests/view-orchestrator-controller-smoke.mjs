import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const source = read("src/app/view-orchestrator-controller.js");

assert.ok(html.includes("src/app/view-orchestrator-controller.js"));
assert.ok(html.indexOf("src/app/view-orchestrator-controller.js") < html.indexOf("app.js"));
assert.ok(app.includes("SignalDockViewOrchestratorController.create"));
assert.ok(app.includes("viewOrchestratorController?.renderEverything"));
assert.ok(app.includes("viewOrchestratorController?.renderDataViews"));
assert.ok(app.includes("viewOrchestratorController?.syncLevelChips"));

for (const token of [
  "SignalDockQueryEngine", "SignalDockStorageAdapter", "SignalDockPersistence",
  "SignalDockFilterWorkerController", "indexedDB", "localStorage", "sessionStorage",
  "showOpenFilePicker", "new Worker", ".postMessage(", "XMLHttpRequest", "WebSocket",
  "EventSource", ".invoke("
]) assert.ok(!source.includes(token), "forbidden View Orchestrator capability: " + token);
assert.ok(!/\bfetch\s*\(/.test(source));

const chips = [
  { dataset:{ level:"ERROR" }, classList:{ active:false, toggle(name,on){ if(name==="is-active") this.active=on; } } },
  { dataset:{ level:"WARN" }, classList:{ active:false, toggle(name,on){ if(name==="is-active") this.active=on; } } }
];
const ownerDocument = { querySelectorAll(selector){ assert.equal(selector,"[data-level]"); return chips; } };
const state = { entries:[{id:1}], filterEntries:[] };
const calls = [];
const host = {};
vm.runInNewContext(source,{self:host,window:host,console,Object,Boolean},{filename:"view-orchestrator-controller.js"});

const controller = host.SignalDockViewOrchestratorController.create({
  state,
  ownerDocument,
  rebuildFilterIndex:()=>{ calls.push("rebuild"); state.filterEntries=[{}]; },
  updateStats:()=>calls.push("stats"),
  refreshFilters:()=>calls.push("filters"),
  renderSavedViews:()=>calls.push("saved"),
  setControlsEnabled:(enabled)=>calls.push("controls:"+enabled),
  applyFilters:(reset)=>calls.push("apply:"+reset),
  renderTimeline:()=>calls.push("timeline"),
  renderTable:()=>calls.push("table"),
  renderInspector:()=>calls.push("inspector"),
  updateActiveSourceUI:()=>calls.push("source")
});

controller.renderEverything();
assert.deepEqual(calls.slice(0,6),["rebuild","stats","filters","saved","controls:true","apply:false"]);
calls.length=0;
controller.renderEverything();
assert.deepEqual(calls,["stats","filters","saved","controls:true","apply:false"],"existing filter index must not rebuild");

calls.length=0;
controller.renderDataViews();
assert.deepEqual(calls,["timeline","table","inspector","source"]);

controller.syncLevelChips("WARN");
assert.equal(chips[0].classList.active,false);
assert.equal(chips[1].classList.active,true);
assert.ok(Object.isFrozen(controller));
assert.ok(Object.isFrozen(host.SignalDockViewOrchestratorController));
console.log("view-orchestrator-controller-smoke PASS");
