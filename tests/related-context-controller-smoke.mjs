import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const source = read("src/app/related-context-controller.js");

assert.ok(html.includes("src/app/related-context-controller.js"));
assert.ok(html.indexOf("src/app/related-context-controller.js") < html.indexOf("app.js"));
assert.ok(app.includes("SignalDockRelatedContextController.create"));
assert.ok(app.includes("relatedContextController?.loadCorrelations"));
assert.ok(app.includes("relatedContextController?.loadTrace"));
assert.ok(!app.includes("engine().relatedIndexes(state.filterEntries, correlations, 200"));
assert.ok(!app.includes("engine().relatedIndexes(state.filterEntries, correlations, 1000"));

for (const token of ["SignalDockQueryEngine", "SignalDockFilterWorkerController", "new Worker", ".postMessage(", "indexedDB", "localStorage", "showOpenFilePicker", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("]) {
  assert.ok(!source.includes(token), "forbidden Related Context capability: " + token);
}
assert.ok(!/\bfetch\s*\(/.test(source));

const state = {
  filterEntries: [{ correlations: { trace: "t1" } }, { correlations: {} }],
  correlationRequestId: 0,
  traceRequestId: 0,
  correlatedIndexes: [],
  traceIndexes: [],
  correlationEngine: "idle",
  traceEngine: "idle"
};
let worker = true;
let correlationDispatches = [];
let traceDispatches = [];
let correlationRenders = 0;
let traceRenders = 0;
let relatedCalls = [];
let nowValue = 10;
const performanceRecords = [];
const host = {};

vm.runInNewContext(source, { self: host, window: host, console, Object, Array, Math }, { filename: "related-context-controller.js" });
const controller = host.SignalDockRelatedContextController.create({
  state,
  relatedIndexes: (entries, correlations, limit, origin) => {
    relatedCalls.push({ entries, correlations, limit, origin });
    return limit === 200 ? [0] : [0, 1];
  },
  canUseWorker: () => worker,
  requestCorrelation: (payload) => { correlationDispatches.push(payload); return true; },
  requestTrace: (payload) => { traceDispatches.push(payload); return true; },
  renderCorrelations: () => { correlationRenders += 1; },
  renderTrace: () => { traceRenders += 1; },
  now: () => { nowValue += 1.25; return nowValue; },
  recordPerformance: (name, elapsed, meta) => { performanceRecords.push({ name, elapsed, meta }); }
});

const entryA = { globalIndex: 0, correlations: { trace: "trace-a", job: "job-a" } };
const entryEmpty = { globalIndex: 1, correlations: {} };

const workerCorrelation = controller.loadCorrelations(entryA);
assert.equal(workerCorrelation.mode, "worker");
assert.equal(state.correlationRequestId, 1);
assert.equal(correlationDispatches[0].requestId, 1);
assert.equal(correlationDispatches[0].limit, 200);
assert.equal(state.correlationEngine, "worker · searching");

const emptyCorrelation = controller.loadCorrelations(entryEmpty);
assert.equal(emptyCorrelation.mode, "none");
assert.equal(state.correlationRequestId, 2, "empty entry must invalidate prior correlation request");
assert.deepEqual(Array.from(state.correlatedIndexes), []);
assert.equal(state.correlationEngine, "none");
assert.notEqual(correlationDispatches[0].requestId, state.correlationRequestId, "previous worker response must now be stale");

const workerTrace = controller.loadTrace(entryA);
assert.equal(workerTrace.mode, "worker");
assert.equal(state.traceRequestId, 1);
assert.equal(traceDispatches[0].requestId, 1);
assert.equal(traceDispatches[0].limit, 1000);
assert.equal(state.traceEngine, "worker · searching");

const emptyTrace = controller.loadTrace(entryEmpty);
assert.equal(emptyTrace.mode, "none");
assert.equal(state.traceRequestId, 2, "no-trace entry must invalidate prior trace request");
assert.deepEqual(Array.from(state.traceIndexes), []);
assert.equal(state.traceEngine, "none");
assert.notEqual(traceDispatches[0].requestId, state.traceRequestId, "previous trace worker response must now be stale");

worker = false;
const mainCorrelation = controller.loadCorrelations(entryA);
assert.equal(mainCorrelation.mode, "main");
assert.equal(state.correlationRequestId, 3);
assert.deepEqual(Array.from(state.correlatedIndexes), [0]);
assert.equal(relatedCalls.at(-1).limit, 200);
assert.equal(performanceRecords.at(-1).name, "correlation");

const mainTrace = controller.loadTrace(entryA);
assert.equal(mainTrace.mode, "main");
assert.equal(state.traceRequestId, 3);
assert.deepEqual(Array.from(state.traceIndexes), [0, 1]);
assert.equal(relatedCalls.at(-1).limit, 1000);
assert.equal(performanceRecords.at(-1).name, "trace");

worker = true;
const fallbackController = host.SignalDockRelatedContextController.create({
  state,
  relatedIndexes: (entries, correlations, limit) => limit === 200 ? [9] : [8],
  canUseWorker: () => true,
  requestCorrelation: () => false,
  requestTrace: () => false,
  renderCorrelations: () => {},
  renderTrace: () => {},
  now: () => { nowValue += 1; return nowValue; },
  recordPerformance: () => {}
});
assert.equal(fallbackController.loadCorrelations(entryA).mode, "main", "failed worker correlation dispatch must fall back");
assert.equal(fallbackController.loadTrace(entryA).mode, "main", "failed worker trace dispatch must fall back");

assert.ok(correlationRenders >= 3);
assert.ok(traceRenders >= 3);
console.log("related-context-controller-smoke PASS");
