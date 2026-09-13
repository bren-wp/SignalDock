import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..'); const posted=[]; const records=new Map();
function asyncRequest(producer){const request={};setTimeout(()=>{try{request.result=producer();request.onsuccess?.();}catch(error){request.error=error;request.onerror?.();}},0);return request;}
function makeDb(){return {objectStoreNames:{contains:()=>true},createObjectStore(){},transaction(){const tx={pending:0,done:false,objectStore(){return {get(key){tx.pending++;const req=asyncRequest(()=>records.get(key));setTimeout(()=>{tx.pending--;tx.complete();},1);return req;},put(value){records.set(value.key,structuredClone(value));tx.pending++;setTimeout(()=>{tx.pending--;tx.complete();},0);},delete(key){records.delete(key);tx.pending++;setTimeout(()=>{tx.pending--;tx.complete();},0);}}},complete(){if(!tx.done&&tx.pending===0){tx.done=true;setTimeout(()=>tx.oncomplete?.(),0)}}};setTimeout(()=>tx.complete(),0);return tx;},close(){}};}
globalThis.indexedDB={open(){const req={};setTimeout(()=>{req.result=makeDb();req.onupgradeneeded?.();req.onsuccess?.();},0);return req;}};
globalThis.self={postMessage(message){posted.push(message);}}; globalThis.importScripts=(...names)=>{for(const name of names)vm.runInThisContext(fs.readFileSync(path.join(root,name),'utf8'),{filename:name});}; globalThis.performance??={now:()=>Date.now()};
vm.runInThisContext(fs.readFileSync(path.join(root,'filter-worker.js'),'utf8'),{filename:'filter-worker.js'}); posted.shift();
const entries=Array.from({length:25000},(_,i)=>({level:'INFO',source:'bulk.log',service:'api',message:i===19001?'needle marker':`routine ${i}`,searchText:i===19001?'needle marker bulk.log api':`routine ${i} bulk.log api`,correlations:{},dimensions:{},timestampMs:i,index:i}));
await self.onmessage({data:{type:'index',version:1,entries}}); const first=posted.shift(); if(!first?.type==='indexed')throw new Error('first index failed');
await new Promise(r=>setTimeout(r,20));
await self.onmessage({data:{type:'index',version:2,entries}}); const second=posted.shift();
if(!second?.searchIndex?.cacheHit)throw new Error(`expected search cache hit, got ${JSON.stringify(second?.searchIndex)}`);
await self.onmessage({data:{type:'filter',requestId:9,request:{query:'needle',showUnknown:true}}}); const filtered=posted.shift();
if(filtered?.indexes?.[0]!==19001)throw new Error('cached index filtering failed');
if(filtered?.searchMode!=='disk-indexed')throw new Error(`expected disk-indexed path, got ${filtered?.searchMode}`);
console.log('PASS worker persistent search cache hit');
