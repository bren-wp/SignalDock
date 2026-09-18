import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, content) => fs.writeFileSync(path.join(root, name), content);

function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), `migration anchor missing: ${label}`);
  assert.equal(source.indexOf(before), source.lastIndexOf(before), `migration anchor ambiguous: ${label}`);
  return source.replace(before, after);
}

assert.equal(read("VERSION").trim(), "2.8.21", "migration must start from SignalDock 2.8.21");
let app = read("app.js");
assert.ok(app.includes('const APP_VERSION = "2.8.21";'));
assert.ok(app.includes("async function saveWorkspace()"));
assert.ok(app.includes("async function restoreWorkspacePayload("));

app = replaceOnce(app, '  const APP_VERSION = "2.8.21";', '  const APP_VERSION = "2.8.22";', "APP_VERSION");
app = replaceOnce(
  app,
  "  let tableViewController = null;\n",
  "  let tableViewController = null;\n  let workspaceController = null;\n",
  "workspace controller slot"
);

const tableBind = "    tableViewController.bind();";
const workspaceWiring = [
  tableBind,
  '    if (!window.SignalDockWorkspaceController?.create) throw new Error("SignalDock Workspace controller is unavailable.");',
  '    workspaceController = window.SignalDockWorkspaceController.create({',
  '      state,',
  '      el,',
  '      appVersion: APP_VERSION,',
  '      ownerDocument: document,',
  '      prepareWorkspaceArchive: (entries, workspace, version) => {',
  '        const parts = window.SignalDockWorkspace.serializeParts(entries, workspace, version);',
  '        const size = parts.reduce((sum, part) => sum + new Blob([part]).size, 0);',
  '        return { parts, size };',
  '      },',
  '      persistWorkspaceArchive: async ({ filename, parts, size }) => {',
  '        let saved = null;',
  '        if (window.SignalDockDesktopBridge?.saveParts) {',
  '          saved = await window.SignalDockDesktopBridge.saveParts({',
  '            name: filename,',
  '            mime: "application/json;charset=utf-8",',
  '            parts,',
  '            persistHandle: Boolean(state.activeProjectId),',
  '            projectId: state.activeProjectId,',
  '            id: filename,',
  '            note: "SignalDock project workspace"',
  '          });',
  '        } else {',
  '          utils().downloadParts(filename, parts, "application/json;charset=utf-8");',
  '          saved = { mode: "download", name: filename, handleRef: "" };',
  '        }',
  '        if (saved?.mode !== "cancelled" && state.activeProjectId && window.SignalDockProjectManager) {',
  '          if (window.SignalDockProjectManager.touchWorkspace) {',
  '            state.projects = window.SignalDockProjectManager.touchWorkspace(state.projects, state.activeProjectId, {',
  '              id: filename,',
  '              name: saved?.name || filename,',
  '              size,',
  '              handleRef: saved?.handleRef || "",',
  '              handleKind: saved?.handleRef ? "file" : ""',
  '            });',
  '          }',
  '          if (state.baselineSnapshot && window.SignalDockProjectManager.attachBaseline) {',
  '            state.projects = window.SignalDockProjectManager.attachBaseline(state.projects, state.activeProjectId, {',
  '              id: state.baselineSnapshot.id,',
  '              name: state.baselineSnapshot.name,',
  '              capturedAt: state.baselineSnapshot.capturedAt',
  '            });',
  '          }',
  '          if (state.caseFile && window.SignalDockProjectManager.attachCase) {',
  '            state.projects = window.SignalDockProjectManager.attachCase(state.projects, state.activeProjectId, {',
  '              id: state.caseFile.id || "active-case",',
  '              title: state.caseFile.title || state.investigation?.title || "Investigation",',
  '              status: state.caseFile.status || "open",',
  '              updatedAt: state.caseFile.updatedAt || new Date().toISOString()',
  '            });',
  '          }',
  '          projectController?.render();',
  '        }',
  '        return { mode: saved?.mode || "saved", name: saved?.name || filename, reopenLinked: Boolean(saved?.handleRef) };',
  '      },',
  '      readAndParseWorkspace: async (file) => window.SignalDockWorkspace.parse(await file.text()),',
  '      normalizeWorkspaceSnapshot: (snapshot) => ({',
  '        ...snapshot,',
  '        investigation: window.SignalDockInvestigation?.normalize?.(snapshot.investigation) || snapshot.investigation,',
  '        caseFile: window.SignalDockCaseWorkspace?.normalize?.(snapshot.caseFile) || snapshot.caseFile,',
  '        caseCheckpoints: window.SignalDockCaseCheckpoints?.normalizeList?.(snapshot.caseCheckpoints) || snapshot.caseCheckpoints',
  '      }),',
  '      normalizeWorkspaceDomain: (workspace) => {',
  '        const investigationSource = workspace?.investigation || window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] };',
  '        const investigation = window.SignalDockInvestigation?.normalize?.(investigationSource) || investigationSource;',
  '        const caseSource = workspace?.caseFile || window.SignalDockCaseWorkspace?.empty?.(investigation?.title || "Investigation") || { title: investigation?.title || "Investigation", status: "open", severity: "none", findings: [] };',
  '        const caseFile = window.SignalDockCaseWorkspace?.normalize?.(caseSource) || caseSource;',
  '        const caseCheckpoints = window.SignalDockCaseCheckpoints?.normalizeList?.(workspace?.caseCheckpoints || []) || [];',
  '        let baselineSnapshot = state.baselineSnapshot;',
  '        try { baselineSnapshot = workspace?.baselineSnapshot ? window.SignalDockBaselineManager?.normalize?.(workspace.baselineSnapshot) : state.baselineSnapshot; }',
  '        catch { baselineSnapshot = null; }',
  '        return {',
  '          investigation,',
  '          caseFile,',
  '          caseCheckpoints,',
  '          baselineSnapshot,',
  '          activeProjectId: String(workspace?.activeProjectId || state.activeProjectId || "")',
  '        };',
  '      },',
  '      persistActiveProjectId: (projectId) => utils().saveJson("signaldock-active-project-v1", projectId),',
  '      isServiceMapGroupMode: (mode) => Boolean(window.SignalDockServiceMap?.GROUP_MODES?.includes(mode)),',
  '      getSelectedEntry: selectedEntry,',
  '      stopLiveTail,',
  '      appendParsedEntries,',
  '      applySettings,',
  '      rebuildFilterIndex,',
  '      refreshFilters,',
  '      setControlsEnabled,',
  '      syncWorkerIndex,',
  '      syncLevelChips,',
  '      applyFilters,',
  '      selectEntry,',
  '      markDatasetForAutosave,',
  '      setProcessing,',
  '      toast,',
  '      nowIso: () => new Date().toISOString()',
  '    });',
  '    workspaceController.bind();'
].join("\n");
app = replaceOnce(app, tableBind, workspaceWiring, "workspace controller wiring");

