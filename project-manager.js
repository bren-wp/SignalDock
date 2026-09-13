(function(root){"use strict";
 const KEY="signaldock-projects-v1",SCHEMA="signaldock.projects",VERSION=1,MAX=50;
 function clean(v,max=2000){return String(v??"").trim().slice(0,max)}
 function normalize(p,i=0){const s=p&&typeof p==="object"?p:{};return{id:clean(s.id||`project-${i+1}`,96),name:clean(s.name||`Project ${i+1}`,120),description:clean(s.description||"",2000),createdAt:clean(s.createdAt||new Date().toISOString(),64),updatedAt:clean(s.updatedAt||new Date().toISOString(),64),lastWorkspace:clean(s.lastWorkspace||"",240),baselineName:clean(s.baselineName||"",120)}}
 function load(){try{const raw=JSON.parse(root.localStorage?.getItem(KEY)||"[]");return(Array.isArray(raw)?raw:[]).slice(0,MAX).map(normalize)}catch{return[]}}
 function persist(list){const out=(Array.isArray(list)?list:[]).slice(0,MAX).map(normalize);root.localStorage?.setItem(KEY,JSON.stringify(out));return out}
 function create(list,patch={}){const out=loadOr(list);if(out.length>=MAX)throw new Error(`Project manager is limited to ${MAX} projects.`);const now=new Date().toISOString();const project=normalize({id:`project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,name:patch.name||`Project ${out.length+1}`,description:patch.description||"",createdAt:now,updatedAt:now});out.push(project);return{projects:persist(out),project}}
 function update(list,id,patch={}){const out=loadOr(list);const p=out.find(x=>x.id===id);if(!p)return persist(out);if("name" in patch)p.name=clean(patch.name,120)||p.name;if("description" in patch)p.description=clean(patch.description,2000);if("lastWorkspace" in patch)p.lastWorkspace=clean(patch.lastWorkspace,240);if("baselineName" in patch)p.baselineName=clean(patch.baselineName,120);p.updatedAt=new Date().toISOString();return persist(out)}
 function remove(list,id){return persist(loadOr(list).filter(x=>x.id!==id))}
 function loadOr(list){return Array.isArray(list)?list.map(normalize):load()}
 function exportJson(list,activeId=""){return JSON.stringify({schema:SCHEMA,version:VERSION,exportedAt:new Date().toISOString(),activeId:clean(activeId,96),projects:loadOr(list)},null,2)}
 function importJson(text){const p=JSON.parse(String(text||""));if(p?.schema!==SCHEMA||Number(p.version)!==VERSION||!Array.isArray(p.projects))throw new Error("Unsupported or invalid SignalDock projects file.");return{projects:persist(p.projects),activeId:clean(p.activeId,96)}}
 root.SignalDockProjectManager={KEY,SCHEMA,VERSION,MAX,normalize,load,persist,create,update,remove,exportJson,importJson};
}(typeof self!=="undefined"?self:window));
