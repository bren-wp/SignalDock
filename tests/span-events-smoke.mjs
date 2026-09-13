import fs from 'node:fs'; import vm from 'node:vm';
const code=fs.readFileSync(new URL('../span-events.js', import.meta.url),'utf8'); const context={console, Date, JSON, self:{}}; vm.createContext(context); vm.runInContext(code,context); const api=context.self.SignalDockSpanEvents;
const raw={span:{events:[{name:'exception',timeUnixNano:1720000000123000000,attributes:[{key:'exception.type',value:{stringValue:'TimeoutError'}},{key:'retry',value:{intValue:3}}]}]}};
const events=api.extract(raw); if(events.length!==1||events[0].name!=='exception'||events[0].attributes['exception.type']!=='TimeoutError') throw new Error('extract failed');
const rows=api.collect([{id:'x',globalIndex:0,service:'api',level:'ERROR',correlations:{trace:'t',span:'s'},traceMeta:{events}}]); if(rows.length!==1||rows[0].span!=='s') throw new Error('collect failed');
console.log('span-events smoke ok');
const otlp={resourceSpans:[{resource:{attributes:[{key:'service.name',value:{stringValue:'checkout'}},{key:'deployment.environment.name',value:{stringValue:'production'}}]},scopeSpans:[{scope:{name:'api'},spans:[{traceId:'trace-1',spanId:'span-1',parentSpanId:'',name:'GET /checkout',startTimeUnixNano:'1789245001100000000',endTimeUnixNano:'1789245001142000000',status:{code:'STATUS_CODE_ERROR',message:'boom'},attributes:[{key:'http.request.method',value:{stringValue:'GET'}}],events:[{name:'exception',timeUnixNano:'1789245001130000000',attributes:[{key:'exception.type',value:{stringValue:'TimeoutError'}}]}]}]}]}]};
const flat=api.flattenOtlp(otlp); if(flat.length!==1||flat[0].service!=='checkout'||flat[0].trace_id!=='trace-1'||Math.round(flat[0].duration_ms)!==42||flat[0].level!=='ERROR')throw new Error('OTLP flatten failed');
console.log('OTLP flatten smoke ok');
