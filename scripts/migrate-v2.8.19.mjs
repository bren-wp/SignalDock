import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, content) => fs.writeFileSync(path.join(root, name), content);

function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), `migration anchor missing: ${label}`);
  assert.equal(source.indexOf(before), source.lastIndexOf(before), `migration anchor is ambiguous: ${label}`);
  return source.replace(before, after);
}

assert.equal(read("VERSION").trim(), "2.8.18", "migration must start from SignalDock 2.8.18");

let app = read("app.js");
assert.ok(app.includes('const APP_VERSION = "2.8.18";'), "unexpected APP_VERSION before migration");
assert.ok(app.includes("async function startLiveTail()"), "Live Tail boundary already moved or missing");
assert.ok(app.includes("async function handleFiles("), "import boundary already moved or missing");

app = replaceOnce(app, '  const APP_VERSION = "2.8.18";', '  const APP_VERSION = "2.8.19";', "APP_VERSION");
app = replaceOnce(
  app,
  "  let savedViewsController = null;\n",
  "  let savedViewsController = null;\n  let importLiveTailController = null;\n",
  "Import/Live Tail controller slot"
);

const settingsLoad = '    state.settings = Object.assign(state.settings, utils().loadJson("signaldock-settings-v1", {}), utils().loadJson("signaldock-settings-v2", {}), utils().loadJson("signaldock-settings-v3", {}), utils().loadJson("signaldock-settings-v5", {}), utils().loadJson("signaldock-settings-v6", {}), utils().loadJson("signaldock-settings-v8", {}), utils().loadJson(STORAGE_SETTINGS, {}));';
const importWiring = [
  settingsLoad,
  '    if (!window.SignalDockImportLiveTailController?.create) throw new Error("SignalDock Import/Live Tail controller is unavailable.");',
  '    importLiveTailController = window.SignalDockImportLiveTailController.create({',
  '      state,',
  '      el,',
  '      parseFile: (file, onProgress) => window.SignalDockParser.parseFile(file, onProgress, { profile: state.settings.parserProfile || "auto", customProfile: currentCustomParserProfile() }),',
  '      parseText: (text, source) => window.SignalDockParser.parseText(text, source, state.settings.parserProfile || "auto", currentCustomParserProfile()),',
  '      restoreWorkspaceFile: (file) => restoreWorkspace(file),',
  '      startParseProfile: (file) => profiler()?.start?.("parse", { file: file.name, bytes: file.size }) || null,',
  '      touchProjectDatasets: (projectFiles) => {',
  '        if (!state.activeProjectId || !window.SignalDockProjectManager?.touchDataset) return;',
  '        for (const fileMeta of projectFiles) state.projects = window.SignalDockProjectManager.touchDataset(state.projects, state.activeProjectId, fileMeta);',
  '        projectController?.render();',
  '      },',
  '      setProcessing,',
  '      nextFrame,',
  '      toast,',
  '      rebuildFilterIndex,',
  '      refreshFilters,',
  '      setControlsEnabled,',
  '      syncWorkerIndex,',
  '      applyFilters,',
  '      markDatasetForAutosave,',
  '      renderEverything,',
  '      canUseLiveTail: () => typeof window.showOpenFilePicker === "function",',
  '      pickLiveTailFile: async () => {',
  '        const [handle] = await window.showOpenFilePicker({',
  '          multiple: false,',
  '          types: [{ description: "Log files", accept: { "text/plain": [".log", ".txt", ".jsonl", ".ndjson"] } }]',
  '        });',
  '        const file = await handle.getFile();',
  '        return { handle, file };',
  '      },',
  '      readLiveTailDelta: async (handle, offset) => {',
  '        const file = await handle.getFile();',
  '        const truncated = file.size < offset;',
  '        const start = truncated ? 0 : offset;',
  '        const text = file.size > start ? await file.slice(start, file.size).text() : "";',
  '        return { name: file.name, size: file.size, start, text, truncated };',
  '      }',
  '    });',
  '    importLiveTailController.bind();'
].join("\n");
app = replaceOnce(app, settingsLoad, importWiring, "Import/Live Tail controller wiring");

