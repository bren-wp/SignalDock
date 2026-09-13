(function(root){"use strict";
 const SCHEMA="signaldock.case-checkpoints",VERSION=1,MAX=40;
 function clean(v,max=4000){return String(v??"").trim().slice(0,max)}
 function evidenceIds(inv){return (Array.isArray(inv?.items)?inv.items:[]).map(x=>clean(x.id,96)).filter(Boolean).slice(0,5000)}
 function normalizeOne(cp,i=0){const s=cp&&typeof cp==="object"?cp:{};return{id:clean(s.id||`checkpoint-${i+1}`,96),label:clean(s.label||`Checkpoint ${i+1}`,160),note:clean(s.note||"",3000),createdAt:clean(s.createdAt||new Date().toISOString(),64),caseFile:s.caseFile&&typeof s.caseFile==="object"?s.caseFile:{},evidenceIds:Array.isArray(s.evidenceIds)?s.evidenceIds.map(x=>clean(x,96)).filter(Boolean).slice(0,5000):[]}}
 function normalizeList(input){return(Array.isArray(input)?input:[]).slice(-MAX).map(normalizeOne)}
 function snapshotCase(caseFile){const c=root.SignalDockCaseWorkspace?.normalize?.(caseFile)||caseFile||{};return {...c,findings:(c.findings||[]).slice(-300),milestones:(c.milestones||[]).slice(-100),attachments:(c.attachments||[]).slice(-100),activity:(c.activity||[]).slice(-100)}}
 function create(caseFile,investigation,options={}){return normalizeOne({id:`checkpoint-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,label:options.label||`Checkpoint ${new Date().toLocaleString()}`,note:options.note||"",createdAt:new Date().toISOString(),caseFile:snapshotCase(caseFile),evidenceIds:evidenceIds(investigation)})}
 function add(list,cp){const out=normalizeList(list);out.push(normalizeOne(cp,out.length));return out.slice(-MAX)}
 function remove(list,id){return normalizeList(list).filter(x=>x.id!==id)}
 function diff(cp,currentCase,investigation){const before=normalizeOne(cp);const after=root.SignalDockCaseWorkspace?.normalize?.(currentCase)||currentCase||{};const nowEvidence=new Set(evidenceIds(investigation));const oldEvidence=new Set(before.evidenceIds);const added=[...nowEvidence].filter(x=>!oldEvidence.has(x));const removed=[...oldEvidence].filter(x=>!nowEvidence.has(x));return{statusChanged:before.caseFile?.status!==after?.status,severityChanged:before.caseFile?.severity!==after?.severity,findingsDelta:(after?.findings?.length||0)-(before.caseFile?.findings?.length||0),milestonesDelta:(after?.milestones?.length||0)-(before.caseFile?.milestones?.length||0),attachmentsDelta:(after?.attachments?.length||0)-(before.caseFile?.attachments?.length||0),evidenceAdded:added,evidenceRemoved:removed}}
 root.SignalDockCaseCheckpoints={SCHEMA,VERSION,MAX,normalizeList,create,add,remove,diff};
}(typeof self!=="undefined"?self:window));
