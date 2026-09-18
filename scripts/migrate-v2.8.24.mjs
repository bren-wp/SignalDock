import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, content) => fs.writeFileSync(path.join(root, name), content);
function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), "migration anchor missing: " + label);
  assert.equal(source.indexOf(before), source.lastIndexOf(before), "migration anchor ambiguous: " + label);
  return source.replace(before, after);
}

assert.equal(read("VERSION").trim(), "2.8.23");
let app = read("app.js");
app = replaceOnce(app, '  const APP_VERSION = "2.8.23";', '  const APP_VERSION = "2.8.24";', "version");
app = replaceOnce(app, "  let datasetOverviewController = null;\n", "  let datasetOverviewController = null;\n  let filterWorkerController = null;\n", "controller slot");

const overviewBind = "    datasetOverviewController.bind();";
const wiring = [
  overviewBind,
  '    if (!window.SignalDockFilterWorkerController?.create) throw new Error("SignalDock Filter Worker controller is unavailable.");',
  '    filterWorkerController = window.SignalDockFilterWorkerController.create({',
  '      state, workerThreshold: WORKER_THRESHOLD,',
  '      isFileProtocol: () => window.location?.protocol === "file:",',
  '      createSessionToken: () => {',
  '        const cryptoApi = window.crypto;',
  '        if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID().replace(/-/g, "");',
  '        if (typeof cryptoApi?.getRandomValues === "function") { const bytes = new Uint8Array(24); cryptoApi.getRandomValues(bytes); return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""); }',
  '        return "";',
  '      },',
  '      createWorkerInstance: (token) => typeof Worker === "function" ? new Worker("filter-worker.js?sd_session=" + encodeURIComponent(token)) : null,',
  '      applyFilteredIndexes, renderCorrelationsPane, renderTracePane, getSelectedEntry: selectedEntry, updateDiagnostics,',
  '      recordPerformance: (name, elapsed, meta) => profiler()?.record?.(name, elapsed, meta),',
  '      toast',
  '    });'
].join("\n");
app = replaceOnce(app, overviewBind, wiring, "worker wiring");
app = replaceOnce(
  app,
  '      shouldUseWorkerFilter: () => state.settings.useWorker !== false && state.workerReady && state.entries.length >= WORKER_THRESHOLD,\n      requestWorkerFilter: ({ requestId, request }) => state.worker.postMessage({ type: "filter", protocol: 1, token: state.workerToken, requestId, request }),',
  '      shouldUseWorkerFilter: () => filterWorkerController?.canUseWorker() || false,\n      requestWorkerFilter: ({ requestId, request }) => filterWorkerController?.requestFilter({ requestId, request }) ?? false,',
  "filter handoff"
);

const workerStart = app.indexOf("  function createWorkerSessionToken() {");
const liveStart = app.indexOf("  async function startLiveTail()", workerStart);
assert.ok(workerStart >= 0 && liveStart > workerStart, "worker block missing");
app = app.slice(0, workerStart) + '  function syncWorkerIndex() { return filterWorkerController?.syncIndex() || false; }\n\n' + app.slice(liveStart);
app = replaceOnce(app, "    initFilterWorker();", "    filterWorkerController.init();", "worker init");

const eligibility = '    const useWorker = state.settings.useWorker !== false && state.workerReady && state.entries.length >= WORKER_THRESHOLD;';
assert.equal(app.split(eligibility).length - 1, 2);
app = app.replaceAll(eligibility, '    const useWorker = filterWorkerController?.canUseWorker() || false;');
app = replaceOnce(
  app,
  '      state.worker.postMessage({ type: "correlate", protocol: 1, token: state.workerToken, requestId, correlations, limit: 200, origin: entry.globalIndex });\n      return;',
  '      if (filterWorkerController.requestCorrelation({ requestId, correlations, limit: 200, origin: entry.globalIndex })) return;',
  "correlation dispatch"
);
app = replaceOnce(
  app,
  '      state.worker.postMessage({ type: "trace", protocol: 1, token: state.workerToken, requestId, correlations, limit: 1000, origin: entry.globalIndex });\n      return;',
  '      if (filterWorkerController.requestTrace({ requestId, correlations, limit: 1000, origin: entry.globalIndex })) return;',
  "trace dispatch"
);
write("app.js", app);

