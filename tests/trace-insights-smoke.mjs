import fs from 'node:fs'; import vm from 'node:vm';
const context={self:{},window:{}}; context.self=context; context.window=context; vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../trace-insights.js',import.meta.url),'utf8'),context);
const entries=[
 {service:'api',level:'INFO',correlations:{span:'s1'},traceMeta:{durationMs:20,otel:{kind:'SERVER',scope:{name:'http'},resource:{'service.name':'api'},events:[{name:'a'}]}}},
 {service:'db',level:'ERROR',correlations:{span:'s2',parent_span:'s1'},traceMeta:{durationMs:10,otel:{kind:'CLIENT',scope:{name:'db'},resource:{'service.name':'db'},status:{code:'ERROR'}}}},
 {service:'worker',level:'INFO',correlations:{span:'s3',parent_span:'missing'},traceMeta:{otel:{}}},
 {service:'api',level:'INFO',correlations:{},traceMeta:{otel:{}}}
];
const result=context.SignalDockTraceInsights.analyze(entries);
if(result.spans!==3||result.roots!==1||result.orphans!==1||result.errorSpans!==1||result.spanEvents!==1) throw new Error('trace insight counts failed');
if(!(result.parentCoverage>0 && result.parentCoverage<1)) throw new Error('parent coverage failed');
console.log('trace-insights-smoke: ok');
