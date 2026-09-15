import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..'); globalThis.window=globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root,'src/analysis/trace-outliers.js'),'utf8'),{filename:'src/analysis/trace-outliers.js'});
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)}; const t=Date.parse('2026-01-01T00:00:00Z');
const entries=[];
for(let n=0;n<8;n++){entries.push({service:'api',level:'INFO',timestampMs:t+n*1000,correlations:{trace:`t${n}`,span:`s${n}`},traceMeta:{durationMs:20+n}});}
entries.push({service:'api',level:'INFO',timestampMs:t+20000,correlations:{trace:'slow',span:'root'},traceMeta:{durationMs:1500}});
entries.push({service:'db',level:'ERROR',timestampMs:t+20010,correlations:{trace:'slow',span:'child'},traceMeta:{parentSpan:'root',durationMs:1200}});
const data=globalThis.SignalDockTraceOutliers.rank(entries,{limit:10});
assert(data.rows[0].traceId==='slow','slow error trace should rank first');
assert(data.rows[0].errors===1,'error count missing');
assert(data.rows[0].reasons.some(v=>v.includes('error')),'error reason missing');
assert(data.baseline.timedTraces>=8,'timed baseline missing');
console.log('trace-outliers-smoke: ok');