const importListeners = [
  '    el.importButton.addEventListener("click", () => el.fileInput.click());',
  '    el.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));',
  '',
  '    let dragDepth = 0;',
  '    document.addEventListener("dragenter", (event) => {',
  '      if (!hasFileDrag(event)) return;',
  '      event.preventDefault();',
  '      dragDepth += 1;',
  '      el.dragOverlay.hidden = false;',
  '    });',
  '    document.addEventListener("dragover", (event) => {',
  '      if (!hasFileDrag(event)) return;',
  '      event.preventDefault();',
  '    });',
  '    document.addEventListener("dragleave", (event) => {',
  '      if (!hasFileDrag(event)) return;',
  '      dragDepth = Math.max(0, dragDepth - 1);',
  '      if (!dragDepth) el.dragOverlay.hidden = true;',
  '    });',
  '    document.addEventListener("drop", (event) => {',
  '      if (!hasFileDrag(event)) return;',
  '      event.preventDefault();',
  '      dragDepth = 0;',
  '      el.dragOverlay.hidden = true;',
  '      handleFiles(event.dataTransfer.files);',
  '    });',
  ''
].join("\n");
app = replaceOnce(app, importListeners, "", "root import/drag listener ownership");

const importStart = app.indexOf("  async function startLiveTail() {");
const rebuildStart = app.indexOf("  function rebuildFilterIndex() {", importStart);
assert.ok(importStart >= 0 && rebuildStart > importStart, "could not isolate import/live-tail block");
const delegates = [
  "  async function startLiveTail() { return importLiveTailController?.startLiveTail(); }",
  "",
  "  function stopLiveTail() { return importLiveTailController?.stopLiveTail(); }",
  "",
  "  function projectDatasetId(file) { return importLiveTailController?.projectDatasetId(file) || \"\"; }",
  "",
  "  async function handleFiles(fileList, options = {}) { return importLiveTailController?.handleFiles(fileList, options); }",
  "",
  "  function appendParsedEntries(parsed) { return importLiveTailController?.appendParsedEntries(parsed) || 0; }",
  "",
  ""
].join("\n");
app = app.slice(0, importStart) + delegates + app.slice(rebuildStart);
write("app.js", app);

let html = read("index.html");
html = replaceOnce(
  html,
  '  <script src="src/app/saved-views-controller.js" defer></script>\n',
  '  <script src="src/app/saved-views-controller.js" defer></script>\n  <script src="src/app/import-live-tail-controller.js" defer></script>\n',
  "Import/Live Tail controller script order"
);
write("index.html", html);

let sourceLayoutTest = read("tests/source-layout-smoke.mjs");
sourceLayoutTest = replaceOnce(
  sourceLayoutTest,
  '  "src/app/saved-views-controller.js",\n',
  '  "src/app/saved-views-controller.js",\n  "src/app/import-live-tail-controller.js",\n',
  "source-layout Import/Live Tail controller list"
);
write("tests/source-layout-smoke.mjs", sourceLayoutTest);