let filter = read("src/app/dataset-filter-controller.js");
filter = replaceOnce(
  filter,
  '      if (shouldUseWorkerFilter()) {\n        state.lastEngine = "worker";\n        if (el.resultsSummary) el.resultsSummary.textContent = "Filtering in background…";\n        ownerDocument.body?.classList?.add("filtering-active");\n        requestWorkerFilter({ requestId, request });\n        if (resetPage) state.page = 1;\n        return { engine: "worker", requestId };\n      }',
  '      if (shouldUseWorkerFilter()) {\n        const dispatched = requestWorkerFilter({ requestId, request });\n        if (dispatched !== false) {\n          state.lastEngine = "worker";\n          if (el.resultsSummary) el.resultsSummary.textContent = "Filtering in background…";\n          ownerDocument.body?.classList?.add("filtering-active");\n          if (resetPage) state.page = 1;\n          return { engine: "worker", requestId };\n        }\n      }',
  "filter dispatch fallback"
);
write("src/app/dataset-filter-controller.js", filter);

let html = read("index.html");
html = replaceOnce(html, '  <script src="src/app/dataset-overview-controller.js" defer></script>\n', '  <script src="src/app/dataset-overview-controller.js" defer></script>\n  <script src="src/app/filter-worker-controller.js" defer></script>\n', "script order");
write("index.html", html);

