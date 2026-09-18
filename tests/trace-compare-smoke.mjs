import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..'); globalThis.window=globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root,'src/analysis/trace-compare.js'),'utf8'),{filename:'src/analysis/trace-compare.js'});
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)}; const t=Date.parse('2026-01-01T00:00:00Z');
const entries=[
 {service:'api',level:'INFO',timestampMs:t,correlations:{trace:'a',span:'a1'},traceMeta:{durationMs:20}},
 {service:'db',level:'ERROR',timestampMs:t+5,correlations:{trace:'a',span:'a2'},traceMeta:{parentSpan:'a1',durationMs:10}},
 {service:'api',level:'INFO',timestampMs:t,correlations:{trace:'b',span:'b1'},traceMeta:{durationMs:50}},
 {service:'cache',level:'WARN',timestampMs:t+10,correlations:{trace:'b',span:'b2'},traceMeta:{parentSpan:'b1',durationMs:30}}
];
const result=globalThis.SignalDockTraceCompare.compare(entries,'a','b');
assert(result.left.errors===1&&result.right.warnings===1,'trace severity comparison failed');
assert(result.delta.durationMs>0,'trace duration delta should be positive');
assert(result.services.shared.includes('api')&&result.services.leftOnly.includes('db')&&result.services.rightOnly.includes('cache'),'service diff mismatch');
assert(result.left.parentCoverage===1&&result.right.parentCoverage===1,'trace parent coverage changed');

const largeEntries=Array.from({length:200000},(_,index)=>({
 service:'noise',
 level:'INFO',
 timestampMs:t+index,
 correlations:{trace:`noise-${index}`,span:`noise-span-${index}`},
 traceMeta:{durationMs:1}
}));
largeEntries.push(
 {service:'api',level:'INFO',timestampMs:t+300000,correlations:{trace:'target',span:'root'},traceMeta:{durationMs:20}},
 {service:'db',level:'ERROR',timestampMs:t+300005,correlations:{trace:'target',span:'child'},traceMeta:{parentSpan:'root',durationMs:10}}
);
const largeSummary=globalThis.SignalDockTraceCompare.summarize(largeEntries,'target');
assert(largeSummary.entries===2&&largeSummary.spans===2&&largeSummary.errors===1,'large trace summary mismatch');
assert(largeSummary.parentCoverage===1,'large trace parent coverage mismatch');

const source=fs.readFileSync(path.join(root,'src/analysis/trace-compare.js'),'utf8');
assert(!source.includes('.filter((entry) => String(entry?.correlations?.trace'),'trace compare must not materialize a filtered trace entry array');
assert(!source.includes('const parentIds = []'),'trace compare must not retain a duplicate parent id array');
console.log('trace-compare-smoke: ok');
