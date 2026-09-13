import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..'); globalThis.window=globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root,'case-timeline.js'),'utf8'),{filename:'case-timeline.js'});
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const out=globalThis.SignalDockCaseTimeline.build({activity:[{id:'a',at:'2026-01-01T00:02:00Z',title:'Status changed',type:'case.status'}],milestones:[{id:'m',at:'2026-01-01T00:03:00Z',title:'Mitigation',status:'reached'}]},{items:[{id:'e',timestamp:'2026-01-01T00:01:00Z',message:'Timeout',level:'ERROR',service:'api'}]});
assert(out.items.length===3,'combined timeline count mismatch');
assert(out.items[0].type==='evidence'&&out.items[2].type==='milestone','timeline sort mismatch');
assert(out.summary.activity===1&&out.summary.milestones===1&&out.summary.evidence===1,'timeline summary mismatch');
console.log('case-timeline-smoke: ok');
