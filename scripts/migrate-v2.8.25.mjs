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

assert.equal(read("VERSION").trim(), "2.8.24");
let app = read("app.js");
app = replaceOnce(app, '  const APP_VERSION = "2.8.24";', '  const APP_VERSION = "2.8.25";', "version");
app = replaceOnce(app, "  let filterWorkerController = null;\n", "  let filterWorkerController = null;\n  let relatedContextController = null;\n", "controller slot");

const workerCreateEnd = '      toast\n    });\n    state.investigation = window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] };';
const relatedWiring = [
  '      toast',
  '    });',
  '    if (!window.SignalDockRelatedContextController?.create) throw new Error("SignalDock Related Context controller is unavailable.");',
  '    relatedContextController = window.SignalDockRelatedContextController.create({',
  '      state,',
  '      relatedIndexes: (entries, correlations, limit, origin) => engine().relatedIndexes(entries, correlations, limit, origin),',
  '      canUseWorker: () => filterWorkerController?.canUseWorker() || false,',
  '      requestCorrelation: (payload) => filterWorkerController?.requestCorrelation(payload) ?? false,',
  '      requestTrace: (payload) => filterWorkerController?.requestTrace(payload) ?? false,',
  '      renderCorrelations: (entry) => inspectorController?.renderCorrelations(entry),',
  '      renderTrace: (entry) => inspectorController?.renderTrace(entry),',
  '      now: () => performance.now(),',
  '      recordPerformance: (name, elapsed, meta) => profiler()?.record?.(name, elapsed, meta)',
  '    });',
  '    state.investigation = window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] };'
].join("\n");
app = replaceOnce(app, workerCreateEnd, relatedWiring, "related context wiring");

const start = app.indexOf("  function loadCorrelations(entry) {");
const end = app.indexOf("  function formatDuration(value) {", start);
assert.ok(start >= 0 && end > start, "related context implementation block missing");
const delegates = [
  "  function loadCorrelations(entry) { return relatedContextController?.loadCorrelations(entry); }",
  "",
  "  function renderCorrelationsPane(entry) { inspectorController?.renderCorrelations(entry); }",
  "",
  "  function loadTrace(entry) { return relatedContextController?.loadTrace(entry); }",
  "",
  "  function renderTracePane(entry) { inspectorController?.renderTrace(entry); }",
  "",
  ""
].join("\n");
app = app.slice(0, start) + delegates + app.slice(end);
write("app.js", app);

let html = read("index.html");
html = replaceOnce(html, '  <script src="src/app/filter-worker-controller.js" defer></script>\n', '  <script src="src/app/filter-worker-controller.js" defer></script>\n  <script src="src/app/related-context-controller.js" defer></script>\n', "script order");
write("index.html", html);

