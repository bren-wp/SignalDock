import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const token='a'.repeat(32); const posted=[]; let listener=null; let tick=0;
const self={
  location:{href:`https://local.invalid/filter-worker.js?sd_session=${token}`},
  addEventListener:(type,fn)=>{ if(type==='message') listener=fn; },
  postMessage:(message)=>posted.push(message),
  SignalDockSearchCache:{fingerprint:async()=>'',loadMetadata:async()=>null,bucketId:()=>'',save:async()=>{},eligible:()=>({allowed:false}),candidates:async()=>({indexes:null,reason:'none'})},
  SignalDockSearchIndex:{build:(entries)=>({stats:{entries:entries.length,tokens:0,postings:0},tokenMap:new Map()}),candidates:()=>({indexes:null,reason:'none'})},
  SignalDockQueryEngine:{parseSmartQuery:()=>({invalid:[]}),filterIndexes:(entries)=>({indexes:entries.map((_,i)=>i),parsed:{invalid:[]}}),relatedIndexes:()=>[0]}
};
const ctx={self,importScripts:()=>{},URL,Set,Map,Object,Array,Number,Math,Promise,performance:{now:()=>++tick}}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(new URL('../filter-worker.js',import.meta.url),'utf8'),ctx);
assert.equal(typeof listener,'function'); assert.equal(posted.length,1); assert.equal(posted[0].type,'ready'); assert.equal(posted[0].token,token); assert.equal(posted[0].protocol,1);
const before=posted.length; await listener({data:{type:'index',protocol:1,token:'wrong',version:1,entries:[{message:'x'}]}}); assert.equal(posted.length,before,'wrong session token must be ignored');
await listener({data:{type:'unknown',protocol:1,token,entries:[]}}); assert.equal(posted.length,before,'unknown message type must be ignored');
await listener({data:{type:'index',protocol:1,token,version:2,entries:[{message:'x'}]}}); assert.equal(posted.at(-1).type,'indexed'); assert.equal(posted.at(-1).token,token);
await listener({data:{type:'filter',protocol:1,token,requestId:7,request:{query:''}}}); assert.equal(posted.at(-1).type,'filtered'); assert.equal(posted.at(-1).requestId,7);
await listener({data:{type:'trace',protocol:1,token,requestId:9,correlations:{trace:'abc'},limit:999999,origin:0}}); assert.equal(posted.at(-1).type,'trace-related'); assert.equal(posted.at(-1).token,token);
console.log('filter-worker-protocol-smoke PASS');