let layout = read("tests/source-layout-smoke.mjs");
layout = replaceOnce(layout, '  "src/app/dataset-overview-controller.js",\n', '  "src/app/dataset-overview-controller.js",\n  "src/app/filter-worker-controller.js",\n', "layout");
write("tests/source-layout-smoke.mjs", layout);
write("tests/filter-worker-controller-smoke.mjs", "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst source = read(\"src/app/filter-worker-controller.js\");\n\nassert.ok(html.includes(\"src/app/filter-worker-controller.js\"));\nassert.ok(html.indexOf(\"src/app/filter-worker-controller.js\") < html.indexOf(\"app.js\"));\nassert.ok(app.includes(\"SignalDockFilterWorkerController.create\"));\nassert.ok(app.includes(\"filterWorkerController.init();\"));\nfor (const token of [\"function createWorkerSessionToken()\", \"function onWorkerMessage(\", \"state.worker.postMessage(\"]) {\n  assert.ok(!app.includes(token), \"root still owns worker orchestration: \" + token);\n}\nfor (const token of [\"const PROTOCOL_VERSION = 1\", \"ALLOWED_INBOUND_TYPES\", \"message.protocol === PROTOCOL_VERSION\", \"message.token === state.workerToken\", \"protocol: 1\", \"state.worker.postMessage(message)\"]) {\n  assert.ok(source.includes(token), \"missing worker protocol invariant: \" + token);\n}\nassert.ok(!source.includes(\"event.origin\"));\nfor (const token of [\"new Worker\", \"window.crypto\", \"indexedDB\", \"localStorage\", \"showOpenFilePicker\", \"XMLHttpRequest\", \"WebSocket\", \"EventSource\", \".invoke(\"]) {\n  assert.ok(!source.includes(token), \"forbidden worker-controller capability: \" + token);\n}\n\nconst session = \"a\".repeat(48);\nconst posted = [];\nlet created = 0;\nlet terminated = 0;\nlet diagnostics = 0;\nlet filtered = null;\nlet correlationsRendered = 0;\nlet traceRendered = 0;\nconst records = [];\nconst notices = [];\nconst worker = {\n  onmessage: null,\n  onerror: null,\n  postMessage(message) { posted.push(message); },\n  terminate() { terminated += 1; }\n};\nconst state = {\n  entries: Array.from({ length: 25000 }, (_, i) => ({ id: \"sd-\" + i })),\n  filterEntries: Array.from({ length: 25000 }, (_, i) => ({ searchText: \"entry \" + i })),\n  settings: { useWorker: true },\n  worker: null, workerAvailable: false, workerReady: false, workerVersion: 0, workerToken: \"\",\n  filterRequestId: 7, correlationRequestId: 8, traceRequestId: 9,\n  correlatedIndexes: [], traceIndexes: [], correlationEngine: \"idle\", traceEngine: \"idle\",\n  lastEngine: \"main\", searchIndex: { enabled: false, mode: \"linear\", candidateCount: 0 }\n};\nconst host = {};\nvm.runInNewContext(source, { self: host, window: host, console, Set, Array, Number, Object }, { filename: \"filter-worker-controller.js\" });\nconst controller = host.SignalDockFilterWorkerController.create({\n  state,\n  workerThreshold: 25000,\n  isFileProtocol: () => false,\n  createSessionToken: () => session,\n  createWorkerInstance: (value) => { assert.equal(value, session); created += 1; return worker; },\n  applyFilteredIndexes: (indexes, invalid, reset) => { filtered = { indexes, invalid, reset }; },\n  renderCorrelationsPane: () => { correlationsRendered += 1; },\n  renderTracePane: () => { traceRendered += 1; },\n  getSelectedEntry: () => ({ id: \"sd-0\" }),\n  updateDiagnostics: () => { diagnostics += 1; },\n  recordPerformance: (name, elapsed, meta) => { records.push({ name, elapsed, meta }); },\n  toast: (message) => { notices.push(message); }\n});\n\nassert.equal(controller.init(), true);\nassert.equal(controller.init(), true);\nassert.equal(created, 1);\nassert.equal(state.workerToken, session);\nworker.onmessage({ data: { type: \"ready\", protocol: 1, token: \"wrong\" } });\nassert.equal(state.workerAvailable, false);\nworker.onmessage({ data: { type: \"unknown\", protocol: 1, token: session } });\nassert.equal(state.workerAvailable, false);\nworker.onmessage({ data: { type: \"ready\", protocol: 1, token: session } });\nassert.equal(state.workerAvailable, true);\nassert.equal(posted[0].type, \"index\");\nassert.equal(posted[0].protocol, 1);\nassert.equal(posted[0].token, session);\nassert.equal(posted[0].version, 1);\n\nworker.onmessage({ data: { type: \"indexed\", protocol: 1, token: session, version: 1, searchIndex: { enabled: true, candidateCount: 25000 } } });\nassert.equal(state.workerReady, true);\nassert.equal(diagnostics, 1);\nassert.equal(controller.canUseWorker(), true);\n\nassert.equal(controller.requestFilter({ requestId: 7, request: { query: \"needle\" } }), true);\nassert.equal(posted.at(-1).type, \"filter\");\nworker.onmessage({ data: { type: \"filtered\", protocol: 1, token: session, version: 1, requestId: 7, searchMode: \"indexed\", candidateCount: 0, elapsedMs: 2.5, indexes: [], invalid: [] } });\nassert.equal(state.searchIndex.candidateCount, 0);\nassert.equal(state.lastEngine, \"worker indexed · 2.5 ms\");\nassert.deepEqual(filtered, { indexes: [], invalid: [], reset: false });\nassert.equal(records.at(-1).meta.candidates, 0);\n\nassert.equal(controller.requestCorrelation({ requestId: 8, correlations: { trace: \"abc\" }, origin: 0 }), true);\nassert.equal(posted.at(-1).type, \"correlate\");\nworker.onmessage({ data: { type: \"correlated\", protocol: 1, token: session, version: 1, requestId: 8, elapsedMs: 3, indexes: [1, 2] } });\nassert.deepEqual(Array.from(state.correlatedIndexes), [1, 2]);\nassert.equal(correlationsRendered, 1);\n\nassert.equal(controller.requestTrace({ requestId: 9, correlations: { trace: \"abc\" }, origin: 0 }), true);\nassert.equal(posted.at(-1).type, \"trace\");\nworker.onmessage({ data: { type: \"trace-related\", protocol: 1, token: session, version: 1, requestId: 9, elapsedMs: 4, indexes: [3] } });\nassert.deepEqual(Array.from(state.traceIndexes), [3]);\nassert.equal(traceRendered, 1);\n\nworker.onmessage({ data: { type: \"filtered\", protocol: 1, token: session, version: 1, requestId: 6, indexes: [1] } });\nassert.deepEqual(filtered, { indexes: [], invalid: [], reset: false });\n\ncontroller.disable(\"fallback\");\nassert.equal(terminated, 1);\nassert.equal(state.worker, null);\nassert.equal(state.workerToken, \"\");\nassert.equal(state.lastEngine, \"main\");\nassert.equal(notices.at(-1), \"fallback\");\nconsole.log(\"filter-worker-controller-smoke PASS\");\n");

