import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..'); globalThis.window=globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root,'src/analysis/trace-explorer.js'),'utf8'),{filename:'src/analysis/trace-explorer.js'});
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const entries=[
 {service:'api',level:'INFO',timestampMs:1000,correlations:{trace:'t1',span:'s1'},traceMeta:{durationMs:100,parentSpan:'',otel:{events:[{name:'start'}]}}},
 {service:'db',level:'ERROR',timestampMs:1020,correlations:{trace:'t1',span:'s2'},traceMeta:{durationMs:50,parentSpan:'s1',otel:{events:[{name:'exception'}]}}},
 {service:'worker',level:'INFO',timestampMs:2000,correlations:{trace:'t2',span:'s3'},traceMeta:{durationMs:20,parentSpan:'missing'}}
];
const data=globalThis.SignalDockTraceExplorer.build(entries);
assert(data.summary.traces===2,'trace count mismatch');
const t1=data.rows.find(r=>r.traceId==='t1'); const t2=data.rows.find(r=>r.traceId==='t2');
assert(t1.serviceCount===2&&t1.errors===1&&t1.events===2&&t1.parentCoverage===1,'t1 summary mismatch');
assert(t1.durationMs===100,'trace duration must use observed span end range');
assert(t2.parentCoverage===0,'orphan parent should lower coverage');

const largeEntries=Array.from({length:12000},(_,index)=>({
 service:`svc-${index%17}`,
 level:index%113===0?'ERROR':index%29===0?'WARN':'INFO',
 timestampMs:index*10,
 correlations:{trace:`trace-${String(index).padStart(5,'0')}`,span:`span-${index}`},
 traceMeta:{durationMs:(index*37)%1000,parentSpan:''}
}));
const full=globalThis.SignalDockTraceExplorer.build(largeEntries);
const windowed=globalThis.SignalDockTraceExplorer.buildWindow(largeEntries,null,{limit:1000});
assert(windowed.rows.length===1000,'large trace window size mismatch');
assert(windowed.rows.map(r=>r.traceId).join('|')===full.rows.slice(0,1000).map(r=>r.traceId).join('|'),'bounded trace window ranking mismatch');
const offsetWindow=globalThis.SignalDockTraceExplorer.buildWindow(largeEntries,null,{offset:250,limit:300});
assert(offsetWindow.rows.map(r=>r.traceId).join('|')===full.rows.slice(250,550).map(r=>r.traceId).join('|'),'bounded trace offset ranking mismatch');
assert(windowed.summary.traces===12000&&windowed.summary.returned===1000&&windowed.summary.truncated===true,'large trace window summary mismatch');
console.log('trace-explorer-smoke: ok');
