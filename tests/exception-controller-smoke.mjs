import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/app/exception-controller.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");

const sandbox = {
  self: {
    SignalDockExceptionGroups: {
      summary: () => ({ groups: 0, occurrences: 0, errors: 0, fatal: 0 }),
      candidate: () => true,
      fingerprint: (entry) => entry?.fingerprint || ""
    }
  },
  console
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "exception-controller.js" });
const api = sandbox.self.SignalDockExceptionController;
assert.equal(api.VERSION, 1);
assert.equal(api.extractFingerprint("level:error fingerprint:EX-ABC service:api"), "ex-abc");
assert.equal(api.extractFingerprint("service:api exception:ex-123"), "ex-123");
assert.equal(api.extractFingerprint("level:error"), "");
assert.equal(api.composeFingerprintQuery("level:error fingerprint:old service:api", "EX-NEW"), "level:error service:api exception:ex-new");
assert.equal(api.composeFingerprintQuery("exception:a fingerprint:b service:web", "ex-c"), "service:web exception:ex-c");
assert.equal(api.composeFingerprintQuery(" service:web  ", ""), "service:web");

const doc = {};
const stable = { id: "stable-id", globalIndex: 9, fingerprint: "ex-stable" };
const indexed = { id: "indexed-id", globalIndex: 1, fingerprint: "ex-index" };
const fallback = { id: "fallback-id", globalIndex: 2, fingerprint: "ex-fallback" };
const state = {
  entries: [null, indexed, fallback, stable],
  exceptionGroups: [],
  exceptionTrends: null,
  exceptionViewFingerprint: ""
};
const noop = () => {};
const controller = api.create({
  state,
  el: { exceptionList: { ownerDocument: doc } },
  getUtils: () => ({ shortSource: String }),
  formatDuration: String,
  toast: noop,
  applyFilters: noop,
  selectEntry: noop,
  entryRowIntoView: noop,
  pinEvidence: noop,
  closeCompetingDialogs: noop,
  showDialogSafely: noop,
  setActiveNav: noop
});
assert.equal(controller.resolveSampleEntry({ fingerprint: "ex-stable", sampleIds: ["stable-id"], sampleIndexes: [1] }), stable, "stable sample ID must win over stale indexes");
assert.equal(controller.resolveSampleEntry({ fingerprint: "ex-index", sampleIds: ["missing"], sampleIndexes: [1] }), indexed, "sample index fallback should remain supported");
assert.equal(controller.resolveSampleEntry({ fingerprint: "ex-fallback", sampleIds: [], sampleIndexes: [] }), fallback, "fingerprint fallback should recover a representative entry");
assert.equal(controller.resolveSampleEntry({ fingerprint: "ex-missing", sampleIds: [], sampleIndexes: [] }), null);

for (const forbidden of ["fetch(", ".invoke(", "XMLHttpRequest", "WebSocket("]) {
  assert.ok(!source.includes(forbidden), `Exception controller must not introduce network/native escape hatch: ${forbidden}`);
}
assert.ok(index.includes('src/app/exception-controller.js'), "Exception controller must load from index.html");
assert.ok(ci.includes('src/app/exception-controller.js'), "CI must HTTP-smoke the Exception controller");
assert.ok(app.includes("SignalDockExceptionController.create"), "app.js must create the Exception controller");
assert.ok(app.includes("exceptionController.bind()"), "app.js must bind the Exception controller");
assert.ok(app.includes("exceptions: () => exceptionController?.open()"), "navigation must route through the Exception controller");
for (const legacy of ["function openExceptions()", "function renderExceptions()", "function onExceptionClick("]) {
  assert.ok(!app.includes(legacy), `legacy Exception orchestration must leave app.js: ${legacy}`);
}
console.log("exception-controller-smoke PASS");