app = replaceOnce(app, '    el.workspaceSaveButton.addEventListener("click", saveWorkspace);\n', "", "workspace save listener ownership");
const shortcut = [
  '      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s" && state.entries.length) {',
  '        event.preventDefault();',
  '        saveWorkspace();',
  '      }',
].join("\n");
app = replaceOnce(app, shortcut + "\n", "", "workspace keyboard shortcut ownership");

const saveStart = app.indexOf("  async function saveWorkspace() {");
const clearStart = app.indexOf("  function clearAll() {", saveStart);
assert.ok(saveStart >= 0 && clearStart > saveStart, "save/restore workspace block not found");
const saveDelegates = [
  "  async function saveWorkspace() { return workspaceController?.saveWorkspace(); }",
  "",
  "  async function restoreWorkspace(file) { return workspaceController?.restoreWorkspace(file); }",
  "",
  ""
].join("\n");
app = app.slice(0, saveStart) + saveDelegates + app.slice(clearStart);

const viewStart = app.indexOf("  function currentViewState() {");
const autosaveStart = app.indexOf("  function markDatasetForAutosave() {", viewStart);
assert.ok(viewStart >= 0 && autosaveStart > viewStart, "workspace snapshot block not found");
const snapshotDelegates = [
  "  function currentViewState() { return workspaceController?.currentViewState() || {}; }",
  "",
  "  function currentWorkspaceState() { return workspaceController?.currentWorkspaceState() || {}; }",
  "",
  ""
].join("\n");
app = app.slice(0, viewStart) + snapshotDelegates + app.slice(autosaveStart);

const payloadStart = app.indexOf('  async function restoreWorkspacePayload(payload, label = "workspace") {');
const diagnosticsStart = app.indexOf("  function updateDiagnostics() {", payloadStart);
assert.ok(payloadStart >= 0 && diagnosticsStart > payloadStart, "workspace payload block not found");
app = app.slice(0, payloadStart) + '  async function restoreWorkspacePayload(payload, label = "workspace") { return workspaceController?.restoreWorkspacePayload(payload, label); }\n\n' + app.slice(diagnosticsStart);
write("app.js", app);

