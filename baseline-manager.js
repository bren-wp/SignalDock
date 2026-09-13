(function (root) {
  "use strict";

  const SCHEMA = "signaldock.baseline";
  const VERSION = 1;
  const MAX_ROWS = 5000;

  function clean(value, max = 240) { return String(value ?? "").trim().slice(0, max); }
  function percentile(values, p) {
    const nums = values.filter(Number.isFinite).sort((a,b)=>a-b);
    if (!nums.length) return null;
    const pos = (nums.length - 1) * p; const lo = Math.floor(pos); const hi = Math.ceil(pos);
    return lo === hi ? nums[lo] : nums[lo] + (nums[hi] - nums[lo]) * (pos - lo);
  }
  function selectedEntries(entries, indexes) {
    const source = Array.isArray(entries) ? entries : [];
    if (!Array.isArray(indexes)) return source;
    return indexes.map((i)=>source[i]).filter(Boolean);
  }
  function serviceRows(rows) {
    const map = new Map();
    for (const entry of rows) {
      const service = clean(entry?.service || "—", 160) || "—";
      const row = map.get(service) || { service, entries:0, errors:0, warnings:0, durations:[] };
      row.entries += 1;
      if (entry?.level === "ERROR" || entry?.level === "FATAL") row.errors += 1;
      else if (entry?.level === "WARN") row.warnings += 1;
      const d = Number(entry?.traceMeta?.durationMs); if (Number.isFinite(d) && d >= 0) row.durations.push(d);
      map.set(service,row);
    }
    return [...map.values()].map((row)=>({ service:row.service, entries:row.entries, errors:row.errors, warnings:row.warnings, errorRate:row.entries?row.errors/row.entries:0, p95Ms:percentile(row.durations,.95) })).sort((a,b)=>b.entries-a.entries||a.service.localeCompare(b.service)).slice(0,MAX_ROWS);
  }
  function dependencyRows(rows) {
    if (root.SignalDockServiceMatrix?.build) {
      const result = root.SignalDockServiceMatrix.build(rows);
      return (result?.rows || []).slice(0,MAX_ROWS).map((r)=>({ from:clean(r.source,160), to:clean(r.target,160), calls:Number(r.calls)||0, errors:Number(r.errors)||0, errorRate:Number(r.errorRate)||0, p95Ms:Number.isFinite(r.p95Ms)?r.p95Ms:null }));
    }
    return [];
  }
  function traceSets(rows) {
    if (!root.SignalDockTraceExplorer?.build) return [];
    const traces = root.SignalDockTraceExplorer.build(rows)?.rows || [];
    const map = new Map();
    for (const trace of traces) {
      const services = [...(trace.services || [])].sort();
      const signature = services.join("→") || "(unknown)";
      const row = map.get(signature) || { signature, services, traces:0, errors:0, durations:[], spans:[] };
      row.traces += 1; row.errors += trace.errors > 0 ? 1 : 0;
      if (Number.isFinite(trace.durationMs)) row.durations.push(trace.durationMs);
      if (Number.isFinite(trace.spans)) row.spans.push(trace.spans);
      map.set(signature,row);
    }
    return [...map.values()].map((row)=>({ signature:row.signature, services:row.services, traces:row.traces, errorRate:row.traces?row.errors/row.traces:0, medianDurationMs:percentile(row.durations,.5), p95DurationMs:percentile(row.durations,.95), medianSpans:percentile(row.spans,.5) })).sort((a,b)=>b.traces-a.traces||a.signature.localeCompare(b.signature)).slice(0,MAX_ROWS);
  }
  function snapshot(entries, indexes = null, options = {}) {
    const rows = selectedEntries(entries,indexes);
    let min = null, max = null;
    for (const entry of rows) { const t=Number(entry?.timestampMs); if(!Number.isFinite(t))continue; min=min===null?t:Math.min(min,t); max=max===null?t:Math.max(max,t); }
    const sources = [...new Set(rows.map((e)=>clean(e?.source,240)).filter(Boolean))].sort().slice(0,500);
    return { schema:SCHEMA, version:VERSION, appVersion:clean(options.appVersion,32), id:`baseline-${Date.now().toString(36)}`, name:clean(options.name || "SignalDock baseline",120), capturedAt:new Date().toISOString(), scope:options.scope === "filtered" ? "filtered" : "all", entries:rows.length, sources, timeRange:{ startMs:min, endMs:max }, services:serviceRows(rows), dependencies:dependencyRows(rows), traceSets:traceSets(rows) };
  }
  function normalize(input) {
    if (!input || typeof input !== "object" || input.schema !== SCHEMA || Number(input.version)!==VERSION) throw new Error("Unsupported or invalid SignalDock baseline.");
    return { schema:SCHEMA, version:VERSION, appVersion:clean(input.appVersion,32), id:clean(input.id,96), name:clean(input.name||"SignalDock baseline",120), capturedAt:clean(input.capturedAt,64), scope:input.scope==="filtered"?"filtered":"all", entries:Math.max(0,Number(input.entries)||0), sources:(Array.isArray(input.sources)?input.sources:[]).map((v)=>clean(v,240)).filter(Boolean).slice(0,500), timeRange:{ startMs:Number.isFinite(Number(input.timeRange?.startMs))?Number(input.timeRange.startMs):null, endMs:Number.isFinite(Number(input.timeRange?.endMs))?Number(input.timeRange.endMs):null }, services:(Array.isArray(input.services)?input.services:[]).slice(0,MAX_ROWS), dependencies:(Array.isArray(input.dependencies)?input.dependencies:[]).slice(0,MAX_ROWS), traceSets:(Array.isArray(input.traceSets)?input.traceSets:[]).slice(0,MAX_ROWS) };
  }
  function exportJson(value) { return JSON.stringify(normalize(value), null, 2); }
  function parse(text) { return normalize(JSON.parse(String(text||""))); }
  function compare(current, baseline) {
    const cur=normalize(current), base=normalize(baseline);
    const join=(a,b,keyFn,mapper)=>{const am=new Map(a.map(x=>[keyFn(x),x]));const bm=new Map(b.map(x=>[keyFn(x),x]));return [...new Set([...am.keys(),...bm.keys()])].map(k=>mapper(am.get(k),bm.get(k),k));};
    const services=join(cur.services,base.services,x=>x.service,(c,b,key)=>({ service:key, currentEntries:c?.entries||0, baselineEntries:b?.entries||0, entryDelta:(c?.entries||0)-(b?.entries||0), currentErrorRate:c?.errorRate||0, baselineErrorRate:b?.errorRate||0, errorRateDelta:(c?.errorRate||0)-(b?.errorRate||0), currentP95:c?.p95Ms??null, baselineP95:b?.p95Ms??null, p95Delta:Number.isFinite(c?.p95Ms)&&Number.isFinite(b?.p95Ms)?c.p95Ms-b.p95Ms:null })).sort((a,b)=>Math.abs(b.errorRateDelta)-Math.abs(a.errorRateDelta)||Math.abs(b.entryDelta)-Math.abs(a.entryDelta));
    const dependencies=join(cur.dependencies,base.dependencies,x=>`${x.from}\u0000${x.to}`,(c,b,key)=>{const [from,to]=key.split("\u0000");return{from,to,currentCalls:c?.calls||0,baselineCalls:b?.calls||0,callDelta:(c?.calls||0)-(b?.calls||0),currentErrorRate:c?.errorRate||0,baselineErrorRate:b?.errorRate||0,errorRateDelta:(c?.errorRate||0)-(b?.errorRate||0),currentP95:c?.p95Ms??null,baselineP95:b?.p95Ms??null,p95Delta:Number.isFinite(c?.p95Ms)&&Number.isFinite(b?.p95Ms)?c.p95Ms-b.p95Ms:null};}).sort((a,b)=>Math.abs(b.errorRateDelta)-Math.abs(a.errorRateDelta)||Math.abs(b.callDelta)-Math.abs(a.callDelta));
    return { current:cur, baseline:base, services, dependencies, summary:{ currentEntries:cur.entries, baselineEntries:base.entries, serviceChanges:services.filter(r=>r.entryDelta||r.errorRateDelta||r.p95Delta).length, dependencyChanges:dependencies.filter(r=>r.callDelta||r.errorRateDelta||r.p95Delta).length } };
  }
  root.SignalDockBaselineManager={SCHEMA,VERSION,snapshot,normalize,exportJson,parse,compare};
}(typeof self!=="undefined"?self:window));
