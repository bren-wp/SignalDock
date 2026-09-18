import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..'); globalThis.window=globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root,'src/analysis/service-trends.js'),'utf8'),{filename:'src/analysis/service-trends.js'});
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)}; const t=Date.parse('2026-01-01T00:00:00Z');
const entries=[
 {service:'api',level:'INFO',timestampMs:t,correlations:{span:'a'},traceMeta:{}},
 {service:'auth',level:'INFO',timestampMs:t+1000,correlations:{span:'b'},traceMeta:{parentSpan:'a',durationMs:10}},
 {service:'api',level:'INFO',timestampMs:t+2000,correlations:{span:'c'},traceMeta:{}},
 {service:'auth',level:'INFO',timestampMs:t+3000,correlations:{span:'d'},traceMeta:{parentSpan:'c',durationMs:12}},
 {service:'api',level:'INFO',timestampMs:t+10000,correlations:{span:'e'},traceMeta:{}},
 {service:'auth',level:'ERROR',timestampMs:t+11000,correlations:{span:'f'},traceMeta:{parentSpan:'e',durationMs:40}},
 {service:'api',level:'INFO',timestampMs:t+12000,correlations:{span:'g'},traceMeta:{}},
 {service:'auth',level:'ERROR',timestampMs:t+13000,correlations:{span:'h'},traceMeta:{parentSpan:'g',durationMs:50}},
 {service:'api',level:'INFO',timestampMs:t+14000,correlations:{span:'i'},traceMeta:{}},
 {service:'auth',level:'ERROR',timestampMs:t+15000,correlations:{span:'j'},traceMeta:{parentSpan:'i',durationMs:60}}
];
const data=globalThis.SignalDockServiceTrends.compare(entries,null,{splitMs:t+8000});
assert(data.rows.length===1,'expected one edge'); const row=data.rows[0];
const autoSplit=globalThis.SignalDockServiceTrends.compare(entries,null,{splitMs:null});
assert(autoSplit.windows!==null,'null split must use the default midpoint');
assert(autoSplit.windows.before.endMs===t+7500,'null split midpoint changed');
const emptySplit=globalThis.SignalDockServiceTrends.compare(entries,null,{splitMs:''});
assert(emptySplit.windows?.before.endMs===t+7500,'empty split must use the default midpoint');
assert(row.before.calls===2&&row.after.calls===3,'period call counts mismatch');
assert(row.after.errors===3&&row.deltaErrors===3,'period error delta mismatch');
assert(row.before.medianMs===10&&row.before.p95Ms===12,'before percentile values changed');
assert(row.after.medianMs===50&&row.after.p95Ms===60,'after percentile values changed');
assert(['rising','degrading'].includes(row.trend),'expected rising/degrading trend');
assert(data.windows.before.endMs===t+8000,'split window mismatch');
const largeEntries=Array.from({length:200000},(_,index)=>({timestampMs:t+index}));
const largeData=globalThis.SignalDockServiceTrends.compare(largeEntries);
assert(largeData.windows!==null,'large timestamp scan should complete without argument-spread overflow');
assert(largeData.windows.before.startMs===t,'large timestamp scan minimum mismatch');
assert(largeData.windows.after.endMs===t+199999,'large timestamp scan maximum mismatch');
const source=fs.readFileSync(path.join(root,'src/analysis/service-trends.js'),'utf8');
assert((source.match(/rows\.filter\(/g)||[]).length===0,'service trend summary must not rescan rows with filter()');
assert(!source.includes('new Map([...edges.entries()].map'),'service trends must not build an intermediate normalized edge array');
console.log('service-trends-smoke: ok');