let html = read("index.html");
html = replaceOnce(
  html,
  '  <script src="src/app/table-view-controller.js" defer></script>\n',
  '  <script src="src/app/table-view-controller.js" defer></script>\n  <script src="src/app/workspace-controller.js" defer></script>\n',
  "workspace controller script"
);
write("index.html", html);

let layout = read("tests/source-layout-smoke.mjs");
layout = replaceOnce(
  layout,
  '  "src/app/table-view-controller.js",\n',
  '  "src/app/table-view-controller.js",\n  "src/app/workspace-controller.js",\n',
  "source-layout workspace controller"
);
write("tests/source-layout-smoke.mjs", layout);
write("tests/workspace-controller-smoke.mjs", "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst controllerSource = read(\"src/app/workspace-controller.js\");\n\nassert.ok(html.includes('src/app/workspace-controller.js'), \"Workspace controller missing from index.html\");\nassert.ok(html.indexOf('src/app/workspace-controller.js') < html.indexOf('app.js'), \"Workspace controller must load before app.js\");\nassert.ok(app.includes(\"SignalDockWorkspaceController.create\"), \"Workspace controller factory wiring missing\");\nassert.ok(app.includes(\"workspaceController.bind();\"), \"Workspace controller bind missing\");\n\nfor (const token of [\n  'el.workspaceSaveButton.addEventListener(\"click\", saveWorkspace)',\n  'event.shiftKey && event.key.toLowerCase() === \"s\"'\n]) assert.ok(!app.includes(token), `root still owns workspace UI listener: ${token}`);\n\nfor (const token of [\n  \"SignalDockWorkspace\",\n  \"SignalDockDesktopBridge\",\n  \"SignalDockProjectManager\",\n  \"SignalDockPersistence\",\n  \"SignalDockStorageAdapter\",\n  \"showOpenFilePicker\",\n  \"indexedDB\",\n  \"localStorage\",\n  \"sessionStorage\",\n  \"handleRef\",\n  \"handleKind\",\n  \"reopenable\",\n  \".text(\",\n  \"XMLHttpRequest\",\n  \"WebSocket\",\n  \"EventSource\",\n  \".invoke(\"\n]) assert.ok(!controllerSource.includes(token), `forbidden Workspace controller capability reference: ${token}`);\nassert.ok(!/\\bfetch\\s*\\(/.test(controllerSource), \"Workspace controller must not use fetch()\");\n\nfor (const token of [\n  \"SignalDockWorkspace.serializeParts\",\n  \"SignalDockWorkspace.parse\",\n  \"SignalDockDesktopBridge.saveParts\",\n  \"SignalDockProjectManager.touchWorkspace\",\n  \"file.text()\"\n]) assert.ok(app.includes(token), `workspace capability must remain root-owned: ${token}`);\n\nclass FakeNode {\n  constructor(document) {\n    this.ownerDocument = document;\n    this.value = \"\";\n    this.title = \"\";\n    this.disabled = false;\n    this.options = [];\n    this.listeners = new Map();\n  }\n  addEventListener(type, handler) {\n    if (!this.listeners.has(type)) this.listeners.set(type, new Set());\n    this.listeners.get(type).add(handler);\n  }\n  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }\n}\nconst document = new FakeNode(null);\ndocument.ownerDocument = document;\nconst make = () => new FakeNode(document);\nconst select = (pairs, value = \"\") => {\n  const node = make();\n  node.options = pairs.map(([optionValue, textContent]) => ({ value: optionValue, textContent }));\n  node.value = value;\n  return node;\n};\n\nconst rootGlobal = { document };\nvm.runInNewContext(controllerSource, { self: rootGlobal, window: rootGlobal, console, Set }, { filename: \"workspace-controller.js\" });\n\nconst el = {\n  workspaceSaveButton: make(),\n  queryInput: make(),\n  levelFilter: select([[\"\", \"All\"], [\"ERROR\", \"Error\"]], \"ERROR\"),\n  sourceFilter: select([[\"\", \"All\"], [\"api.log\", \"api.log\"]], \"api.log\"),\n  timeFilter: select([[\"\", \"All\"], [\"15m\", \"15m\"]], \"15m\"),\n  sortFilter: select([[\"original\", \"Original\"], [\"newest\", \"Newest\"]], \"newest\"),\n  pageSize: select([[\"100\", \"100\"], [\"250\", \"250\"]], \"250\"),\n  renderMode: select([[\"paged\", \"Paged\"], [\"virtual\", \"Virtual\"]], \"virtual\"),\n  serviceMapGroupBy: select([[\"service\", \"Service\"], [\"namespace\", \"Namespace\"]], \"namespace\"),\n  loadedMeta: make()\n};\nel.queryInput.value = \"timeout\";\n\nconst state = {\n  entries: [{ id: \"sd-0\", globalIndex: 0 }],\n  filterEntries: [{}],\n  filteredIndexes: [0],\n  loadedBytes: 10,\n  inputFileCount: 1,\n  settings: { wrap: false },\n  investigation: { title: \"Incident\" },\n  caseFile: { title: \"Incident\", status: \"open\" },\n  caseCheckpoints: [{ id: \"cp-1\" }],\n  baselineSnapshot: { id: \"base-1\" },\n  activeProjectId: \"project-1\",\n  pageSize: 250,\n  renderMode: \"virtual\",\n  serviceMapGroupBy: \"namespace\",\n  inspectorTab: \"trace\",\n  selectedId: \"sd-0\",\n  correlatedIndexes: [],\n  traceIndexes: [],\n  recovery: { datasetDirty: true }\n};\n\nlet preparedWorkspace = null;\nlet savedRequest = null;\nlet readCount = 0;\nlet normalizeSnapshotCount = 0;\nlet selected = \"\";\nlet autosaves = 0;\nlet processing = [];\nlet persistedProject = \"\";\nlet rebuilds = 0;\nlet refreshes = 0;\nlet workerSyncs = 0;\nlet filters = 0;\nlet settingsApplied = 0;\n\nconst controller = rootGlobal.SignalDockWorkspaceController.create({\n  state,\n  el,\n  appVersion: \"2.8.22\",\n  ownerDocument: document,\n  prepareWorkspaceArchive: (entries, workspace, version) => {\n    preparedWorkspace = { entries, workspace, version };\n    return { parts: [\"{}\"], size: 2 };\n  },\n  persistWorkspaceArchive: async (request) => {\n    savedRequest = request;\n    return { mode: \"desktop\", name: request.filename, reopenLinked: true };\n  },\n  readAndParseWorkspace: async () => {\n    readCount += 1;\n    return {\n      entries: [{ message: \"restored\" }],\n      workspace: {\n        loadedBytes: 99,\n        inputFileCount: 2,\n        settings: { wrap: true },\n        investigation: { title: \"Restored\" },\n        caseFile: { title: \"Restored case\" },\n        caseCheckpoints: [{ id: \"cp-restored\" }],\n        baselineSnapshot: { id: \"base-restored\" },\n        activeProjectId: \"project-restored\",\n        view: {\n          query: \"level:error\",\n          level: \"ERROR\",\n          source: \"api.log\",\n          timeRange: \"15m\",\n          sortMode: \"newest\",\n          pageSize: 250,\n          renderMode: \"virtual\",\n          serviceMapGroupBy: \"namespace\",\n          selectedGlobalIndex: 0,\n          inspectorTab: \"trace\"\n        }\n      }\n    };\n  },\n  normalizeWorkspaceSnapshot: (snapshot) => {\n    normalizeSnapshotCount += 1;\n    return {\n      ...snapshot,\n      investigation: { ...snapshot.investigation, schema: \"normalized-investigation\" },\n      caseFile: { ...snapshot.caseFile, schema: \"normalized-case\" },\n      caseCheckpoints: snapshot.caseCheckpoints.map((item) => ({ ...item, normalized: true }))\n    };\n  },\n  normalizeWorkspaceDomain: (workspace) => ({\n    investigation: { ...workspace.investigation, normalized: true },\n    caseFile: { ...workspace.caseFile, normalized: true },\n    caseCheckpoints: workspace.caseCheckpoints,\n    baselineSnapshot: workspace.baselineSnapshot,\n    activeProjectId: workspace.activeProjectId\n  }),\n  persistActiveProjectId: (id) => { persistedProject = id; },\n  isServiceMapGroupMode: (value) => [\"service\", \"namespace\"].includes(value),\n  getSelectedEntry: () => state.entries.find((entry) => entry.id === state.selectedId) || null,\n  stopLiveTail: () => {},\n  appendParsedEntries: (entries) => {\n    entries.forEach((entry, index) => state.entries.push({ ...entry, id: `sd-${index}`, globalIndex: index }));\n  },\n  applySettings: () => { settingsApplied += 1; },\n  rebuildFilterIndex: () => { rebuilds += 1; },\n  refreshFilters: () => { refreshes += 1; },\n  setControlsEnabled: () => {},\n  syncWorkerIndex: () => { workerSyncs += 1; },\n  syncLevelChips: () => {},\n  applyFilters: () => { filters += 1; },\n  selectEntry: (id) => { selected = id; },\n  markDatasetForAutosave: () => { autosaves += 1; },\n  setProcessing: (active) => { processing.push(active); },\n  toast: () => {},\n  nowIso: () => \"2026-09-18T18:30:00.000Z\"\n});\n\ncontroller.bind();\ncontroller.bind();\nassert.equal(el.workspaceSaveButton.listeners.get(\"click\").size, 1, \"bind() must be idempotent\");\nassert.equal(document.listeners.get(\"keydown\").size, 1, \"workspace shortcut listener must be singular\");\n\nconst view = controller.currentViewState();\nassert.equal(view.query, \"timeout\");\nassert.equal(view.selectedGlobalIndex, 0);\nassert.equal(view.inspectorTab, \"trace\");\n\nconst workspace = controller.currentWorkspaceState();\nassert.equal(normalizeSnapshotCount, 1);\nassert.equal(workspace.investigation.schema, \"normalized-investigation\");\nassert.equal(workspace.caseFile.schema, \"normalized-case\");\nassert.equal(JSON.stringify(workspace).includes(\"handleRef\"), false);\nassert.equal(JSON.stringify(workspace).includes(\"handleKind\"), false);\n\nconst saved = await controller.saveWorkspace();\nassert.equal(saved.mode, \"desktop\");\nassert.equal(preparedWorkspace.version, \"2.8.22\");\nassert.equal(preparedWorkspace.workspace.investigation.schema, \"normalized-investigation\");\nassert.equal(savedRequest.filename, \"signaldock-2026-09-18T18-30-00.sdsession\");\n\nstate.entries = [{ id: \"stale\", globalIndex: 0 }];\nconst restored = await controller.restoreWorkspace({ name: \"incident.sdsession\", size: 1024 });\nassert.equal(restored, true);\nassert.equal(readCount, 1);\nassert.equal(state.entries.length, 1);\nassert.equal(state.entries[0].message, \"restored\");\nassert.equal(state.loadedBytes, 99);\nassert.equal(state.inputFileCount, 2);\nassert.equal(state.settings.wrap, true);\nassert.equal(state.activeProjectId, \"project-restored\");\nassert.equal(persistedProject, \"project-restored\");\nassert.equal(state.pageSize, 250);\nassert.equal(state.renderMode, \"virtual\");\nassert.equal(state.serviceMapGroupBy, \"namespace\");\nassert.equal(state.inspectorTab, \"trace\");\nassert.equal(selected, \"sd-0\");\nassert.equal(state.recovery.datasetDirty, false);\nassert.equal(el.loadedMeta.title, \"incident.sdsession\");\nassert.equal(settingsApplied, 1);\nassert.equal(rebuilds, 1);\nassert.equal(refreshes, 1);\nassert.equal(workerSyncs, 1);\nassert.equal(filters, 1);\nassert.equal(autosaves, 1);\nassert.deepEqual(processing, [true, false]);\n\nconst rejected = await controller.restoreWorkspace({ name: \"huge.sdsession\", size: 501 * 1024 * 1024 });\nassert.equal(rejected, false);\nassert.equal(readCount, 1, \"oversized workspace must be rejected before file read\");\n\ncontroller.destroy();\nassert.equal(el.workspaceSaveButton.listeners.get(\"click\").size, 0, \"destroy() must remove workspace save listener\");\nassert.equal(document.listeners.get(\"keydown\").size, 0, \"destroy() must remove shortcut listener\");\n\nconsole.log(\"workspace-controller-smoke PASS\");\n");
write("VERSION", "2.8.22\n");

