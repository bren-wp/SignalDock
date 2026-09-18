import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const controllerSource = read("src/app/workspace-controller.js");

assert.ok(html.includes('src/app/workspace-controller.js'), "Workspace controller missing from index.html");
assert.ok(html.indexOf('src/app/workspace-controller.js') < html.indexOf('app.js'), "Workspace controller must load before app.js");
assert.ok(app.includes("SignalDockWorkspaceController.create"), "Workspace controller factory wiring missing");
assert.ok(app.includes("workspaceController.bind();"), "Workspace controller bind missing");

for (const token of [
  'el.workspaceSaveButton.addEventListener("click", saveWorkspace)',
  'event.shiftKey && event.key.toLowerCase() === "s"'
]) assert.ok(!app.includes(token), `root still owns workspace UI listener: ${token}`);

for (const token of [
  "SignalDockWorkspace.",
  "SignalDockDesktopBridge",
  "SignalDockProjectManager",
  "SignalDockPersistence",
  "SignalDockStorageAdapter",
  "showOpenFilePicker",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "handleRef",
  "handleKind",
  "reopenable",
  ".text(",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  ".invoke("
]) assert.ok(!controllerSource.includes(token), `forbidden Workspace controller capability reference: ${token}`);
assert.ok(!/\bfetch\s*\(/.test(controllerSource), "Workspace controller must not use fetch()");

for (const token of [
  "SignalDockWorkspace.serializeParts",
  "SignalDockWorkspace.parse",
  "SignalDockDesktopBridge.saveParts",
  "SignalDockProjectManager.touchWorkspace",
  "file.text()"
]) assert.ok(app.includes(token), `workspace capability must remain root-owned: ${token}`);

class FakeNode {
  constructor(document) {
    this.ownerDocument = document;
    this.value = "";
    this.title = "";
    this.disabled = false;
    this.options = [];
    this.listeners = new Map();
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
}
const document = new FakeNode(null);
document.ownerDocument = document;
const make = () => new FakeNode(document);
const select = (pairs, value = "") => {
  const node = make();
  node.options = pairs.map(([optionValue, textContent]) => ({ value: optionValue, textContent }));
  node.value = value;
  return node;
};

const rootGlobal = { document };
vm.runInNewContext(controllerSource, { self: rootGlobal, window: rootGlobal, console, Set }, { filename: "workspace-controller.js" });

const el = {
  workspaceSaveButton: make(),
  queryInput: make(),
  levelFilter: select([["", "All"], ["ERROR", "Error"]], "ERROR"),
  sourceFilter: select([["", "All"], ["api.log", "api.log"]], "api.log"),
  timeFilter: select([["", "All"], ["15m", "15m"]], "15m"),
  sortFilter: select([["original", "Original"], ["newest", "Newest"]], "newest"),
  pageSize: select([["100", "100"], ["250", "250"]], "250"),
  renderMode: select([["paged", "Paged"], ["virtual", "Virtual"]], "virtual"),
  serviceMapGroupBy: select([["service", "Service"], ["namespace", "Namespace"]], "namespace"),
  loadedMeta: make()
};
el.queryInput.value = "timeout";

const state = {
  entries: [{ id: "sd-0", globalIndex: 0 }],
  filterEntries: [{}],
  filteredIndexes: [0],
  loadedBytes: 10,
  inputFileCount: 1,
  settings: { wrap: false },
  investigation: { title: "Incident" },
  caseFile: { title: "Incident", status: "open" },
  caseCheckpoints: [{ id: "cp-1" }],
  baselineSnapshot: { id: "base-1" },
  activeProjectId: "project-1",
  pageSize: 250,
  renderMode: "virtual",
  serviceMapGroupBy: "namespace",
  inspectorTab: "trace",
  selectedId: "sd-0",
  correlatedIndexes: [],
  traceIndexes: [],
  recovery: { datasetDirty: true }
};

let preparedWorkspace = null;
let savedRequest = null;
let readCount = 0;
let normalizeSnapshotCount = 0;
let selected = "";
let autosaves = 0;
let processing = [];
let persistedProject = "";
let rebuilds = 0;
let refreshes = 0;
let workerSyncs = 0;
let filters = 0;
let settingsApplied = 0;

const controller = rootGlobal.SignalDockWorkspaceController.create({
  state,
  el,
  appVersion: "2.8.22",
  ownerDocument: document,
  prepareWorkspaceArchive: (entries, workspace, version) => {
    preparedWorkspace = { entries, workspace, version };
    return { parts: ["{}"], size: 2 };
  },
  persistWorkspaceArchive: async (request) => {
    savedRequest = request;
    return { mode: "desktop", name: request.filename, reopenLinked: true };
  },
  readAndParseWorkspace: async () => {
    readCount += 1;
    return {
      entries: [{ message: "restored" }],
      workspace: {
        loadedBytes: 99,
        inputFileCount: 2,
        settings: { wrap: true },
        investigation: { title: "Restored" },
        caseFile: { title: "Restored case" },
        caseCheckpoints: [{ id: "cp-restored" }],
        baselineSnapshot: { id: "base-restored" },
        activeProjectId: "project-restored",
        view: {
          query: "level:error",
          level: "ERROR",
          source: "api.log",
          timeRange: "15m",
          sortMode: "newest",
          pageSize: 250,
          renderMode: "virtual",
          serviceMapGroupBy: "namespace",
          selectedGlobalIndex: 0,
          inspectorTab: "trace"
        }
      }
    };
  },
  normalizeWorkspaceSnapshot: (snapshot) => {
    normalizeSnapshotCount += 1;
    return {
      ...snapshot,
      investigation: { ...snapshot.investigation, schema: "normalized-investigation" },
      caseFile: { ...snapshot.caseFile, schema: "normalized-case" },
      caseCheckpoints: snapshot.caseCheckpoints.map((item) => ({ ...item, normalized: true }))
    };
  },
  normalizeWorkspaceDomain: (workspace) => ({
    investigation: { ...workspace.investigation, normalized: true },
    caseFile: { ...workspace.caseFile, normalized: true },
    caseCheckpoints: workspace.caseCheckpoints,
    baselineSnapshot: workspace.baselineSnapshot,
    activeProjectId: workspace.activeProjectId
  }),
  persistActiveProjectId: (id) => { persistedProject = id; },
  isServiceMapGroupMode: (value) => ["service", "namespace"].includes(value),
  getSelectedEntry: () => state.entries.find((entry) => entry.id === state.selectedId) || null,
  stopLiveTail: () => {},
  appendParsedEntries: (entries) => {
    entries.forEach((entry, index) => state.entries.push({ ...entry, id: `sd-${index}`, globalIndex: index }));
  },
  applySettings: () => { settingsApplied += 1; },
  rebuildFilterIndex: () => { rebuilds += 1; },
  refreshFilters: () => { refreshes += 1; },
  setControlsEnabled: () => {},
  syncWorkerIndex: () => { workerSyncs += 1; },
  syncLevelChips: () => {},
  applyFilters: () => { filters += 1; },
  selectEntry: (id) => { selected = id; },
  markDatasetForAutosave: () => { autosaves += 1; },
  setProcessing: (active) => { processing.push(active); },
  toast: () => {},
  nowIso: () => "2026-09-18T18:30:00.000Z"
});

controller.bind();
controller.bind();
assert.equal(el.workspaceSaveButton.listeners.get("click").size, 1, "bind() must be idempotent");
assert.equal(document.listeners.get("keydown").size, 1, "workspace shortcut listener must be singular");

const view = controller.currentViewState();
assert.equal(view.query, "timeout");
assert.equal(view.selectedGlobalIndex, 0);
assert.equal(view.inspectorTab, "trace");

const workspace = controller.currentWorkspaceState();
assert.equal(normalizeSnapshotCount, 1);
assert.equal(workspace.investigation.schema, "normalized-investigation");
assert.equal(workspace.caseFile.schema, "normalized-case");
assert.equal(JSON.stringify(workspace).includes("handleRef"), false);
assert.equal(JSON.stringify(workspace).includes("handleKind"), false);

const saved = await controller.saveWorkspace();
assert.equal(saved.mode, "desktop");
assert.equal(preparedWorkspace.version, "2.8.22");
assert.equal(preparedWorkspace.workspace.investigation.schema, "normalized-investigation");
assert.equal(savedRequest.filename, "signaldock-2026-09-18T18-30-00.sdsession");

state.entries = [{ id: "stale", globalIndex: 0 }];
const restored = await controller.restoreWorkspace({ name: "incident.sdsession", size: 1024 });
assert.equal(restored, true);
assert.equal(readCount, 1);
assert.equal(state.entries.length, 1);
assert.equal(state.entries[0].message, "restored");
assert.equal(state.loadedBytes, 99);
assert.equal(state.inputFileCount, 2);
assert.equal(state.settings.wrap, true);
assert.equal(state.activeProjectId, "project-restored");
assert.equal(persistedProject, "project-restored");
assert.equal(state.pageSize, 250);
assert.equal(state.renderMode, "virtual");
assert.equal(state.serviceMapGroupBy, "namespace");
assert.equal(state.inspectorTab, "trace");
assert.equal(selected, "sd-0");
assert.equal(state.recovery.datasetDirty, false);
assert.equal(el.loadedMeta.title, "incident.sdsession");
assert.equal(settingsApplied, 1);
assert.equal(rebuilds, 1);
assert.equal(refreshes, 1);
assert.equal(workerSyncs, 1);
assert.equal(filters, 1);
assert.equal(autosaves, 1);
assert.deepEqual(processing, [true, false]);

const rejected = await controller.restoreWorkspace({ name: "huge.sdsession", size: 501 * 1024 * 1024 });
assert.equal(rejected, false);
assert.equal(readCount, 1, "oversized workspace must be rejected before file read");

controller.destroy();
assert.equal(el.workspaceSaveButton.listeners.get("click").size, 0, "destroy() must remove workspace save listener");
assert.equal(document.listeners.get("keydown").size, 0, "destroy() must remove shortcut listener");

console.log("workspace-controller-smoke PASS");
