import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const controllerSource = read("src/app/recovery-diagnostics-controller.js");

assert.ok(html.includes('src/app/recovery-diagnostics-controller.js'), "recovery/diagnostics controller missing from index.html");
assert.ok(html.indexOf('src/app/recovery-diagnostics-controller.js') < html.indexOf('app.js'), "recovery/diagnostics controller must load before app.js");
assert.ok(app.includes("SignalDockRecoveryDiagnosticsController.create"), "controller factory wiring missing from app.js");
assert.ok(app.includes("recoveryDiagnosticsController.bind();"), "controller bind() is not invoked");
for (const token of ["recoveryRestoreButton.addEventListener", "recoveryDismissButton.addEventListener", "clearRecoveryButton.addEventListener", "clearSearchCacheButton?.addEventListener", "copyDiagnosticsButton?.addEventListener"]) {
  assert.ok(!app.includes(token), "root still owns recovery/diagnostics listener: " + token);
}
for (const token of ["markDatasetForAutosave", "autosaveDataset", "autosaveView", "checkRecoverySnapshot", "updateDiagnostics", "copyDiagnostics", "formatMetricMs", "function bind()", "function destroy()"]) {
  assert.ok(controllerSource.includes(token), "controller missing expected ownership token: " + token);
}
for (const token of ["SignalDockPersistence", "SignalDockSearchCache", "indexedDB", "showOpenFilePicker", "SignalDockDesktopBridge", "XMLHttpRequest", "WebSocket", ".invoke("]) {
  assert.ok(!controllerSource.includes(token), "forbidden capability reference in controller: " + token);
}
assert.ok(!/\bfetch\s*\(/.test(controllerSource), "controller must not use fetch()");
assert.ok(!/\bEventSource\b/.test(controllerSource), "controller must not use EventSource");

class FakeNode {
  constructor(document) { this.ownerDocument = document; this.hidden = true; this.textContent = ""; this.children = []; this.listeners = new Map(); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
}
const document = { createElement: () => new FakeNode(document), defaultView: null };
const make = () => new FakeNode(document);
const rootGlobal = { setTimeout, clearTimeout };
const context = { self: rootGlobal, window: rootGlobal, console, Date, Promise, setTimeout, clearTimeout };
vm.runInNewContext(controllerSource, context, { filename: "recovery-diagnostics-controller.js" });
const state = {
  entries: [], filteredIndexes: [], settings: { autosave: true }, recovery: {}, searchIndex: { cacheHit: true, cacheSegments: 4, cacheEligible: true, enabled: false, mode: "linear" },
  renderMode: "paged", pageSize: 100, virtual: { start: 0, end: 0, compressed: false }, lastEngine: "main", exceptionGroups: [], caseFile: { status: "open", severity: "none", findings: [] }, investigation: { items: [] }, summary: { sources: [], services: [] }, loadedBytes: 0
};
const el = { recoveryBanner: make(), recoveryMeta: make(), recoveryRestoreButton: make(), recoveryDismissButton: make(), clearRecoveryButton: make(), clearSearchCacheButton: make(), autosaveStatus: make(), diagnosticsGrid: make(), copyDiagnosticsButton: make() };
let cacheClears = 0;
const controller = rootGlobal.SignalDockRecoveryDiagnosticsController.create({
  state, el, appVersion: "2.8.17", ownerDocument: document,
  getWorkspaceState: () => ({}), getViewState: () => ({}), getRecoveryAvailability: () => true,
  getAutosaveEligibility: () => ({ allowed: true, estimatedBytes: 128 }), saveRecoveryDataset: async () => ({ allowed: true }), saveRecoveryView: async () => {},
  getRecoveryInfo: async () => ({ entryCount: 2, byteSize: 128, chunkCount: 1, savedAt: "2026-09-17T12:00:00.000Z" }), loadRecovery: async () => null, clearRecovery: async () => {},
  clearSearchCache: async () => { cacheClears += 1; return { available: true }; }, restoreWorkspacePayload: async () => {}, setProcessing: () => {}, toast: () => {},
  getPerformanceSnapshot: () => ({ metrics: {}, longTasks: 0, longestTaskMs: 0 }), copyText: async () => {}, formatBytes: (value) => String(value) + " B", canUseVirtualTable: () => false,
  getCapabilitySnapshot: () => ({ indexedDB: true, fileSystemAccess: false, performanceMemory: false })
});
controller.bind();
controller.bind();
assert.equal(el.recoveryRestoreButton.listeners.size, 1, "bind() must be idempotent");
controller.updateAutosaveStatus();
assert.equal(el.autosaveStatus.textContent, "Autosave ready · no logs loaded.");
state.settings.autosave = false;
controller.updateAutosaveStatus();
assert.equal(el.autosaveStatus.textContent, "Autosave disabled.");
state.settings.autosave = true;
await controller.checkRecoverySnapshot();
assert.equal(state.recovery.available, true);
assert.equal(el.recoveryBanner.hidden, false);
controller.dismissRecoverySnapshot();
assert.equal(state.recovery.dismissed, true);
assert.equal(el.recoveryBanner.hidden, true);
await controller.clearSearchCache();
assert.equal(cacheClears, 1);
assert.equal(state.searchIndex.cacheHit, false);
assert.equal(state.searchIndex.cacheSegments, 0);
controller.updateDiagnostics();
assert.ok(el.diagnosticsGrid.children.length >= 14, "diagnostics should render without a memory API");
controller.destroy();
assert.equal(el.recoveryRestoreButton.listeners.size, 0, "destroy() must remove tracked listeners");
console.log("recovery-diagnostics-controller-smoke PASS");