let readme = read("README.md").replaceAll("2.8.21", "2.8.22");
const readmeAnchor = "- feature-level Table View controller under `src/app/` that owns paged/windowed rendering, pagination, virtual spacers, row DOM and table listeners while virtual-viewport calculation and performance recording remain root-injected callbacks\n";
if (readme.includes(readmeAnchor)) {
  readme = readme.replace(readmeAnchor, readmeAnchor + "- feature-level Workspace controller under `src/app/` that owns workspace snapshots, save/restore orchestration and workspace UI shortcuts while serialization, file reads, native/browser save capabilities and Project handle metadata remain root-injected callbacks\n");
}
write("README.md", readme);

let technical = read("docs/TECHNICAL.md").replace("Current version: **2.8.21**.", "Current version: **2.8.22**.");
const techAnchor = "`table-view-controller.js` owns paged and virtual table rendering, pagination, virtual spacer management, row DOM construction, scroll/page/render-mode listeners and row navigation. Virtual viewport calculation, formatting, selection and performance recording remain explicit root-injected callbacks.\n";
technical = replaceOnce(
  technical,
  techAnchor,
  techAnchor + "\n`workspace-controller.js` owns portable workspace/view snapshots, save/restore state orchestration, the workspace save button and the Ctrl/Cmd+Shift+S shortcut. Session serialization/parsing, file reads, Desktop Bridge saves/downloads, Project Manager handle metadata and domain normalization remain in the root/platform boundary behind narrow callbacks.\n",
  "technical workspace boundary"
);
write("docs/TECHNICAL.md", technical);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout = replaceOnce(
  sourceLayout,
  "`dataset-filter-controller.js`, `table-view-controller.js`, `investigation-controller.js`",
  "`dataset-filter-controller.js`, `table-view-controller.js`, `workspace-controller.js`, `investigation-controller.js`",
  "source layout workspace list"
);
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let srcReadme = read("src/README.md");
const srcAnchor = "`app/table-view-controller.js` owns paged/windowed rendering, pagination, virtual spacers, row DOM and table listeners while viewport calculation, formatting, selection and performance timing remain root-injected callbacks.\n";
srcReadme = replaceOnce(
  srcReadme,
  srcAnchor,
  srcAnchor + "\n`app/workspace-controller.js` owns workspace/view snapshots, save/restore orchestration and workspace UI shortcuts while serialization, file I/O, Desktop Bridge/Project handle capabilities and domain normalization remain root-injected callbacks.\n",
  "src README workspace boundary"
);
write("src/README.md", srcReadme);

