import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..');
const context={console,TextDecoder,Blob,Response,ReadableStream,window:{},self:{}}; context.window=context; context.self=context; vm.createContext(context);
for(const file of ['span-events.js','parser-plugins.js','parser.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const payload={resourceSpans:[{schemaUrl:'https://opentelemetry.io/schemas/1.26.0',resource:{attributes:[{key:'service.name',value:{stringValue:'checkout'}},{key:'deployment.environment.name',value:{stringValue:'prod'}}]},scopeSpans:[{schemaUrl:'scope-schema',scope:{name:'io.opentelemetry.http',version:'2.1.0'},spans:[{traceId:'abc123',spanId:'def456',name:'GET /pay',startTimeUnixNano:'1726171200000000000',endTimeUnixNano:'1726171200012000000',attributes:[{key:'http.route',value:{stringValue:'/pay'}}],events:[]}]}]}]};
const flat=context.SignalDockSpanEvents.flattenOtlp(payload); if(flat[0]?.otel?.scope?.version!=='2.1.0'||flat[0]?.otel?.resourceSchemaUrl.indexOf('1.26.0')<0)throw new Error('OTLP scope/resource metadata flatten failed');
const parsed=context.SignalDockParser.parseText(JSON.stringify(payload),'otel.json','json'); const entry=parsed[0];
if(entry?.traceMeta?.otel?.scope?.name!=='io.opentelemetry.http'||entry.traceMeta.otel.attributes['http.route']!=='/pay')throw new Error('OTLP context did not survive parser normalization');
console.log('otel context smoke ok');
