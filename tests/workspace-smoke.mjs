import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "src/core/workspace.js"), "utf8"), { filename: "src/core/workspace.js" });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const entries = [
  {
    source: "api.ndjson",
    service: "api",
    index: 0,
    raw: { message: "request failed", trace_id: "trace-1", span_id: "span-2" },
    message: "request failed",
    level: "ERROR",
    timestamp: "2026-09-12T20:00:00.000Z",
    timestampMs: Date.parse("2026-09-12T20:00:00.000Z"),
    correlations: { trace: "trace-1", span: "span-2" },
    traceMeta: { parentSpan: "span-1", name: "request", durationMs: 12.4, events: [{ name: "exception", timestampMs: 1, timestamp: "1970-01-01T00:00:00.001Z", attributes: { type: "Timeout" } }] },
    dimensions: { environment: "production", namespace: "edge" }
  },
  {
    source: "api.ndjson",
    service: "db",
    index: 1,
    raw: "2026-09-12 INFO trace_id=trace-1 span_id=span-3 ok",
    message: "ok",
    level: "INFO",
    timestamp: "2026-09-12T20:00:00.020Z",
    timestampMs: Date.parse("2026-09-12T20:00:00.020Z"),
    correlations: { trace: "trace-1", span: "span-3" },
    traceMeta: { parentSpan: "span-2", name: "db query", durationMs: 4.2 }
  }
];

const workspace = {
  loadedBytes: 2048,
  inputFileCount: 1,
  view: { query: "trace:trace-1", level: "", source: "", timeRange: "", sortMode: "oldest", pageSize: 100, selectedGlobalIndex: 0, inspectorTab: "trace" },
  settings: { wrap: false, compact: true, showUnknown: true, useWorker: true, parserProfile: "json" },
  investigation: { schema: "signaldock.investigation", version: 2, title: "Incident 42", summary: "auth failure", items: [{ id: "ev-1", entryId: "sd-0", globalIndex: 0, source: "api.ndjson", service: "api", level: "ERROR", timestamp: "2026-09-12T20:00:00.000Z", message: "request failed", note: "primary evidence", tags: ["auth"], fingerprint: "ex-deadbeef", snapshot: { raw: { message: "request failed" }, correlations: { trace: "trace-1" }, traceMeta: { durationMs: 12.4 }, dimensions: { environment: "production" } } }] },
  caseFile: { schema: 'signaldock.case', version: 3, id: 'case-1', title: 'Incident 42', status: 'investigating', severity: 'sev2', summary: 'auth failure', hypothesis: 'token regression', impact: 'login failures', nextSteps: 'compare deploy', findings: [{id:'finding-1',title:'Regression after deploy',body:'Errors started after release',state:'confirmed',tags:['auth'],evidenceIds:['ev-1']}] },
  caseCheckpoints: [{ id:'checkpoint-1', label:'Before rollback', createdAt:'2026-09-12T20:01:00.000Z', caseFile:{title:'Incident 42',severity:'sev2',findings:[]}, evidenceIds:['ev-1'] }],
  baselineSnapshot: { schema:'signaldock.baseline', version:1, id:'baseline-1', name:'Production before deploy', capturedAt:'2026-09-12T19:00:00.000Z', scope:'all', entries:100, sources:['old.log'], timeRange:{startMs:1,endMs:2}, services:[], dependencies:[], traceSets:[] },
  activeProjectId: 'project-1'
};

const parts = globalThis.SignalDockWorkspace.serializeParts(entries, workspace, "2.4.0");
const text = parts.join("");
const parsed = globalThis.SignalDockWorkspace.parse(text);
assert(parsed.entries.length === 2, "workspace: expected two restored entries");
assert(parsed.entries[0].correlations.trace === "trace-1", "workspace: correlation was not preserved");
assert(parsed.entries[0].traceMeta.parentSpan === "span-1", "workspace: trace metadata was not preserved");
assert(parsed.entries[0].traceMeta.events?.[0]?.name === "exception", "workspace: span events were not preserved");
assert(parsed.entries[0].dimensions.environment === "production" && parsed.entries[0].dimensions.namespace === "edge", "workspace: environment/namespace dimensions were not preserved");
assert(parsed.entries[0].searchText.includes("trace:trace-1"), "workspace: search index was not rebuilt");
assert(parsed.workspace.view.inspectorTab === "trace", "workspace: view state was not preserved");
assert(parsed.workspace.settings.parserProfile === "json", "workspace: parser profile was not preserved");
assert(parsed.workspace.investigation?.items?.[0]?.note === "primary evidence", "workspace: investigation notebook was not preserved");
assert(parsed.workspace.investigation?.items?.[0]?.snapshot?.correlations?.trace === "trace-1", "workspace: evidence snapshot was not preserved");
assert(parsed.workspace.caseFile?.severity === 'sev2' && parsed.workspace.caseFile?.findings?.[0]?.evidenceIds?.[0] === 'ev-1', 'workspace: case workspace was not preserved');
assert(parsed.workspace.caseCheckpoints?.[0]?.label === 'Before rollback', 'workspace: case checkpoints were not preserved');
assert(parsed.workspace.baselineSnapshot?.name === 'Production before deploy', 'workspace: baseline snapshot was not preserved');
assert(parsed.workspace.activeProjectId === 'project-1', 'workspace: active project id was not preserved');
console.log("PASS workspace serialization + restore normalization");

const missingRawEntry = globalThis.SignalDockWorkspace.normalizeEntry({
  source: "legacy.log",
  message: "entry without raw",
  level: "INFO",
  timestamp: ""
}, 0);
assert(typeof missingRawEntry.searchText === "string", "workspace: missing raw must still build search text");
assert(missingRawEntry.searchText.includes("entry without raw"), "workspace: missing raw search text lost message");

const missingRawPayload = JSON.stringify({
  schema: "signaldock.workspace",
  version: 1,
  entries: [{ source: "legacy.log", message: "restored without raw", level: "INFO" }],
  workspace: {}
});
const missingRawParsed = globalThis.SignalDockWorkspace.parse(missingRawPayload);
assert(missingRawParsed.entries[0].message === "restored without raw", "workspace: entry without raw failed to restore");
console.log("PASS workspace missing-raw compatibility");

let rejected = false;
try { globalThis.SignalDockWorkspace.parse('{"schema":"wrong","version":1,"entries":[]}'); }
catch { rejected = true; }
assert(rejected, "workspace: invalid schema should be rejected");
console.log("PASS workspace schema validation");
console.log("SignalDock workspace smoke test passed.");