let integration = read("tests/v27-worker-integration-smoke.mjs");
const oldSourceLine = integration.split("\n").find((line) => line.includes("const worker=fs.readFileSync") && !line.includes("filter-worker-controller"));
assert.ok(oldSourceLine, "legacy worker source line missing");
integration = integration.replace(oldSourceLine, "const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); const app=fs.readFileSync(path.join(root,'app.js'),'utf8'); const controller=fs.readFileSync(path.join(root,'src/app/filter-worker-controller.js'),'utf8'); const worker=fs.readFileSync(path.join(root,'filter-worker.js'),'utf8'); const changelog=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8');");
const oldAssertionLine = integration.split("\n").find((line) => line.includes("createWorkerSessionToken"));
assert.ok(oldAssertionLine, "legacy worker assertion line missing");
integration = integration.replace(oldAssertionLine, "for(const token of ['workerToken: \"\"','sd_session=','SignalDockFilterWorkerController.create']) assert.ok(app.includes(token),'missing app worker boundary token '+token); for(const token of ['PROTOCOL_VERSION = 1','ALLOWED_INBOUND_TYPES','protocol: 1','token: state.workerToken','message.token === state.workerToken']) assert.ok(controller.includes(token),'missing controller worker token '+token); assert.ok(!controller.includes('event.origin'),'worker controller must not use event.origin');");
write("tests/v27-worker-integration-smoke.mjs", integration);

let finalGate = read("tests/v27-final-gate.mjs");
finalGate = replaceOnce(
  finalGate,
  "const projectController = read('src/app/project-controller.js');\n",
  "const projectController = read('src/app/project-controller.js');\nconst filterWorkerController = read('src/app/filter-worker-controller.js');\n",
  "v27 final gate worker controller source"
);
finalGate = replaceOnce(
  finalGate,
  "for (const token of ['projectLinkFilesButton', 'SignalDockDesktopBridge.saveParts', 'createWorkerSessionToken', 'workerToken: \\\"\\\"']) assert.ok(app.includes(token), \`missing app token: \${token}\`);",
  "for (const token of ['projectLinkFilesButton', 'SignalDockDesktopBridge.saveParts', 'workerToken: \\\"\\\"', 'SignalDockFilterWorkerController.create', 'sd_session=']) assert.ok(app.includes(token), \`missing app token: \${token}\`);\nfor (const token of ['PROTOCOL_VERSION = 1', 'ALLOWED_INBOUND_TYPES', 'message.token === state.workerToken', 'protocol: 1']) assert.ok(filterWorkerController.includes(token), \`missing Filter Worker controller token: \${token}\`);\nassert.ok(!filterWorkerController.includes('event.origin'));",
  "v27 final gate worker ownership"
);
write("tests/v27-final-gate.mjs", finalGate);

write("VERSION", "2.8.24\n");
let readme = read("README.md").replaceAll("2.8.23", "2.8.24");
const readmeAnchor = "- feature-level Dataset Overview controller under \x60src/app/\x60 that owns summary metrics, source navigation and timeline rendering while filter/index ownership and domain analytics remain outside the UI renderer\n";
if (readme.includes(readmeAnchor)) readme = readme.replace(readmeAnchor, readmeAnchor + "- feature-level Filter Worker controller under \x60src/app/\x60 that owns protocol-v1 worker lifecycle and authenticated index/filter/correlation/trace routing while token generation and Worker construction remain root-injected\n");
write("README.md", readme);

