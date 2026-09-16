import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controllerPath = path.join(rootDir, "src/app/service-map-controller.js");
const source = fs.readFileSync(controllerPath, "utf8");
const app = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");

assert.ok(html.includes('src/app/service-map-controller.js'), "Service Map controller must load from index.html");
assert.ok(app.includes("SignalDockServiceMapController.create"), "app must initialize Service Map controller");
assert.ok(app.includes("serviceMapController.bind()"), "app must bind Service Map controller");
assert.ok(app.includes("map: () => serviceMapController?.open()"), "map navigation must route through controller");
for (const legacy of ["function openServiceMap()", "function closeServiceMap()", "function renderServiceMap(", "el.serviceMapResetButton?.addEventListener", "el.serviceMapCanvas?.addEventListener"]) {
  assert.ok(!app.includes(legacy), `legacy Service Map ownership remains in app.js: ${legacy}`);
}
for (const token of ["normalizeGroupBy", "No log entries match the current filters", "aria-label", "scopeFiltered", "recordPerformance", "bind", "destroy"]) {
  assert.ok(source.includes(token), `controller missing expected token: ${token}`);
}
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.ok(!source.includes(forbidden), `Service Map controller must remain local-only: ${forbidden}`);
}

function node() {
  return {
    children: [], dataset: {}, attributes: {}, open: false, value: "service",
    replaceChildren(...items) { this.children = [...items]; },
    appendChild(item) { this.children.push(item); return item; },
    append(...items) { this.children.push(...items); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener() {}, removeEventListener() {},
    closest() { return null; }
  };
}
const document = { createElement: () => node(), createElementNS: () => node() };
const buildCalls = [];
const sandbox = {
  self: {
    performance: { now: () => 10 },
    SignalDockServiceMap: {
      GROUP_MODES: ["service", "environment", "namespace", "environment-service", "namespace-service"],
      build(entries, indexes, options) {
        buildCalls.push({ entries, indexes, options });
        return { groupBy: options.groupBy, nodes: [], edges: [], stats: { services: 0, groups: 0, visibleServices: 0, hiddenServices: 0, edges: 0, traces: 0, entries: indexes === null ? entries.length : indexes.length } };
      },
      layout() { return { nodes: [], edges: [], width: 920, height: 500 }; }
    }
  },
  console
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: controllerPath });
const api = sandbox.self.SignalDockServiceMapController;
assert.equal(api.VERSION, 1);
assert.equal(api.normalizeGroupBy("environment-service"), "environment-service");
assert.equal(api.normalizeGroupBy("invalid"), "service");

const state = { entries: [{ service: "api" }, { service: "db" }], filteredIndexes: [], serviceMapGroupBy: "service", serviceGraph: null };
const body = node(); body.ownerDocument = document;
const el = {
  serviceMapCanvas: body,
  serviceMapSummary: node(),
  serviceMapList: node(),
  serviceMapMeta: node(),
  serviceMapDialog: node(),
  serviceMapGroupBy: node(),
  closeServiceMapButton: node(),
  serviceMapResetButton: node()
};
el.serviceMapSummary.ownerDocument = document;
el.serviceMapList.ownerDocument = document;
const controller = api.create({ state, el });
controller.render(true);
assert.ok(Array.isArray(buildCalls.at(-1).indexes), "filtered scope must pass an explicit index list");
assert.equal(buildCalls.at(-1).indexes.length, 0, "zero-result filtered scope must remain empty");
controller.render(false);
assert.equal(buildCalls.at(-1).indexes, null, "all-log scope must use null indexes");
console.log("service-map-controller-smoke PASS");
