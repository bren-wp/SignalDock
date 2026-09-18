import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..'); const records=new Map();
function asyncRequest(value){const req={}; setTimeout(()=>{req.result=typeof value==='function'?value():value; req.onsuccess?.();},0); return req;}
function db(){return {objectStoreNames:{contains:()=>true},createObjectStore(){},transaction(){const tx={pending:0,objectStore(){return {get(key){tx.pending++; const r=asyncRequest(()=>records.get(key)); setTimeout(()=>{tx.pending--;tx.done?.();},1); return r;},put(value){records.set(value.key,structuredClone(value));tx.pending++;setTimeout(()=>{tx.pending--;tx.done?.();},0);},delete(key){records.delete(key);tx.pending++;setTimeout(()=>{tx.pending--;tx.done?.();},0);}}},done(){if(!tx.pending)setTimeout(()=>tx.oncomplete?.(),0)}}; setTimeout(()=>tx.done(),0); return tx;},close(){}};}
globalThis.window=globalThis; globalThis.indexedDB={open(){const req={};setTimeout(()=>{req.result=db();req.onupgradeneeded?.();req.onsuccess?.();},0);return req;}};
vm.runInThisContext(fs.readFileSync(path.join(root,'src/core/search-index.js'),'utf8'),{filename:'src/core/search-index.js'});
vm.runInThisContext(fs.readFileSync(path.join(root,'src/core/query-engine.js'),'utf8'),{filename:'src/core/query-engine.js'});
vm.runInThisContext(fs.readFileSync(path.join(root,'src/core/search-cache.js'),'utf8'),{filename:'src/core/search-cache.js'});
function assert(c,m){if(!c)throw new Error(m)}
const entries=Array.from({length:22000},(_,i)=>({source:'api.log',service:'api',level:'INFO',index:i,timestampMs:i,message:i===19001?'needle marker':`request ${i}`,searchText:i===19001?'needle marker api.log api':`request ${i} api.log api`,correlations:{},dimensions:{}}));
const key=await SignalDockSearchCache.fingerprint(entries); assert(key,'fingerprint failed');
const index=SignalDockSearchIndex.build(entries); const saved=await SignalDockSearchCache.save(key,index); assert(saved.saved&&saved.bucketCount>0&&saved.bucketCount<=64,'bucketed save failed');
const storedMeta=structuredClone(records.get('active-meta'));
assert(SignalDockSearchCache.validBucketIds(storedMeta.bucketIds),'saved bucket ids should validate');
assert(!SignalDockSearchCache.validBucketIds([0,0]),'duplicate bucket ids must be rejected');
assert(!SignalDockSearchCache.validBucketIds([-1]),'negative bucket ids must be rejected');
assert(!SignalDockSearchCache.validBucketIds([SignalDockSearchCache.BUCKET_COUNT]),'out-of-range bucket ids must be rejected');
assert(!SignalDockSearchCache.validBucketIds(Array.from({length:SignalDockSearchCache.BUCKET_COUNT+1},(_,i)=>i)),'oversized bucket id lists must be rejected');
records.set('active-meta',{...storedMeta,bucketIds:[0,SignalDockSearchCache.BUCKET_COUNT]});
assert(await SignalDockSearchCache.loadMetadata(key)===null,'corrupted search-cache manifest must be rejected');
records.set('active-meta',storedMeta);
const meta=await SignalDockSearchCache.loadMetadata(key); assert(meta?.index?.tokenMap instanceof Map&&meta.index.tokenMap.size===0&&meta.metadata.format==='bucketed-v3','metadata-only restore failed');
const parsed=SignalDockQueryEngine.parseSmartQuery('needle'); const disk=await SignalDockSearchCache.candidates(key,parsed,{query:'needle'},SignalDockSearchIndex); assert(disk.indexes?.includes(19001),'disk candidate lookup failed');
const loaded=await SignalDockSearchCache.load(key); assert(loaded?.index?.tokenMap instanceof Map&&loaded.index.tokenMap.size===index.tokenMap.size,'full load compatibility failed');
const info=await SignalDockSearchCache.info(); assert(info?.bucketCount===saved.bucketCount&&info.format==='bucketed-v3','cache info failed');
await SignalDockSearchCache.clear(); assert(await SignalDockSearchCache.load(key)===null,'clear failed');
const source=fs.readFileSync(path.join(root,'src/core/search-cache.js'),'utf8');
assert(!source.includes('let previous = null; try { [previous] = await getRecords([META_KEY]); }'),'search-cache save must not read old metadata only for cleanup');
console.log('search cache bucketed-v3 smoke ok');