let layout = read("tests/source-layout-smoke.mjs");
layout = replaceOnce(layout, '  "src/app/filter-worker-controller.js",\n', '  "src/app/filter-worker-controller.js",\n  "src/app/related-context-controller.js",\n', "source layout");
write("tests/source-layout-smoke.mjs", layout);
write("tests/related-context-controller-smoke.mjs", "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst source = read(\"src/app/related-context-controller.js\");\n\nassert.ok(html.includes(\"src/app/related-context-controller.js\"));\nassert.ok(html.indexOf(\"src/app/related-context-controller.js\") < html.indexOf(\"app.js\"));\nassert.ok(app.includes(\"SignalDockRelatedContextController.create\"));\nassert.ok(app.includes(\"relatedContextController.loadCorrelations\"));\nassert.ok(app.includes(\"relatedContextController.loadTrace\"));\nassert.ok(!app.includes(\"engine().relatedIndexes(state.filterEntries, correlations, 200\"));\nassert.ok(!app.includes(\"engine().relatedIndexes(state.filterEntries, correlations, 1000\"));\n\nfor (const token of [\"SignalDockQueryEngine\", \"SignalDockFilterWorkerController\", \"new Worker\", \".postMessage(\", \"indexedDB\", \"localStorage\", \"showOpenFilePicker\", \"XMLHttpRequest\", \"WebSocket\", \"EventSource\", \".invoke(\"]) {\n  assert.ok(!source.includes(token), \"forbidden Related Context capability: \" + token);\n}\nassert.ok(!/\\bfetch\\s*\\(/.test(source));\n\nconst state = {\n  filterEntries: [{ correlations: { trace: \"t1\" } }, { correlations: {} }],\n  correlationRequestId: 0,\n  traceRequestId: 0,\n  correlatedIndexes: [],\n  traceIndexes: [],\n  correlationEngine: \"idle\",\n  traceEngine: \"idle\"\n};\nlet worker = true;\nlet correlationDispatches = [];\nlet traceDispatches = [];\nlet correlationRenders = 0;\nlet traceRenders = 0;\nlet relatedCalls = [];\nlet nowValue = 10;\nconst performanceRecords = [];\nconst host = {};\n\nvm.runInNewContext(source, { self: host, window: host, console, Object, Array, Math }, { filename: \"related-context-controller.js\" });\nconst controller = host.SignalDockRelatedContextController.create({\n  state,\n  relatedIndexes: (entries, correlations, limit, origin) => {\n    relatedCalls.push({ entries, correlations, limit, origin });\n    return limit === 200 ? [0] : [0, 1];\n  },\n  canUseWorker: () => worker,\n  requestCorrelation: (payload) => { correlationDispatches.push(payload); return true; },\n  requestTrace: (payload) => { traceDispatches.push(payload); return true; },\n  renderCorrelations: () => { correlationRenders += 1; },\n  renderTrace: () => { traceRenders += 1; },\n  now: () => { nowValue += 1.25; return nowValue; },\n  recordPerformance: (name, elapsed, meta) => { performanceRecords.push({ name, elapsed, meta }); }\n});\n\nconst entryA = { globalIndex: 0, correlations: { trace: \"trace-a\", job: \"job-a\" } };\nconst entryEmpty = { globalIndex: 1, correlations: {} };\n\nconst workerCorrelation = controller.loadCorrelations(entryA);\nassert.equal(workerCorrelation.mode, \"worker\");\nassert.equal(state.correlationRequestId, 1);\nassert.equal(correlationDispatches[0].requestId, 1);\nassert.equal(correlationDispatches[0].limit, 200);\nassert.equal(state.correlationEngine, \"worker · searching\");\n\nconst emptyCorrelation = controller.loadCorrelations(entryEmpty);\nassert.equal(emptyCorrelation.mode, \"none\");\nassert.equal(state.correlationRequestId, 2, \"empty entry must invalidate prior correlation request\");\nassert.deepEqual(Array.from(state.correlatedIndexes), []);\nassert.equal(state.correlationEngine, \"none\");\nassert.notEqual(correlationDispatches[0].requestId, state.correlationRequestId, \"previous worker response must now be stale\");\n\nconst workerTrace = controller.loadTrace(entryA);\nassert.equal(workerTrace.mode, \"worker\");\nassert.equal(state.traceRequestId, 1);\nassert.equal(traceDispatches[0].requestId, 1);\nassert.equal(traceDispatches[0].limit, 1000);\nassert.equal(state.traceEngine, \"worker · searching\");\n\nconst emptyTrace = controller.loadTrace(entryEmpty);\nassert.equal(emptyTrace.mode, \"none\");\nassert.equal(state.traceRequestId, 2, \"no-trace entry must invalidate prior trace request\");\nassert.deepEqual(Array.from(state.traceIndexes), []);\nassert.equal(state.traceEngine, \"none\");\nassert.notEqual(traceDispatches[0].requestId, state.traceRequestId, \"previous trace worker response must now be stale\");\n\nworker = false;\nconst mainCorrelation = controller.loadCorrelations(entryA);\nassert.equal(mainCorrelation.mode, \"main\");\nassert.equal(state.correlationRequestId, 3);\nassert.deepEqual(Array.from(state.correlatedIndexes), [0]);\nassert.equal(relatedCalls.at(-1).limit, 200);\nassert.equal(performanceRecords.at(-1).name, \"correlation\");\n\nconst mainTrace = controller.loadTrace(entryA);\nassert.equal(mainTrace.mode, \"main\");\nassert.equal(state.traceRequestId, 3);\nassert.deepEqual(Array.from(state.traceIndexes), [0, 1]);\nassert.equal(relatedCalls.at(-1).limit, 1000);\nassert.equal(performanceRecords.at(-1).name, \"trace\");\n\nworker = true;\nconst fallbackController = host.SignalDockRelatedContextController.create({\n  state,\n  relatedIndexes: (entries, correlations, limit) => limit === 200 ? [9] : [8],\n  canUseWorker: () => true,\n  requestCorrelation: () => false,\n  requestTrace: () => false,\n  renderCorrelations: () => {},\n  renderTrace: () => {},\n  now: () => { nowValue += 1; return nowValue; },\n  recordPerformance: () => {}\n});\nassert.equal(fallbackController.loadCorrelations(entryA).mode, \"main\", \"failed worker correlation dispatch must fall back\");\nassert.equal(fallbackController.loadTrace(entryA).mode, \"main\", \"failed worker trace dispatch must fall back\");\n\nassert.ok(correlationRenders >= 3);\nassert.ok(traceRenders >= 3);\nconsole.log(\"related-context-controller-smoke PASS\");\n");

write("VERSION", "2.8.25\n");

