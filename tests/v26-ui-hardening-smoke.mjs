
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8'); const html=fs.readFileSync(path.join(root,'index.html'),'utf8'); const css=fs.readFileSync(path.join(root,'styles.css'),'utf8'); const ui=fs.readFileSync(path.join(root,'ui-hardening.js'),'utf8');
const required=[[html,'ui-hardening.js'],[app,'buildWindow'],[app,'summary?.traces'],[css,'SignalDock v2.6 accessibility and mobile hardening'],[css,'prefers-reduced-motion'],[ui,'aria-labelledby'],[ui,'trapTab'],[ui,'has-coarse-pointer']];
for(const [haystack,token] of required) if(!haystack.includes(token)) throw new Error(`Missing v2.6 integration token: ${token}`);
console.log('v26-ui-hardening-smoke PASS');
