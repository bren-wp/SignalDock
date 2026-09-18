import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const store=new Map();const ctx={self:{localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}}};vm.createContext(ctx);for(const f of ['src/analysis/service-matrix.js','src/analysis/trace-explorer.js','src/investigation/baseline-manager.js','src/analysis/trace-regression.js'])vm.runInContext(fs.readFileSync(new URL(`../${f}`,import.meta.url),'utf8'),ctx);
const e=(service,level,t,trace,span,parent,dur)=>({service,level,timestampMs:t,source:'x',correlations:{trace,span,parent_span:parent||''},traceMeta:{parentSpan:parent||'',durationMs:dur}});
const base=[e('api','INFO',0,'t1','a','',100),e('db','INFO',10,'t1','b','a',70)];const cur=[e('api','INFO',0,'t2','a','',180),e('db','ERROR',10,'t2','b','a',160)];
const api=ctx.self.SignalDockBaselineManager;const B=api.snapshot(base,null,{name:'base',id:'base'}),C=api.snapshot(cur,null,{name:'cur',id:'cur'});const cmp=api.compare(C,B);assert.equal(cmp.dependencies.length,1);assert.equal(cmp.dependencies[0].from,'api');assert.equal(cmp.dependencies[0].to,'db');assert.ok(cmp.dependencies[0].errorRateDelta>0);const reg=ctx.self.SignalDockTraceRegression.compare(C,B);assert.equal(reg.summary.regressed,1);assert.equal(api.parse(api.exportJson(B)).name,'base');

const mixed=[...base,e('worker','WARN',20,'t3','c','',30),null,e('cache','INFO',30,'t4','d','',15)];
const filteredIndexes=[0,1,4,99];
const filtered=api.snapshot(mixed,filteredIndexes,{name:'filtered',id:'filtered',scope:'filtered'});
const materialized=api.snapshot([mixed[0],mixed[1],mixed[4]],null,{name:'materialized',id:'materialized',scope:'filtered'});
assert.equal(filtered.entries,3);
assert.deepEqual(filtered.sources,materialized.sources);
assert.deepEqual(filtered.timeRange,materialized.timeRange);
assert.deepEqual(filtered.services,materialized.services);
assert.deepEqual(filtered.dependencies,materialized.dependencies);
assert.deepEqual(filtered.traceSets,materialized.traceSets);

const baselineSource=fs.readFileSync(new URL('../src/investigation/baseline-manager.js',import.meta.url),'utf8');
assert.equal(baselineSource.includes('indexes.map((i) => source[i]).filter(Boolean)'),false,'filtered baseline must not materialize an O(N) entry copy');
assert.equal(baselineSource.includes('function selectedEntries('),false,'obsolete selectedEntries helper must stay removed');
const missingRange=api.normalize({...B,id:'missing-range',timeRange:{startMs:null,endMs:''}});
assert.equal(missingRange.timeRange.startMs,null);
assert.equal(missingRange.timeRange.endMs,null);
const validRange=api.normalize({...B,id:'valid-range',timeRange:{startMs:'123',endMs:456}});
assert.equal(validRange.timeRange.startMs,123);
assert.equal(validRange.timeRange.endMs,456);
let history=[];history=api.addToHistory(history,B,{projectId:'payments',tags:['prod']});history=api.addToHistory(history,C,{projectId:'payments'});assert.equal(history.length,2);assert.equal(api.historyForProject(history,'payments').length,2);assert.ok(api.compareById(history,'cur','base').summary.serviceChanges>0);history=api.renameInHistory(history,'base','Production baseline');assert.equal(history.find(x=>x.id==='base').baseline.name,'Production baseline');const imported=api.importHistory(api.exportHistory(history),[]);assert.equal(imported.length,2);assert.equal(api.removeFromHistory(imported,'cur').length,1);console.log('baseline-manager-smoke PASS');
