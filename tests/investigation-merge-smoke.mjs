import fs from 'node:fs'; import vm from 'node:vm';
const context={self:{},window:{}}; context.self=context; context.window=context; vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../investigation.js',import.meta.url),'utf8'),context);
const api=context.SignalDockInvestigation; const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const a={schema:api.SCHEMA,version:api.VERSION,title:'A',items:[{id:'a',entryId:'same',source:'x',level:'ERROR',message:'m',tags:[]}]};
const b={schema:api.SCHEMA,version:api.VERSION,title:'B',items:[{id:'b',entryId:'same',source:'x',level:'ERROR',message:'m',tags:[]},{id:'c',entryId:'new',source:'y',level:'WARN',message:'n',tags:[]}]};
const merged=api.merge(a,b); assert(merged.notebook.items.length===2&&merged.added===1&&merged.skipped===1,'investigation merge dedupe failed'); assert(merged.idMap.b==='a'&&merged.idMap.c==='c','investigation merge id remap failed');
console.log('investigation-merge-smoke: ok');
