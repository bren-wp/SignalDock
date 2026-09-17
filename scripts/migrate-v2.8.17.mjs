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

assert.equal(read("VERSION").trim(), "2.8.16", "migration must start from SignalDock 2.8.16");

let app = read("app.js");
assert.ok(app.includes('const APP_VERSION = "2.8.16";'), "unexpected APP_VERSION before migration");
assert.ok(app.includes("function markDatasetForAutosave()"), "recovery/autosave boundary already moved or missing");
assert.ok(app.includes("function updateDiagnostics()"), "diagnostics boundary already moved or missing");

app = replaceOnce(app, '  const APP_VERSION = "2.8.16";', '  const APP_VERSION = "2.8.17";', "APP_VERSION");
app = replaceOnce(
  app,
  "  let scheduleDatasetAutosave = () => {};\n  let scheduleViewAutosave = () => {};\n",
  "  let recoveryDiagnosticsController = null;\n",
  "autosave delegate slots"
);

const controllerWiring = `    if (!window.SignalDockRecoveryDiagnosticsController?.create) throw new Error("SignalDock Recovery/diagnostics controller is unavailable.");
    recoveryDiagnosticsController = window.SignalDockRecoveryDiagnosticsController.create({
      state,
      el,
      appVersion: APP_VERSION,
      getWorkspaceState: currentWorkspaceState,
      getViewState: currentViewState,
      getRecoveryAvailability: () => Boolean(window.SignalDockPersistence),
      getAutosaveEligibility: (entries) => window.SignalDockPersistence?.autosaveEligibility?.(entries) || null,
      saveRecoveryDataset: (entries, workspace, version) => window.SignalDockPersistence?.saveDataset?.(entries, workspace, version),
      saveRecoveryView: (view, settings) => window.SignalDockPersistence?.saveView?.(view, settings),
      getRecoveryInfo: () => window.SignalDockPersistence?.recoveryInfo?.() || Promise.resolve(null),
      loadRecovery: () => window.SignalDockPersistence?.loadRecovery?.() || Promise.resolve(null),
      clearRecovery: () => window.SignalDockPersistence?.clearRecovery?.() || Promise.resolve(),
      clearSearchCache: async () => {
        if (!window.SignalDockSearchCache) return { available: false };
        await window.SignalDockSearchCache.clear();
        return { available: true };
      },
      restoreWorkspacePayload,
      setProcessing,
      toast,
      getPerformanceSnapshot: () => profiler()?.snapshot?.() || null,
      copyText: (text) => utils().copyText(text),
      formatBytes: (value) => utils().formatBytes(value),
      canUseVirtualTable,
      getCapabilitySnapshot: () => ({
        indexedDB: Boolean(window.indexedDB),
        fileSystemAccess: typeof window.showOpenFilePicker === "function",
        performanceMemory: Boolean(performance.memory)
      })
    });
    recoveryDiagnosticsController.bind();
`;
app = replaceOnce(
  app,
  "    state.queryLibrary = window.SignalDockQueryLibrary?.load?.() || [];\n",
  `    state.queryLibrary = window.SignalDockQueryLibrary?.load?.() || [];\n${controllerWiring}`,
  "Recovery/diagnostics controller wiring"
);

const recoveryStart = app.indexOf("  function markDatasetForAutosave() {");
const restoreWorkspaceStart = app.indexOf("  async function restoreWorkspacePayload(", recoveryStart);
assert.ok(recoveryStart >= 0 && restoreWorkspaceStart > recoveryStart, "could not isolate recovery/autosave block");
const recoveryDelegates = `  function markDatasetForAutosave() { recoveryDiagnosticsController?.markDatasetForAutosave(); }

  function scheduleDatasetAutosave() { recoveryDiagnosticsController?.scheduleDatasetAutosave(); }

  function scheduleViewAutosave() { recoveryDiagnosticsController?.scheduleViewAutosave(); }

  function updateAutosaveStatus() { recoveryDiagnosticsController?.updateAutosaveStatus(); }

  function hideRecoveryBanner() { recoveryDiagnosticsController?.hideRecoveryBanner(); }

`;
app = app.slice(0, recoveryStart) + recoveryDelegates + app.slice(restoreWorkspaceStart);

