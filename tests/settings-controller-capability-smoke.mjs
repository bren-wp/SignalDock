import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(name)=>fs.readFileSync(path.join(root,name),"utf8");
const app=read("app.js");
const source=read("src/app/settings-controller.js");

assert.ok(!source.includes("file.text()"),"Settings controller must not read files directly");
assert.ok(source.includes("maxParserProfilesImportBytes"));
assert.ok(source.includes("currentCustomParserProfile"));
assert.ok(app.includes("SignalDockStorageAdapter.readTextFile"),"root must inject Storage Adapter parser-profile reads");
for(const token of ["showOpenFilePicker","new Worker",".postMessage(","XMLHttpRequest","WebSocket","EventSource",".invoke("]) assert.ok(!source.includes(token),token);
assert.ok(!/\bfetch\s*\(/.test(source));

class Select {
  constructor(){this.value="";this.children=[];}
  replaceChildren(...children){this.children=children;}
}
const doc={
  body:{classList:{toggle(){}}},
  createElement(tag){return {tagName:tag.toUpperCase(),value:"",textContent:""};}
};
const state={
  entries:[],
  renderMode:"paged",
  settings:{
    wrap:false,compact:false,showUnknown:true,useWorker:true,autosave:true,
    parserProfile:"custom",
    customParserPattern:"  ^(?<message>.+)$  ",
    customParserFlags:"imx!"
  }
};
const savedSelect=new Select();
const el={
  settingsDialog:{ownerDocument:doc},
  savedParserProfile:savedSelect,
  deleteParserProfileButton:{disabled:false},
  savedParserName:{value:""},
  parserProfile:{value:"custom"},
  customParserPattern:{value:""},
  customParserFlags:{value:""},
  wrapToggle:{checked:false},compactToggle:{checked:false},unknownToggle:{checked:true},workerToggle:{checked:true},autosaveToggle:{checked:true}
};
let readerCalls=0;
let importedText="";
const notices=[];
const profiles={
  load:()=>[],
  importJson:(text)=>{importedText=text;return [{id:"p1",name:"Imported",pattern:".+",flags:"i"}];}
};
const host={document:doc};
vm.runInNewContext(source,{self:host,window:host,console,Object,String,Number,Math,Boolean,Promise,Date},{filename:"settings-controller.js"});
const controller=host.SignalDockSettingsController.create({
  state,el,
  getUtils:()=>({saveJson(){}}),
  getParserProfiles:()=>profiles,
  toast:(message)=>notices.push(message),
  applyFilters:()=>{},
  markDatasetForAutosave:()=>{},
  updateAutosaveStatus:()=>{},
  updateDiagnostics:()=>{},
  closeCompetingDialogs:()=>{},
  showDialogSafely:()=>true,
  scheduleViewAutosave:()=>{},
  maxParserProfilesImportBytes:4*1024*1024,
  readParserProfilesText:async(file,maxBytes)=>{readerCalls++;assert.equal(maxBytes,4*1024*1024);return file.payload;}
});

const currentProfile=controller.currentCustomParserProfile(); assert.equal(currentProfile.pattern,"^(?<message>.+)$"); assert.equal(currentProfile.flags,"im");

const tooLargeTarget={files:[{name:"huge.json",size:4*1024*1024+1,payload:"bad"}],value:"x"};
assert.equal(await controller.importParserProfiles({target:tooLargeTarget}),false);
assert.equal(readerCalls,0,"oversized profile import must fail before read");
assert.equal(tooLargeTarget.value,"");

const input={files:[{name:"profiles.json",size:1024,payload:'{"profiles":[]}'}],value:"x"};
assert.equal(await controller.importParserProfiles({target:input}),true);
assert.equal(readerCalls,1);
assert.equal(importedText,'{"profiles":[]}');
assert.equal(input.value,"");
assert.ok(notices.some((message)=>message.includes("Imported 1 parser profile")));
console.log("settings-controller-capability-smoke PASS");
