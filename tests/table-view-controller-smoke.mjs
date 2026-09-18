import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const controllerSource = read("src/app/table-view-controller.js");

assert.ok(html.includes('src/app/table-view-controller.js'));
assert.ok(html.indexOf('src/app/table-view-controller.js') < html.indexOf('app.js'));
assert.ok(app.includes("SignalDockTableViewController.create"));
assert.ok(app.includes("tableViewController.bind();"));

for (const token of [
  'el.prevPage.addEventListener("click"',
  'el.nextPage.addEventListener("click"',
  'el.pageSize.addEventListener("change"',
  'el.renderMode?.addEventListener("change"',
  'el.logTable.addEventListener("scroll"',
  'el.logTable.addEventListener("click"',
  'window.addEventListener("resize"'
]) assert.ok(!app.includes(token), `root still owns table listener: ${token}`);

for (const token of [
  "SignalDockVirtualViewport", "SignalDockQueryEngine", "SignalDockPersistence",
  "SignalDockStorageAdapter", "showOpenFilePicker", "indexedDB", "new Worker",
  ".postMessage(", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("
]) assert.ok(!controllerSource.includes(token), `forbidden Table View capability reference: ${token}`);

class FakeClassList {
  constructor(){ this.values=new Set(); }
  add(v){ this.values.add(v); }
  remove(v){ this.values.delete(v); }
  contains(v){ return this.values.has(v); }
}
class FakeNode {
  constructor(doc){ this.ownerDocument=doc; this.children=[]; this.dataset={}; this.listeners=new Map(); this.classList=new FakeClassList(); this.value=""; this.disabled=false; this.scrollTop=0; this.clientHeight=420; this.textContent=""; this.title=""; }
  addEventListener(t,h){ if(!this.listeners.has(t)) this.listeners.set(t,new Set()); this.listeners.get(t).add(h); }
  removeEventListener(t,h){ this.listeners.get(t)?.delete(h); }
  replaceChildren(...n){ this.children=n.flatMap((node)=>node?.isFragment ? node.children : [node]); }
  appendChild(n){ if(n?.isFragment) this.children.push(...n.children); else this.children.push(n); return n; }
  append(...n){ this.children.push(...n); }
  setAttribute(k,v){ this[k]=String(v); }
}
const topRule={selectorText:".virtual-spacer--top",style:{}};
const bottomRule={selectorText:".virtual-spacer--bottom",style:{}};
const document={
  body:new FakeNode(null),
  styleSheets:[{cssRules:[topRule,bottomRule]}],
  createElement:()=>new FakeNode(document),
  createElementNS:()=>new FakeNode(document),
  createDocumentFragment:()=>{ const fragment=new FakeNode(document); fragment.isFragment=true; return fragment; }
};
document.body.ownerDocument=document;
const windowObj={innerWidth:1200,listeners:new Map(),addEventListener(t,h){this.listeners.set(t,h);},removeEventListener(t,h){if(this.listeners.get(t)===h)this.listeners.delete(t);},cancelAnimationFrame(){}};
document.defaultView=windowObj;

const rootGlobal={document};
vm.runInNewContext(controllerSource,{self:rootGlobal,window:rootGlobal,console},{filename:"table-view-controller.js"});

const el={
  logTable:new FakeNode(document),resultsSummary:new FakeNode(document),pageLabel:new FakeNode(document),
  prevPage:new FakeNode(document),nextPage:new FakeNode(document),pageSize:new FakeNode(document),renderMode:new FakeNode(document)
};
el.pageSize.value="2"; el.renderMode.value="virtual";

const state={
  entries:[
    {id:"sd-0",timestamp:"2026-09-18T10:00:00Z",level:"INFO",source:"a.log",service:"—",message:"a"},
    {id:"sd-1",timestamp:"2026-09-18T10:01:00Z",level:"ERROR",source:"b.log",service:"api",message:"b"},
    {id:"sd-2",timestamp:"2026-09-18T10:02:00Z",level:"WARN",source:"c.log",service:"—",message:"c"}
  ],
  filteredIndexes:[0,1,2],
  page:1,pageSize:2,renderMode:"paged",renderGeneration:0,selectedId:null,
  settings:{wrap:false,compact:false},
  virtual:{start:0,end:0,overscan:10,rowHeight:46,pitch:50,compressed:false,lastScrollTop:0,lastScrollAt:0,raf:0},
  lastEngine:"main"
};
let perf=0, selected="", autosave=0, clock=0;
const calculate=({total,scrollTop})=>({start:Math.min(total-1,Math.max(0,Math.floor(scrollTop/50))),end:Math.min(total,Math.max(1,Math.floor(scrollTop/50)+2)),pitch:50,compressed:false,topSpacerPx:Math.max(0,Math.floor(scrollTop/50))*50,bottomSpacerPx:0,maxScrollPx:8000000,logicalHeight:total*50});
const controller=rootGlobal.SignalDockTableViewController.create({
  state,el,ownerDocument:document,ownerWindow:windowObj,
  debounce:(fn)=>fn,scheduleFrame:(fn)=>{fn();return 1;},now:()=>++clock,
  calculateVirtualViewport:calculate,formatTime:()=> "10:00",shortSource:(s)=>s,
  recordPerformance:()=>{perf+=1;},scheduleViewAutosave:()=>{autosave+=1;},selectEntry:(id)=>{selected=id;}
});
controller.bind(); controller.bind();
assert.equal(el.prevPage.listeners.get("click").size,1);
controller.renderTable();
assert.equal(el.logTable.children.length,2);
assert.ok(el.resultsSummary.textContent.includes("Showing 1–2 of 3"));
state.renderMode="virtual";
controller.renderTable();
assert.ok(document.body.classList.contains("virtual-log-view"));
assert.equal(el.pageLabel.textContent,"Windowed");

el.logTable.scrollTop=0;
controller.entryRowIntoView(2);
assert.equal(el.logTable.scrollTop,100,"virtual navigation must preserve computed target scroll");
assert.equal(state.virtual.start,2);

controller.setPage(1);
state.renderMode="paged";
controller.setPage(2);
assert.equal(state.page,2);
assert.equal(autosave,1);

controller.destroy();
assert.equal(el.prevPage.listeners.get("click").size,0);
console.log("table-view-controller-smoke PASS");
