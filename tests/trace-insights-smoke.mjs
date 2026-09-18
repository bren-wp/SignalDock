import fs from 'node:fs'; import vm from 'node:vm';
const context={self:{},window:{}}; context.self=context; context.window=context; vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../src/analysis/trace-insights.js',import.meta.url),'utf8'),context);
const entries=[
 {service:'api',level:'INFO',correlations:{span:'s1'},traceMeta:{durationMs:20,otel:{kind:'SERVER',scope:{name:'http'},resource:{'service.name':'api'},events:[{name:'a'}]}}},
 {service:'db',level:'ERROR',correlations:{span:'s2',parent_span:'s1'},traceMeta:{durationMs:10,otel:{kind:'CLIENT',scope:{name:'db'},resource:{'service.name':'db'},status:{code:'ERROR'}}}},
 {service:'worker',level:'INFO',correlations:{span:'s3',parent_span:'missing'},traceMeta:{otel:{}}},
 {service:'api',level:'INFO',correlations:{},traceMeta:{otel:{}}}
];
const result=context.SignalDockTraceInsights.analyze(entries);
if(result.spans!==3||result.roots!==1||result.orphans!==1||result.errorSpans!==1||result.spanEvents!==1) throw new Error('trace insight counts failed');
if(!(result.parentCoverage>0 && result.parentCoverage<1)) throw new Error('parent coverage failed');

const largeEntries=Array.from({length:200000},(_,index)=>({
 service:`svc-${index%13}`,
 level:index%997===0?'ERROR':'INFO',
 correlations:{span:`span-${index}`,parent_span:index? `span-${index-1}`:''},
 traceMeta:{durationMs:index%1000,otel:{}}
}));
const large=context.SignalDockTraceInsights.analyze(largeEntries);
if(large.spans!==200000||large.roots!==1||large.orphans!==0) throw new Error('large trace insight span scan failed');
if(large.parentCoverage!==1) throw new Error('large trace insight parent coverage failed');

const source=fs.readFileSync(new URL('../src/analysis/trace-insights.js',import.meta.url),'utf8');
if(source.includes('rows.filter((entry) => entry?.correlations?.span)')) throw new Error('trace insights must not materialize a full span copy');
if(source.includes('spans.map((entry) => String(entry.correlations.span))')) throw new Error('trace insights must not materialize a second span-id copy');
console.log('trace-insights-smoke: ok');
