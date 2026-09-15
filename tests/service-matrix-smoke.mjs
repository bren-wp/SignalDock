import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '..');
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, 'src/analysis/service-matrix.js'), 'utf8'), { filename:'src/analysis/service-matrix.js' });
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const entries=[
 {service:'api',level:'INFO',correlations:{trace:'t1',span:'a'},traceMeta:{parentSpan:'',durationMs:50}},
 {service:'auth',level:'ERROR',correlations:{trace:'t1',span:'b'},traceMeta:{parentSpan:'a',durationMs:12}},
 {service:'auth',level:'INFO',correlations:{trace:'t2',span:'c'},traceMeta:{parentSpan:'',durationMs:20}},
 {service:'db',level:'WARN',correlations:{trace:'t2',span:'d'},traceMeta:{parentSpan:'c',durationMs:40}},
 {service:'db',level:'INFO',correlations:{trace:'t3',span:'e'},traceMeta:{parentSpan:'',durationMs:7}},
 {service:'cache',level:'INFO',correlations:{trace:'t3',span:'f'},traceMeta:{parentSpan:'e'}}
];
const matrix=globalThis.SignalDockServiceMatrix.build(entries);
assert(matrix.summary.edges===3,'edge count mismatch');
const apiAuth=matrix.rows.find(r=>r.source==='api'&&r.target==='auth');
assert(apiAuth&&apiAuth.calls===1&&apiAuth.errors===1&&apiAuth.p95Ms===12,'api-auth stats mismatch');
const authDb=matrix.rows.find(r=>r.source==='auth'&&r.target==='db');
assert(authDb&&authDb.warnings===1&&authDb.medianMs===40,'auth-db stats mismatch');
const dbCache=matrix.rows.find(r=>r.source==='db'&&r.target==='cache');
assert(dbCache&&dbCache.timed===0&&dbCache.p95Ms===null,'untimed edge must remain untimed');
console.log('service-matrix-smoke: ok');