let changelog = read("CHANGELOG.md");
const notes = [
  "## 2.8.22 — 2026-09-18",
  "",
  "### Workspace application boundary",
  "- Extracted workspace/view snapshot construction, save/restore orchestration, restore-state application and workspace save/keyboard listener ownership into `src/app/workspace-controller.js`.",
  "- Kept session serialization/parsing, file reads, Desktop Bridge save actions, browser download fallback, Project Manager handle metadata and domain normalization in the root/platform boundary behind narrow callbacks.",
  "- Preserved the 500 MB restore safety limit, portable workspace payload semantics, active-project restoration, view/filter restoration and recovery autosave handoff.",
  "",
  "### Maintainability and verification",
  "- Added isolated Workspace controller coverage for normalized portable snapshots, save orchestration, restore state, selected-entry restoration, size-limit rejection and idempotent listener cleanup.",
  "- Added capability assertions preventing direct storage, filesystem, Desktop Bridge, Project Manager, handle-reference or network access from the controller.",
  "- Updated permanent source-layout and HTTP smoke gates while preserving the zero-build local-first runtime.",
  "",
  ""
].join("\n");
changelog = replaceOnce(changelog, "# Changelog\n\n", "# Changelog\n\n" + notes, "changelog");
write("CHANGELOG.md", changelog);

const finalController = read("src/app/workspace-controller.js");
for (const token of [
  "SignalDockWorkspace",
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
]) assert.ok(!finalController.includes(token), `forbidden Workspace controller capability: ${token}`);
assert.ok(!/\bfetch\s*\(/.test(finalController), "Workspace controller must not use fetch()");

const finalApp = read("app.js");
for (const token of [
  "SignalDockWorkspace.serializeParts",
  "SignalDockWorkspace.parse",
  "SignalDockDesktopBridge.saveParts",
  "SignalDockProjectManager.touchWorkspace",
  "file.text()"
]) assert.ok(finalApp.includes(token), `workspace capability must remain root-owned: ${token}`);
assert.ok(!finalApp.includes('el.workspaceSaveButton.addEventListener("click", saveWorkspace)'));
assert.ok(!finalApp.includes('event.shiftKey && event.key.toLowerCase() === "s"'));
assert.ok(read("index.html").indexOf("src/app/workspace-controller.js") < read("index.html").indexOf("app.js"));
console.log("SignalDock v2.8.22 migration prepared successfully.");