let readme = read("README.md").replaceAll("2.8.24", "2.8.25");
const readmeAnchor = "- feature-level Filter Worker controller under \x60src/app/\x60 that owns protocol-v1 worker lifecycle and authenticated index/filter/correlation/trace routing while token generation and Worker construction remain root-injected\n";
if (readme.includes(readmeAnchor)) {
  readme = readme.replace(readmeAnchor, readmeAnchor + "- feature-level Related Context controller under \x60src/app/\x60 that owns correlation/trace request orchestration and main-thread fallback while Query Engine, Inspector rendering and worker dispatch remain injected boundaries\n");
}
write("README.md", readme);

let technical = read("docs/TECHNICAL.md").replace("Current version: **2.8.24**.", "Current version: **2.8.25**.");
const techAnchor = "\x60filter-worker-controller.js\x60 owns main-thread worker lifecycle, protocol-v1 authenticated envelope routing, index synchronization and filter/correlation/trace dispatch. Token generation and Worker construction stay root-injected; \x60filter-worker.js\x60 validation, allowlists and bounds remain unchanged.\n";
technical = replaceOnce(
  technical,
  techAnchor,
  techAnchor + "\n\x60related-context-controller.js\x60 owns correlation and trace request IDs, worker/main-thread routing and Query Engine fallback orchestration for the Inspector. Query Engine execution, Filter Worker dispatch, Inspector rendering and performance recording are injected callbacks. Every load increments its request ID, including empty correlation/trace cases, so delayed worker responses cannot overwrite a newly selected entry.\n",
  "technical docs"
);
write("docs/TECHNICAL.md", technical);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout = replaceOnce(
  sourceLayout,
  "\x60dataset-overview-controller.js\x60, \x60filter-worker-controller.js\x60, \x60investigation-controller.js\x60",
  "\x60dataset-overview-controller.js\x60, \x60filter-worker-controller.js\x60, \x60related-context-controller.js\x60, \x60investigation-controller.js\x60",
  "source layout docs"
);
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let srcReadme = read("src/README.md");
const srcAnchor = "\x60app/filter-worker-controller.js\x60 owns main-thread worker lifecycle plus authenticated index/filter/correlation/trace routing. Token generation and Worker construction remain root-injected, and the worker script remains authoritative for validation and bounds.\n";
srcReadme = replaceOnce(
  srcReadme,
  srcAnchor,
  srcAnchor + "\n\x60app/related-context-controller.js\x60 owns correlation/trace request sequencing and worker-to-main fallback orchestration while Query Engine execution, worker dispatch, Inspector rendering and profiling remain injected callbacks.\n",
  "src docs"
);
write("src/README.md", srcReadme);

let changelog = read("CHANGELOG.md");
const notes = [
  "## 2.8.25 — 2026-09-18", "",
  "### Related Context application boundary",
  "- Extracted correlation and trace request sequencing, worker/main-thread routing and Query Engine fallback orchestration into \x60src/app/related-context-controller.js\x60.",
  "- Kept Query Engine execution, Filter Worker dispatch, Inspector rendering and performance recording behind explicit injected callbacks.",
  "- Fixed an Inspector race: selecting an entry with no correlations or trace now still advances the relevant request ID, making any delayed response from the previously selected entry stale.",
  "- Preserved worker limits of 200 related correlation entries and 1000 trace-related entries and preserved synchronous main-thread fallback when worker dispatch fails.",
  "", "### Verification",
  "- Added isolated coverage for worker dispatch, main-thread fallback, empty-context handling, request-ID invalidation and failed-dispatch fallback.",
  "- Added permanent source-layout and HTTP asset gates for the new controller without changing \x60filter-worker.js\x60 or its protocol.",
  "", ""
].join("\n");
changelog = replaceOnce(changelog, "# Changelog\n\n", "# Changelog\n\n" + notes, "changelog");
write("CHANGELOG.md", changelog);

const controller = read("src/app/related-context-controller.js");
for (const token of ["SignalDockQueryEngine", "SignalDockFilterWorkerController", "new Worker", ".postMessage(", "indexedDB", "localStorage", "showOpenFilePicker", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("]) {
  assert.ok(!controller.includes(token), "forbidden Related Context capability: " + token);
}
assert.ok(!/\bfetch\s*\(/.test(controller));
const finalApp = read("app.js");
assert.ok(finalApp.includes("relatedContextController.loadCorrelations"));
assert.ok(finalApp.includes("relatedContextController.loadTrace"));
assert.ok(!finalApp.includes("engine().relatedIndexes(state.filterEntries, correlations, 200"));
assert.ok(!finalApp.includes("engine().relatedIndexes(state.filterEntries, correlations, 1000"));
assert.ok(read("index.html").indexOf("src/app/related-context-controller.js") < read("index.html").indexOf("app.js"));
console.log("SignalDock v2.8.25 migration prepared successfully.");