const controllerSmoke = "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst controllerSource = read(\"src/app/import-live-tail-controller.js\");\n\nassert.ok(html.includes('src/app/import-live-tail-controller.js'), \"Import/Live Tail controller missing from index.html\");\nassert.ok(html.indexOf('src/app/import-live-tail-controller.js') < html.indexOf('app.js'), \"Import/Live Tail controller must load before app.js\");\nassert.ok(app.includes(\"SignalDockImportLiveTailController.create\"), \"Import/Live Tail controller factory wiring missing\");\nassert.ok(app.includes(\"importLiveTailController.bind();\"), \"Import/Live Tail controller bind() missing\");\nfor (const token of [\n  'el.importButton.addEventListener(\"click\"',\n  'el.fileInput.addEventListener(\"change\"',\n  'document.addEventListener(\"dragenter\"',\n  'document.addEventListener(\"dragover\"',\n  'document.addEventListener(\"dragleave\"',\n  'document.addEventListener(\"drop\"'\n]) assert.ok(!app.includes(token), `root still owns import/drag listener: ${token}`);\n\nfor (const token of [\"handleFiles\", \"appendParsedEntries\", \"startLiveTail\", \"stopLiveTail\", \"pollLiveTail\", \"projectDatasetId\", \"function bind()\", \"function destroy()\"]) {\n  assert.ok(controllerSource.includes(token), `controller missing expected ownership token: ${token}`);\n}\nfor (const token of [\n  \"SignalDockParser\", \"showOpenFilePicker\", \".getFile(\", \"SignalDockProjectManager\",\n  \"SignalDockPersistence\", \"SignalDockStorageAdapter\", \"indexedDB\", \"localStorage\",\n  \"sessionStorage\", \"XMLHttpRequest\", \"WebSocket\", \"EventSource\", \".invoke(\"\n]) {\n  assert.ok(!controllerSource.includes(token), `forbidden capability reference in Import/Live Tail controller: ${token}`);\n}\nassert.ok(!/\\bfetch\\s*\\(/.test(controllerSource), \"Import/Live Tail controller must not use fetch()\");\n\nclass FakeNode {\n  constructor(document) {\n    this.ownerDocument = document;\n    this.value = \"\";\n    this.hidden = true;\n    this.textContent = \"\";\n    this.listeners = new Map();\n    this.children = [];\n    this.dataset = {};\n    this.classState = new Map();\n    this.classList = { toggle: (name, value) => this.classState.set(name, Boolean(value)) };\n  }\n  addEventListener(type, handler) {\n    if (!this.listeners.has(type)) this.listeners.set(type, new Set());\n    this.listeners.get(type).add(handler);\n  }\n  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }\n  querySelector(selector) { return selector === \"span\" ? this.children[0] || null : null; }\n  click() { this.clicked = (this.clicked || 0) + 1; }\n}\nconst document = new FakeNode(null);\ndocument.ownerDocument = document;\nconst liveButton = new FakeNode(document);\nconst liveLabel = new FakeNode(document);\nliveButton.children = [liveLabel];\ndocument.querySelector = (selector) => selector === '[data-nav=\"live\"]' ? liveButton : null;\n\nlet timerId = 0;\nconst rootGlobal = {\n  document,\n  setTimeout: () => ++timerId,\n  clearTimeout: () => {}\n};\nconst context = { self: rootGlobal, window: rootGlobal, console, setTimeout: rootGlobal.setTimeout, clearTimeout: rootGlobal.clearTimeout };\nvm.runInNewContext(controllerSource, context, { filename: \"import-live-tail-controller.js\" });\n\nconst el = {\n  importButton: new FakeNode(document),\n  fileInput: new FakeNode(document),\n  dragOverlay: new FakeNode(document),\n  baselineChangeCount: new FakeNode(document)\n};\nconst state = {\n  entries: [],\n  loadedBytes: 0,\n  inputFileCount: 0,\n  baselineComparison: { old: true },\n  settings: { parserProfile: \"auto\" },\n  tail: { active: false, handle: null, offset: 0, timer: null, carry: \"\", source: \"\" }\n};\n\nlet rebuilds = 0;\nlet refreshes = 0;\nlet syncs = 0;\nlet filters = 0;\nlet autosaves = 0;\nlet controls = 0;\nlet touched = 0;\nlet processingEnds = 0;\nlet parseTextCalls = 0;\nconst imported = { name: \"api.log\", size: 100, lastModified: 1 };\nconst tailFile = { name: \"tail.log\", size: 5, lastModified: 2 };\nconst controller = rootGlobal.SignalDockImportLiveTailController.create({\n  state,\n  el,\n  ownerDocument: document,\n  parseFile: async (file, progress) => { progress(1); return [{ message: file.name }]; },\n  parseText: async () => { parseTextCalls += 1; return [{ message: \"tail\" }]; },\n  restoreWorkspaceFile: async () => {},\n  startParseProfile: () => () => {},\n  touchProjectDatasets: (files) => { touched += files.length; },\n  setProcessing: (active) => { if (!active) processingEnds += 1; },\n  nextFrame: async () => {},\n  toast: () => {},\n  rebuildFilterIndex: () => { rebuilds += 1; },\n  refreshFilters: () => { refreshes += 1; },\n  setControlsEnabled: () => { controls += 1; },\n  syncWorkerIndex: () => { syncs += 1; },\n  applyFilters: () => { filters += 1; },\n  markDatasetForAutosave: () => { autosaves += 1; },\n  renderEverything: () => {},\n  canUseLiveTail: () => true,\n  pickLiveTailFile: async () => ({ handle: { id: \"tail-handle\" }, file: tailFile }),\n  readLiveTailDelta: async () => ({ name: \"tail.log\", size: 12, start: 5, text: \"next\\n\", truncated: false })\n});\n\ncontroller.bind();\ncontroller.bind();\nassert.equal(el.importButton.listeners.get(\"click\").size, 1, \"bind() must be idempotent\");\nassert.equal(document.listeners.get(\"dragenter\").size, 1, \"drag listeners must be singular\");\n\nconst result = await controller.handleFiles([imported]);\nassert.equal(result.added, 1);\nassert.equal(result.failed, 0);\nassert.equal(state.entries.length, 1);\nassert.equal(state.entries[0].id, \"sd-0\");\nassert.equal(state.entries[0].globalIndex, 0);\nassert.equal(state.loadedBytes, 100);\nassert.equal(state.inputFileCount, 1);\nassert.equal(state.baselineComparison, null);\nassert.equal(touched, 1);\nassert.equal(rebuilds, 1);\nassert.equal(refreshes, 1);\nassert.equal(syncs, 1);\nassert.equal(filters, 1);\nassert.equal(autosaves, 1);\nassert.equal(controls, 1);\nassert.equal(processingEnds, 1);\n\nawait controller.startLiveTail();\nassert.equal(state.tail.active, true);\nassert.equal(state.tail.source, \"tail.log\");\nassert.equal(state.entries.length, 2);\nassert.equal(liveButton.classState.get(\"is-live\"), true);\nassert.equal(liveLabel.textContent, \"Stop live tail\");\nassert.ok(state.tail.timer);\n\nawait controller.pollLiveTail();\nassert.equal(parseTextCalls, 1);\nassert.equal(state.entries.length, 3);\nassert.equal(state.entries[2].id, \"sd-2\");\nassert.equal(state.loadedBytes, 112);\n\ncontroller.stopLiveTail();\nassert.equal(state.tail.active, false);\nassert.equal(liveButton.classState.get(\"is-live\"), false);\nassert.equal(liveLabel.textContent, \"Live tail\");\n\ncontroller.destroy();\nassert.equal(el.importButton.listeners.get(\"click\").size, 0, \"destroy() must remove import listener\");\nassert.equal(document.listeners.get(\"dragenter\").size, 0, \"destroy() must remove drag listener\");\nconsole.log(\"import-live-tail-controller-smoke PASS\");\n";
write("tests/import-live-tail-controller-smoke.mjs", controllerSmoke);
write("VERSION", "2.8.19\n");

