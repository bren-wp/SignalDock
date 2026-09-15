import fs from 'node:fs'; import vm from 'node:vm';
const code=fs.readFileSync(new URL('../src/analysis/exception-groups.js',import.meta.url),'utf8'); const context={self:{},window:{},console,Map,Set,Math,Date}; vm.createContext(context); vm.runInContext(code,context); const api=context.self.SignalDockExceptionGroups;
function assert(c,m){if(!c)throw new Error(m)}
const base={service:'api',source:'api.log',level:'ERROR',timestampMs:1000};
const a={...base,id:'a',globalIndex:0,message:'TimeoutError: request 123 failed for 10.0.0.12 at /srv/app/user.js:42'};
const b={...base,id:'b',globalIndex:1,timestampMs:2000,message:'TimeoutError: request 999 failed for 10.0.0.88 at /srv/app/user.js:91'};
const c={...base,id:'c',globalIndex:2,service:'db',message:'UniqueConstraintError: email already exists'};
assert(api.fingerprint(a)===api.fingerprint(b),'dynamic values should normalize to same fingerprint');
const groups=api.group([a,b,c]); assert(groups.length===2,'expected two groups'); assert(groups[0].count===2,'expected grouped duplicate exceptions');
assert(groups[0].firstTimestampMs===1000&&groups[0].lastTimestampMs===2000,'time range failed');
const sum=api.summary(groups); assert(sum.occurrences===3&&sum.errors===3,'summary failed');
console.log('exception groups smoke ok');