let technical = read("docs/TECHNICAL.md").replace("Current version: **2.8.23**.", "Current version: **2.8.24**.");
const techAnchor = "\x60dataset-overview-controller.js\x60 owns dataset summary metrics, source sidebar/tab rendering, active-source presentation and the activity timeline. Filter/index state remains authoritative in the Dataset Filter controller; formatting is root-injected and the overview controller receives no parser, worker, storage, filesystem or network capability.\n";
technical = replaceOnce(technical, techAnchor, techAnchor + "\n\x60filter-worker-controller.js\x60 owns main-thread worker lifecycle, protocol-v1 authenticated envelope routing, index synchronization and filter/correlation/trace dispatch. Token generation and Worker construction stay root-injected; \x60filter-worker.js\x60 validation, allowlists and bounds remain unchanged.\n", "technical docs");
write("docs/TECHNICAL.md", technical);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout = replaceOnce(sourceLayout, "\x60workspace-controller.js\x60, \x60dataset-overview-controller.js\x60, \x60investigation-controller.js\x60", "\x60workspace-controller.js\x60, \x60dataset-overview-controller.js\x60, \x60filter-worker-controller.js\x60, \x60investigation-controller.js\x60", "layout docs");
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let srcReadme = read("src/README.md");
const srcAnchor = "\x60app/dataset-overview-controller.js\x60 owns dataset metrics, source navigation, active-source UI state and timeline rendering while filter/index state, formatting and all privileged capabilities remain outside the controller.\n";
srcReadme = replaceOnce(srcReadme, srcAnchor, srcAnchor + "\n\x60app/filter-worker-controller.js\x60 owns main-thread worker lifecycle plus authenticated index/filter/correlation/trace routing. Token generation and Worker construction remain root-injected, and the worker script remains authoritative for validation and bounds.\n", "src docs");
write("src/README.md", srcReadme);

let changelog = read("CHANGELOG.md");
const notes = [
  "## 2.8.24 — 2026-09-18", "",
  "### Filter Worker application boundary",
  "- Extracted main-thread worker lifecycle, protocol-v1 authenticated response routing, index synchronization and filter/correlation/trace dispatch into \x60src/app/filter-worker-controller.js\x60.",
  "- Preserved protocol v1, the session token, worker message allowlists, exact validation/bounds and local-file fallback; no \x60event.origin\x60 check was introduced.",
  "- Kept cryptographic token generation and Worker construction in root composition as explicit injected capabilities.",
  "- Fixed zero-candidate diagnostics so a valid \x60candidateCount: 0\x60 remains zero, normalized malformed worker index arrays, and added synchronous dispatch fallback to the main thread.",
  "", "### Verification",
  "- Added isolated worker-controller coverage for token/type rejection, ready/index/filter/correlation/trace routing, stale responses, zero candidates and teardown.",
  "- Migrated the legacy v2.7 worker integration ownership assertions without weakening protocol checks and left \x60filter-worker.js\x60 unchanged.",
  "", ""
].join("\n");
changelog = replaceOnce(changelog, "# Changelog\n\n", "# Changelog\n\n" + notes, "changelog");
write("CHANGELOG.md", changelog);

const controller = read("src/app/filter-worker-controller.js");
assert.ok(!controller.includes("event.origin"));
for (const token of ["const PROTOCOL_VERSION = 1", "ALLOWED_INBOUND_TYPES", "message.token === state.workerToken", "protocol: 1", "state.worker.postMessage(message)"]) assert.ok(controller.includes(token), "controller invariant missing: " + token);
for (const token of ["new Worker", "window.crypto", "indexedDB", "localStorage", "showOpenFilePicker", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("]) assert.ok(!controller.includes(token), "forbidden controller capability: " + token);

const finalApp = read("app.js");
assert.ok(finalApp.includes("window.crypto"));
assert.ok(finalApp.includes('new Worker("filter-worker.js?sd_session=" + encodeURIComponent(token))'));
assert.ok(!finalApp.includes("function createWorkerSessionToken()"));
assert.ok(!finalApp.includes("function onWorkerMessage("));
assert.ok(!finalApp.includes("state.worker.postMessage("));

const workerSource = read("filter-worker.js");
for (const token of ["WORKER_PROTOCOL_VERSION = 1", "SESSION_TOKEN_PATTERN", "ALLOWED_MESSAGE_TYPES", "validEnvelope", "MAX_RELATED_LIMIT"]) assert.ok(workerSource.includes(token), "worker invariant missing: " + token);
assert.ok(!workerSource.includes("event.origin === self.location.origin"));
console.log("SignalDock v2.8.24 migration prepared successfully.");
