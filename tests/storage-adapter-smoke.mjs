import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..'); const context={};context.self=context;context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'src/platform/storage-adapter.js'),'utf8'),context,{filename:'src/platform/storage-adapter.js'});
const api=context.SignalDockStorageAdapter; const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
assert(api.sanitizeName('bad:name?.json')==='bad-name-.json','filename sanitizer mismatch');
const ref=api.reference({name:'dump.log',type:'text/plain',size:42,lastModified:123},'evidence');
assert(ref.name==='dump.log'&&ref.size===42&&ref.note==='evidence','local file reference mismatch');
const caps=api.capabilities(); assert(caps.filePicker===false&&caps.savePicker===false,'unexpected picker capability in vm');
const read=await api.readTextFile({name:'x.json',type:'application/json',size:2,lastModified:1,text:async()=>'{\"x\":1}'},1024);assert(read.reference.name==='x.json'&&read.text.includes('x'),'readTextFile mismatch');
let blocked=false;try{await api.readTextFile({name:'huge',size:2048,text:async()=>''},1024)}catch{blocked=true}assert(blocked,'readTextFile size guard missing');
for(const badSize of [undefined,null,'2',-1,NaN,Infinity]){let invalid=false;try{await api.readTextFile({name:'bad',size:badSize,text:async()=>''},1024)}catch{invalid=true}assert(invalid,`invalid file size must be rejected: ${String(badSize)}`);}
let pickerOptions=null;
const handles=[0,1].map(i=>({kind:'file',name:`f${i}.log`,getFile:async()=>({name:`f${i}.log`,type:'text/plain',size:0,lastModified:1,text:async()=>''})}));
context.showOpenFilePicker=async(options)=>{pickerOptions=options;return handles;};
const picked=await api.pickFiles({multiple:true,maxFiles:null,maxBytes:1024});
assert(picked.length===2&&pickerOptions.multiple===true,'null maxFiles must preserve the multi-file default');
context.showOpenFilePicker=async()=>[{kind:'file',name:'bad.log',getFile:async()=>({name:'bad.log',type:'text/plain',size:null,lastModified:1,text:async()=>''})}];
let badPicked=false;try{await api.pickFiles({multiple:false,maxBytes:1024})}catch{badPicked=true}assert(badPicked,'picker must reject invalid file size metadata');
console.log('storage-adapter-smoke: ok');
