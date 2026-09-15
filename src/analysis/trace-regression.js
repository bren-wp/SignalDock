(function(root){"use strict";
  function finite(v){return Number.isFinite(Number(v));}
  function compare(currentSnapshot, baselineSnapshot){
    const cur=Array.isArray(currentSnapshot?.traceSets)?currentSnapshot.traceSets:[];
    const base=Array.isArray(baselineSnapshot?.traceSets)?baselineSnapshot.traceSets:[];
    const cm=new Map(cur.map(x=>[x.signature,x])), bm=new Map(base.map(x=>[x.signature,x]));
    const rows=[...new Set([...cm.keys(),...bm.keys()])].map(signature=>{const c=cm.get(signature),b=bm.get(signature);const p95Delta=finite(c?.p95DurationMs)&&finite(b?.p95DurationMs)?Number(c.p95DurationMs)-Number(b.p95DurationMs):null;const errDelta=(Number(c?.errorRate)||0)-(Number(b?.errorRate)||0);const countDelta=(Number(c?.traces)||0)-(Number(b?.traces)||0);let status="stable";if(!b)status="new";else if(!c)status="missing";else if((p95Delta!==null&&p95Delta>Math.max(25,(Number(b.p95DurationMs)||0)*.2))||errDelta>=.05)status="regressed";else if((p95Delta!==null&&p95Delta< -Math.max(25,(Number(b.p95DurationMs)||0)*.2))||errDelta<=-.05)status="improved";return{signature,services:c?.services||b?.services||[],status,currentTraces:Number(c?.traces)||0,baselineTraces:Number(b?.traces)||0,countDelta,currentP95:finite(c?.p95DurationMs)?Number(c.p95DurationMs):null,baselineP95:finite(b?.p95DurationMs)?Number(b.p95DurationMs):null,p95Delta,currentErrorRate:Number(c?.errorRate)||0,baselineErrorRate:Number(b?.errorRate)||0,errorRateDelta:errDelta};}).sort((a,b)=>{const rank={regressed:0,new:1,stable:2,improved:3,missing:4};return rank[a.status]-rank[b.status]||Math.abs(b.p95Delta||0)-Math.abs(a.p95Delta||0)||Math.abs(b.errorRateDelta)-Math.abs(a.errorRateDelta);});
    return{rows,summary:{sets:rows.length,regressed:rows.filter(r=>r.status==="regressed").length,improved:rows.filter(r=>r.status==="improved").length,newSets:rows.filter(r=>r.status==="new").length,missing:rows.filter(r=>r.status==="missing").length}};
  }
  root.SignalDockTraceRegression={compare};
}(typeof self!=="undefined"?self:window));
