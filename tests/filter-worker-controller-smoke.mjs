import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const source = read("src/app/filter-worker-controller.js");

assert.ok(html.includes("src/app/filter-worker-controller.js"));
assert.ok(html.indexOf("src/app/filter-worker-controller.js") < html.indexOf("app.js"));
assert.ok(app.includes("SignalDockFilterWorkerController.create"));
assert.ok(app.includes("filterWorkerController.init();"));
for (const token of ["function createWorkerSessionToken()", "function onWorkerMessage(", "state.worker.postMessage("]) {
  assert.ok(!app.includes(token), "root still owns worker orchestration: " + token);
}
for (const token of ["const PROTOCOL_VERSION = 1", "ALLOWED_INBOUND_TYPES", "message.protocol === PROTOCOL_VERSION", "message.token === state.workerToken", "protocol: 1", "state.worker.postMessage(message)"]) {
  assert.ok(source.includes(token), "missing worker protocol invariant: " + token);
}
assert.ok(!source.includes("event.origin"));
for (const token of ["new Worker", "window.crypto", "indexedDB", "localStorage", "showOpenFilePicker", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("]) {
  assert.ok(!source.includes(token), "forbidden worker-controller capability: " + token);
}

const session = "a".repeat(48);
const posted = [];
let created = 0;
let terminated = 0;
let diagnostics = 0;
let filtered = null;
let correlationsRendered = 0;
let traceRendered = 0;
const records = [];
const notices = [];
const worker = {
  onmessage: null,
  onerror: null,
  postMessage(message) { posted.push(message); },
  terminate() { terminated += 1; }
};
const state = {
  entries: Array.from({ length: 25000 }, (_, i) => ({ id: "sd-" + i })),
  filterEntries: Array.from({ length: 25000 }, (_, i) => ({ searchText: "entry " + i })),
  settings: { useWorker: true },
  worker: null, workerAvailable: false, workerReady: false, workerVersion: 0, workerToken: "",
  filterRequestId: 7, correlationRequestId: 8, traceRequestId: 9,
  correlatedIndexes: [], traceIndexes: [], correlationEngine: "idle", traceEngine: "idle",
  lastEngine: "main", searchIndex: { enabled: false, mode: "linear", candidateCount: 0 }
};
const host = {};
vm.runInNewContext(source, { self: host, window: host, console, Set, Array, Number, Object }, { filename: "filter-worker-controller.js" });
const controller = host.SignalDockFilterWorkerController.create({
  state,
  workerThreshold: 25000,
  isFileProtocol: () => false,
  createSessionToken: () => session,
  createWorkerInstance: (value) => { assert.equal(value, session); created += 1; return worker; },
  applyFilteredIndexes: (indexes, invalid, reset) => { filtered = { indexes, invalid, reset }; },
  renderCorrelationsPane: () => { correlationsRendered += 1; },
  renderTracePane: () => { traceRendered += 1; },
  getSelectedEntry: () => ({ id: "sd-0" }),
  updateDiagnostics: () => { diagnostics += 1; },
  recordPerformance: (name, elapsed, meta) => { records.push({ name, elapsed, meta }); },
  toast: (message) => { notices.push(message); }
});

assert.equal(controller.init(), true);
assert.equal(controller.init(), true);
assert.equal(created, 1);
assert.equal(state.workerToken, session);
worker.onmessage({ data: { type: "ready", protocol: 1, token: "wrong" } });
assert.equal(state.workerAvailable, false);
worker.onmessage({ data: { type: "unknown", protocol: 1, token: session } });
assert.equal(state.workerAvailable, false);
worker.onmessage({ data: { type: "ready", protocol: 1, token: session } });
assert.equal(state.workerAvailable, true);
assert.equal(posted[0].type, "index");
assert.equal(posted[0].protocol, 1);
assert.equal(posted[0].token, session);
assert.equal(posted[0].version, 1);

worker.onmessage({ data: { type: "indexed", protocol: 1, token: session, version: 1, searchIndex: { enabled: true, candidateCount: 25000 } } });
assert.equal(state.workerReady, true);
assert.equal(diagnostics, 1);
assert.equal(controller.canUseWorker(), true);

assert.equal(controller.requestFilter({ requestId: 7, request: { query: "needle" } }), true);
assert.equal(posted.at(-1).type, "filter");
worker.onmessage({ data: { type: "filtered", protocol: 1, token: session, version: 1, requestId: 7, searchMode: "indexed", candidateCount: 0, elapsedMs: 2.5, indexes: [], invalid: [] } });
assert.equal(state.searchIndex.candidateCount, 0);
assert.equal(state.lastEngine, "worker indexed · 2.5 ms");
assert.deepEqual(filtered, { indexes: [], invalid: [], reset: false });
assert.equal(records.at(-1).meta.candidates, 0);

assert.equal(controller.requestCorrelation({ requestId: 8, correlations: { trace: "abc" }, origin: 0 }), true);
assert.equal(posted.at(-1).type, "correlate");
worker.onmessage({ data: { type: "correlated", protocol: 1, token: session, version: 1, requestId: 8, elapsedMs: 3, indexes: [1, 2] } });
assert.deepEqual(Array.from(state.correlatedIndexes), [1, 2]);
assert.equal(correlationsRendered, 1);

assert.equal(controller.requestTrace({ requestId: 9, correlations: { trace: "abc" }, origin: 0 }), true);
assert.equal(posted.at(-1).type, "trace");
worker.onmessage({ data: { type: "trace-related", protocol: 1, token: session, version: 1, requestId: 9, elapsedMs: 4, indexes: [3] } });
assert.deepEqual(Array.from(state.traceIndexes), [3]);
assert.equal(traceRendered, 1);

worker.onmessage({ data: { type: "filtered", protocol: 1, token: session, version: 1, requestId: 6, indexes: [1] } });
assert.deepEqual(filtered, { indexes: [], invalid: [], reset: false });

controller.disable("fallback");
assert.equal(terminated, 1);
assert.equal(state.worker, null);
assert.equal(state.workerToken, "");
assert.equal(state.lastEngine, "main");
assert.equal(notices.at(-1), "fallback");
console.log("filter-worker-controller-smoke PASS");
