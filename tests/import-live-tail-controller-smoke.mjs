import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const controllerSource = read("src/app/import-live-tail-controller.js");

assert.ok(html.includes('src/app/import-live-tail-controller.js'), "Import/Live Tail controller missing from index.html");
assert.ok(html.indexOf('src/app/import-live-tail-controller.js') < html.indexOf('app.js'), "Import/Live Tail controller must load before app.js");
assert.ok(app.includes("SignalDockImportLiveTailController.create"), "Import/Live Tail controller factory wiring missing");
assert.ok(app.includes("importLiveTailController.bind();"), "Import/Live Tail controller bind() missing");
for (const token of [
  'el.importButton.addEventListener("click"',
  'el.fileInput.addEventListener("change"',
  'document.addEventListener("dragenter"',
  'document.addEventListener("dragover"',
  'document.addEventListener("dragleave"',
  'document.addEventListener("drop"'
]) assert.ok(!app.includes(token), `root still owns import/drag listener: ${token}`);

for (const token of ["handleFiles", "appendParsedEntries", "startLiveTail", "stopLiveTail", "pollLiveTail", "projectDatasetId", "function bind()", "function destroy()"]) {
  assert.ok(controllerSource.includes(token), `controller missing expected ownership token: ${token}`);
}
for (const token of [
  "SignalDockParser", "showOpenFilePicker", ".getFile(", "SignalDockProjectManager",
  "SignalDockPersistence", "SignalDockStorageAdapter", "indexedDB", "localStorage",
  "sessionStorage", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("
]) {
  assert.ok(!controllerSource.includes(token), `forbidden capability reference in Import/Live Tail controller: ${token}`);
}
assert.ok(!/\bfetch\s*\(/.test(controllerSource), "Import/Live Tail controller must not use fetch()");

class FakeNode {
  constructor(document) {
    this.ownerDocument = document;
    this.value = "";
    this.hidden = true;
    this.textContent = "";
    this.listeners = new Map();
    this.children = [];
    this.dataset = {};
    this.classState = new Map();
    this.classList = { toggle: (name, value) => this.classState.set(name, Boolean(value)) };
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  querySelector(selector) { return selector === "span" ? this.children[0] || null : null; }
  click() { this.clicked = (this.clicked || 0) + 1; }
}
const document = new FakeNode(null);
document.ownerDocument = document;
const liveButton = new FakeNode(document);
const liveLabel = new FakeNode(document);
liveButton.children = [liveLabel];
document.querySelector = (selector) => selector === '[data-nav="live"]' ? liveButton : null;

let timerId = 0;
const rootGlobal = {
  document,
  setTimeout: () => ++timerId,
  clearTimeout: () => {}
};
const context = { self: rootGlobal, window: rootGlobal, console, setTimeout: rootGlobal.setTimeout, clearTimeout: rootGlobal.clearTimeout };
vm.runInNewContext(controllerSource, context, { filename: "import-live-tail-controller.js" });

const el = {
  importButton: new FakeNode(document),
  fileInput: new FakeNode(document),
  dragOverlay: new FakeNode(document),
  baselineChangeCount: new FakeNode(document)
};
const state = {
  entries: [],
  loadedBytes: 0,
  inputFileCount: 0,
  baselineComparison: { old: true },
  settings: { parserProfile: "auto" },
  tail: { active: false, handle: null, offset: 0, timer: null, carry: "", source: "" }
};

let rebuilds = 0;
let refreshes = 0;
let syncs = 0;
let filters = 0;
let autosaves = 0;
let controls = 0;
let touched = 0;
let processingEnds = 0;
let parseTextCalls = 0;
const imported = { name: "api.log", size: 100, lastModified: 1 };
const tailFile = { name: "tail.log", size: 5, lastModified: 2 };
const controller = rootGlobal.SignalDockImportLiveTailController.create({
  state,
  el,
  ownerDocument: document,
  parseFile: async (file, progress) => { progress(1); return [{ message: file.name }]; },
  parseText: async () => { parseTextCalls += 1; return [{ message: "tail" }]; },
  restoreWorkspaceFile: async () => {},
  startParseProfile: () => () => {},
  touchProjectDatasets: (files) => { touched += files.length; },
  setProcessing: (active) => { if (!active) processingEnds += 1; },
  nextFrame: async () => {},
  toast: () => {},
  rebuildFilterIndex: () => { rebuilds += 1; },
  refreshFilters: () => { refreshes += 1; },
  setControlsEnabled: () => { controls += 1; },
  syncWorkerIndex: () => { syncs += 1; },
  applyFilters: () => { filters += 1; },
  markDatasetForAutosave: () => { autosaves += 1; },
  renderEverything: () => {},
  canUseLiveTail: () => true,
  pickLiveTailFile: async () => ({ handle: { id: "tail-handle" }, file: tailFile }),
  readLiveTailDelta: async () => ({ name: "tail.log", size: 12, start: 5, text: "next\n", truncated: false })
});

controller.bind();
controller.bind();
assert.equal(el.importButton.listeners.get("click").size, 1, "bind() must be idempotent");
assert.equal(document.listeners.get("dragenter").size, 1, "drag listeners must be singular");

const result = await controller.handleFiles([imported]);
assert.equal(result.added, 1);
assert.equal(result.failed, 0);
assert.equal(state.entries.length, 1);
assert.equal(state.entries[0].id, "sd-0");
assert.equal(state.entries[0].globalIndex, 0);
assert.equal(state.loadedBytes, 100);
assert.equal(state.inputFileCount, 1);
assert.equal(state.baselineComparison, null);
assert.equal(touched, 1);
assert.equal(rebuilds, 1);
assert.equal(refreshes, 1);
assert.equal(syncs, 1);
assert.equal(filters, 1);
assert.equal(autosaves, 1);
assert.equal(controls, 1);
assert.equal(processingEnds, 1);

await controller.startLiveTail();
assert.equal(state.tail.active, true);
assert.equal(state.tail.source, "tail.log");
assert.equal(state.entries.length, 2);
assert.equal(liveButton.classState.get("is-live"), true);
assert.equal(liveLabel.textContent, "Stop live tail");
assert.ok(state.tail.timer);

await controller.pollLiveTail();
assert.equal(parseTextCalls, 1);
assert.equal(state.entries.length, 3);
assert.equal(state.entries[2].id, "sd-2");
assert.equal(state.loadedBytes, 112);

controller.stopLiveTail();
assert.equal(state.tail.active, false);
assert.equal(liveButton.classState.get("is-live"), false);
assert.equal(liveLabel.textContent, "Live tail");

controller.destroy();
assert.equal(el.importButton.listeners.get("click").size, 0, "destroy() must remove import listener");
assert.equal(document.listeners.get("dragenter").size, 0, "destroy() must remove drag listener");
console.log("import-live-tail-controller-smoke PASS");
