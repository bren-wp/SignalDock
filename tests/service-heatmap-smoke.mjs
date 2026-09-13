import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..'); globalThis.window=globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root,'service-heatmap.js'),'utf8'),{filename:'service-heatmap.js'});
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const t=Date.parse('2026-01-01T00:00:00Z');
const entries=[
 {service:'api',level:'INFO',timestampMs:t,correlations:{span:'a'},traceMeta:{}},
 {service:'auth',level:'INFO',timestampMs:t+1000,correlations:{span:'b'},traceMeta:{parentSpan:'a',durationMs:12}},
 {service:'api',level:'INFO',timestampMs:t+2000,correlations:{span:'c'},traceMeta:{}},
 {service:'auth',level:'ERROR',timestampMs:t+9000,correlations:{span:'d'},traceMeta:{parentSpan:'c',durationMs:30}}
];
const data=globalThis.SignalDockServiceHeatmap.build(entries,null,{bucketCount:4});
assert(data.rows.length===1,'expected one dependency edge');
assert(data.summary.calls===2&&data.summary.errors===1,'heatmap summary mismatch');
assert(data.buckets.length>=1&&data.rows[0].buckets.reduce((s,b)=>s+b.calls,0)===2,'bucket calls mismatch');
assert(data.rows[0].buckets.some(b=>b.errors===1),'error bucket missing');
console.log('service-heatmap-smoke: ok');