let readme = read("README.md").replaceAll("2.8.18", "2.8.19");
readme = replaceOnce(
  readme,
  "- feature-level Saved Views controller under `src/app/` that owns legacy quick-view creation/render/apply/delete UI while local persistence, prompt/ID generation and filter execution remain root-injected callbacks\n",
  "- feature-level Saved Views controller under `src/app/` that owns legacy quick-view creation/render/apply/delete UI while local persistence, prompt/ID generation and filter execution remain root-injected callbacks\n- feature-level Import + Live Tail controller under `src/app/` that owns file-input/drag-drop orchestration, parsed-entry append state and local tail lifecycle while parser, File System Access and Project Manager capabilities remain root-injected callbacks\n",
  "README Import/Live Tail feature"
);
write("README.md", readme);

let technical = read("docs/TECHNICAL.md");
technical = replaceOnce(technical, "Current version: **2.8.18**.", "Current version: **2.8.19**.", "technical version");
technical = replaceOnce(
  technical,
  "`saved-views-controller.js` owns the legacy quick Saved Views UI lifecycle: naming, bounded state updates, rendering, apply/delete actions and listener ownership. Loading/persisting view JSON, generating IDs, prompting and executing filter work remain root-injected callbacks so the controller receives no storage, worker, filesystem or network capability.\n",
  "`saved-views-controller.js` owns the legacy quick Saved Views UI lifecycle: naming, bounded state updates, rendering, apply/delete actions and listener ownership. Loading/persisting view JSON, generating IDs, prompting and executing filter work remain root-injected callbacks so the controller receives no storage, worker, filesystem or network capability.\n\n`import-live-tail-controller.js` owns file-input and drag/drop listeners, import progress/state coordination, parsed-entry append state and the Live Tail lifecycle. Parser execution, File System Access picker/handle reads, Project Manager persistence, worker synchronization and recovery autosave remain root-injected callbacks; the controller never receives those capabilities directly.\n",
  "technical Import/Live Tail boundary"
);
write("docs/TECHNICAL.md", technical);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout = replaceOnce(
  sourceLayout,
  "`recovery-diagnostics-controller.js`, `saved-views-controller.js`, `investigation-controller.js`",
  "`recovery-diagnostics-controller.js`, `saved-views-controller.js`, `import-live-tail-controller.js`, `investigation-controller.js`",
  "source layout Import/Live Tail controller list"
);
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let srcReadme = read("src/README.md");
srcReadme = replaceOnce(
  srcReadme,
  "`app/saved-views-controller.js` owns quick Saved Views naming, rendering, apply/delete behavior and UI listeners while JSON persistence, prompt/ID generation and filter execution remain root-injected callbacks.\n",
  "`app/saved-views-controller.js` owns quick Saved Views naming, rendering, apply/delete behavior and UI listeners while JSON persistence, prompt/ID generation and filter execution remain root-injected callbacks.\n\n`app/import-live-tail-controller.js` owns file import/drag-drop UI orchestration, parsed-entry append state and Live Tail lifecycle while parser, File System Access, Project Manager, worker and recovery capabilities remain root-injected callbacks.\n",
  "src README Import/Live Tail boundary"
);
write("src/README.md", srcReadme);

