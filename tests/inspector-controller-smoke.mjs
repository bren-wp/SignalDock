import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const source = fs.readFileSync(path.join(root, "src/app/inspector-controller.js"), "utf8");

assert.ok(html.includes('src/app/inspector-controller.js'), "Inspector controller must be loaded by index.html");
assert.ok(app.includes("SignalDockInspectorController.create"), "app must initialize Inspector controller");
assert.ok(app.includes("inspectorController.bind()"), "app must bind Inspector controller");
assert.ok(!app.includes("function metaPill("), "Inspector rendering implementation must leave app.js");
assert.ok(!app.includes("function onInspectorTabKeydown("), "Inspector tab event ownership must leave app.js");
assert.ok(!app.includes("SPAN FLAME"), "Trace Inspector rendering must leave app.js");
for (const token of ["selectedEntry", "renderCorrelations", "renderTrace", "TRACE QUALITY", "SPAN FLAME", "OTEL RESOURCE & SCOPE", "bind", "destroy"]) {
  assert.ok(source.includes(token), `missing Inspector controller token: ${token}`);
}
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.ok(!source.includes(forbidden), `Inspector controller must not use ${forbidden}`);
}

const documentStub = { querySelectorAll: () => [] };
const scope = { document: documentStub, console };
scope.self = scope;
scope.window = scope;
vm.createContext(scope);
vm.runInContext(source, scope, { filename: "inspector-controller.js" });
const api = scope.SignalDockInspectorController;
assert.ok(api && typeof api.create === "function");
assert.deepEqual(Array.from(api.INSPECTOR_TABS), ["details", "context", "correlations", "trace", "raw", "json"]);

const state = {
  entries: [{ id: "sd-0", globalIndex: 0, index: 0, level: "INFO", service: "api", source: "sample.log", message: "ready", timestamp: "", correlations: {}, traceMeta: {}, dimensions: {}, raw: {} }],
  selectedId: "sd-0",
  inspectorTab: "details",
  correlatedIndexes: [],
  correlationEngine: "idle",
  traceIndexes: [],
  traceEngine: "idle",
  investigation: { items: [] }
};
const controller = api.create({ state, el: {}, getUtils: () => ({ safeStringify: JSON.stringify, shortSource: (value) => value, formatTime: (value) => value || "—", copyText: async () => {} }) });
assert.equal(controller.selectedEntry()?.id, "sd-0");
assert.equal(controller.formatDuration(null), "—");
assert.equal(controller.formatDuration(undefined), "—");
assert.equal(controller.formatDuration(""), "—");
assert.equal(controller.formatDuration(0), "0 µs");
assert.equal(controller.formatDuration(0.5), "500 µs");
assert.equal(controller.formatDuration(12), "12.0 ms");
controller.bind();
controller.bind();
controller.destroy();
controller.destroy();

console.log("inspector-controller-smoke PASS");