const diagnosticsStart = app.indexOf("  function formatMetricMs(value) {");
const processingStart = app.indexOf("  function setProcessing(", diagnosticsStart);
assert.ok(diagnosticsStart >= 0 && processingStart > diagnosticsStart, "could not isolate diagnostics block");
app = app.slice(0, diagnosticsStart) + "  function updateDiagnostics() { recoveryDiagnosticsController?.updateDiagnostics(); }\n\n" + app.slice(processingStart);

app = replaceOnce(
  app,
  '    el.recoveryRestoreButton.addEventListener("click", restoreRecoverySnapshot);\n    el.recoveryDismissButton.addEventListener("click", dismissRecoverySnapshot);\n    el.clearRecoveryButton.addEventListener("click", clearRecoverySnapshot);\n    el.clearSearchCacheButton?.addEventListener("click", clearSearchCache);\n    el.copyDiagnosticsButton?.addEventListener("click", copyDiagnostics);\n',
  "",
  "root recovery/diagnostics listeners"
);
app = replaceOnce(
  app,
  '    scheduleDatasetAutosave = utils().debounce(() => autosaveDataset(), 1400);\n    scheduleViewAutosave = utils().debounce(() => autosaveView(), 450);\n',
  "",
  "root autosave debounce ownership"
);
app = replaceOnce(app, "    checkRecoverySnapshot();\n", "    void recoveryDiagnosticsController.checkRecoverySnapshot();\n", "recovery startup check");
write("app.js", app);

let html = read("index.html");
html = replaceOnce(
  html,
  '  <script src="src/app/command-navigation-controller.js" defer></script>\n',
  '  <script src="src/app/command-navigation-controller.js" defer></script>\n  <script src="src/app/recovery-diagnostics-controller.js" defer></script>\n',
  "controller script order"
);
write("index.html", html);

let sourceLayoutTest = read("tests/source-layout-smoke.mjs");
sourceLayoutTest = replaceOnce(
  sourceLayoutTest,
  '  "src/app/command-navigation-controller.js",\n',
  '  "src/app/command-navigation-controller.js",\n  "src/app/recovery-diagnostics-controller.js",\n',
  "source-layout controller list"
);
write("tests/source-layout-smoke.mjs", sourceLayoutTest);

const recoverySmoke = `import fs from "node:fs";
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
assert.ok(!/\\bfetch\\s*\\(/.test(controllerSource), "controller must not use fetch()");
assert.ok(!/\\bEventSource\\b/.test(controllerSource), "controller must not use EventSource");

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
`;
write("tests/recovery-diagnostics-controller-smoke.mjs", recoverySmoke);

write("VERSION", "2.8.17\n");

let readme = read("README.md").replaceAll("2.8.16", "2.8.17");
readme = replaceOnce(
  readme,
  "- feature-level Investigation controller under `src/app/` that owns evidence UI, local investigation import/export, Case Activity and Unified Timeline coordination through explicit callbacks\n",
  "- feature-level Recovery + Diagnostics controller under `src/app/` that owns recovery banner state, autosave orchestration, diagnostics rendering and support-copy UI while persistence/search-cache/browser capabilities remain root-injected callbacks\n- feature-level Investigation controller under `src/app/` that owns evidence UI, local investigation import/export, Case Activity and Unified Timeline coordination through explicit callbacks\n",
  "README controller feature"
);
write("README.md", readme);