let changelog = read("CHANGELOG.md");
const releaseNotes = [
  "## 2.8.19 — 2026-09-18",
  "",
  "### Import and Live Tail application boundary",
  "- Extracted file-input and drag/drop listener ownership, multi-file import orchestration, parsed-entry append state, Project dataset metadata coordination and local Live Tail lifecycle into `src/app/import-live-tail-controller.js`.",
  "- Kept parser execution, File System Access picker/handle reads and Project Manager mutation in the root/platform boundary behind narrow injected callbacks.",
  "- Preserved .sdsession routing, parse progress reporting, current parser-profile semantics, project history IDs, local tail truncation recovery and 1.4 second polling behavior.",
  "",
  "### Maintainability and verification",
  "- Added isolated import/Live Tail lifecycle coverage plus capability-boundary assertions forbidding parser, filesystem, storage, worker and network access from the controller.",
  "- Updated permanent source-layout and HTTP smoke gates for the new controller.",
  "- Preserved the zero-build, local-first, no-backend, no-telemetry and `connect-src 'none'` architecture.",
  "",
  ""
].join("\n");
changelog = replaceOnce(changelog, "# Changelog\n\n", "# Changelog\n\n" + releaseNotes, "changelog release insertion");
write("CHANGELOG.md", changelog);

const finalController = read("src/app/import-live-tail-controller.js");
for (const token of [
  "SignalDockParser", "showOpenFilePicker", ".getFile(", "SignalDockProjectManager",
  "SignalDockPersistence", "SignalDockStorageAdapter", "indexedDB", "localStorage",
  "sessionStorage", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("
]) assert.ok(!finalController.includes(token), `forbidden Import/Live Tail controller capability reference: ${token}`);
assert.ok(!/\bfetch\s*\(/.test(finalController), "forbidden Import/Live Tail controller fetch() capability");
assert.ok(read("index.html").indexOf("src/app/import-live-tail-controller.js") < read("index.html").indexOf("app.js"), "Import/Live Tail controller must load before app.js");
for (const token of [
  'el.importButton.addEventListener("click"',
  'el.fileInput.addEventListener("change"',
  'document.addEventListener("dragenter"',
  'document.addEventListener("dragover"',
  'document.addEventListener("dragleave"',
  'document.addEventListener("drop"'
]) assert.ok(!read("app.js").includes(token), `root still owns import/drag listener: ${token}`);
assert.ok(read("app.js").includes("window.SignalDockParser.parseFile"), "parser capability must remain root-owned");
assert.ok(read("app.js").includes("window.showOpenFilePicker"), "File System Access capability must remain root-owned");
console.log("SignalDock v2.8.19 migration prepared successfully.");