let technical = read("docs/TECHNICAL.md");
technical = replaceOnce(technical, "Current version: **2.8.16**.", "Current version: **2.8.17**.", "technical version");
technical = replaceOnce(
  technical,
  "`command-navigation-controller.js` owns workspace navigation state, Command Palette definitions/rendering, keyboard interaction and dialog-to-navigation reset behavior. Feature execution stays behind injected root callbacks, so the controller receives no parser, worker, network, storage or filesystem capability.\n",
  "`command-navigation-controller.js` owns workspace navigation state, Command Palette definitions/rendering, keyboard interaction and dialog-to-navigation reset behavior. Feature execution stays behind injected root callbacks, so the controller receives no parser, worker, network, storage or filesystem capability.\n\n`recovery-diagnostics-controller.js` owns recovery-banner state, autosave scheduling/status, recovery UI actions, diagnostics rendering and support-detail copy orchestration. IndexedDB persistence, search-cache operations, workspace restoration and browser capability detection stay in the root/platform boundary and are supplied only through narrow callbacks.\n",
  "technical recovery boundary"
);
write("docs/TECHNICAL.md", technical);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout = replaceOnce(
  sourceLayout,
  "`settings-controller.js`, `command-navigation-controller.js`, `investigation-controller.js`",
  "`settings-controller.js`, `command-navigation-controller.js`, `recovery-diagnostics-controller.js`, `investigation-controller.js`",
  "source layout controller list"
);
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let srcReadme = read("src/README.md");
srcReadme = replaceOnce(
  srcReadme,
  "`app/command-navigation-controller.js` owns workspace navigation, Command Palette UI/keyboard behavior and navigation reset listeners while feature actions remain root-injected callbacks.\n",
  "`app/command-navigation-controller.js` owns workspace navigation, Command Palette UI/keyboard behavior and navigation reset listeners while feature actions remain root-injected callbacks.\n\n`app/recovery-diagnostics-controller.js` owns recovery/autosave UI orchestration and diagnostics rendering while persistence, search-cache, workspace-restore and browser capabilities remain root-injected callbacks.\n",
  "src README recovery boundary"
);
write("src/README.md", srcReadme);

let changelog = read("CHANGELOG.md");
const releaseNotes = `## 2.8.17 — 2026-09-17

### Recovery and diagnostics application boundary
- Extracted recovery banner state, autosave scheduling/status, recovery actions, search-cache clear orchestration, diagnostics rendering and support-detail copy behavior into \`src/app/recovery-diagnostics-controller.js\`.
- Kept IndexedDB persistence, search-cache capability access, browser capability detection and full \`restoreWorkspacePayload()\` orchestration in the root/platform boundary behind narrow injected callbacks.
- Moved recovery/diagnostics event listener ownership to idempotent \`bind()\` / \`destroy()\` lifecycle methods without changing local-first recovery semantics.

### Maintainability and verification
- Preserved existing dataset/filter/parser/search/cache/Case/Investigation/Recovery diagnostics while allowing diagnostics to render when browser memory metrics are unavailable.
- Added isolated recovery/diagnostics coverage, capability-boundary assertions, source-layout coverage and permanent HTTP smoke coverage.
- Preserved the zero-build, no-backend, no-telemetry and \`connect-src 'none'\` architecture.

`;
changelog = replaceOnce(changelog, "# Changelog\n\n", `# Changelog\n\n${releaseNotes}`, "changelog release insertion");
write("CHANGELOG.md", changelog);

const finalController = read("src/app/recovery-diagnostics-controller.js");
for (const token of ["SignalDockPersistence", "SignalDockSearchCache", "indexedDB", "showOpenFilePicker", "SignalDockDesktopBridge", "XMLHttpRequest", "WebSocket", ".invoke("]) assert.ok(!finalController.includes(token), `forbidden controller capability reference: ${token}`);
assert.ok(!/\bfetch\s*\(/.test(finalController), "forbidden controller fetch() capability");
assert.ok(read("index.html").indexOf("src/app/recovery-diagnostics-controller.js") < read("index.html").indexOf("app.js"), "controller must load before app.js");
assert.ok(!read("app.js").includes('el.recoveryRestoreButton.addEventListener("click"'), "root still owns recovery listener");
console.log("SignalDock v2.8.17 migration prepared successfully.");
