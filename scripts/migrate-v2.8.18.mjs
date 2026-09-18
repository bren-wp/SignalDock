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

assert.equal(read("VERSION").trim(), "2.8.17", "migration must start from SignalDock 2.8.17");

let app = read("app.js");
assert.ok(app.includes('const APP_VERSION = "2.8.17";'), "unexpected APP_VERSION before migration");
assert.ok(app.includes("function saveCurrentView()"), "Saved Views boundary already moved or missing");
assert.ok(app.includes("function renderSavedViews()"), "Saved Views rendering boundary already moved or missing");

app = replaceOnce(app, '  const APP_VERSION = "2.8.17";', '  const APP_VERSION = "2.8.18";', "APP_VERSION");
app = replaceOnce(
  app,
  "  let recoveryDiagnosticsController = null;\n",
  "  let recoveryDiagnosticsController = null;\n  let savedViewsController = null;\n",
  "Saved Views controller slot"
);

const savedViewsLoad = '    state.savedViews = utils().loadJson(STORAGE_VIEWS, null) || utils().loadJson("signaldock-saved-views-v2", null) || utils().loadJson("signaldock-saved-views-v1", []);';
const savedViewsWiring = [
  savedViewsLoad,
  '    if (!window.SignalDockSavedViewsController?.create) throw new Error("SignalDock Saved Views controller is unavailable.");',
  '    savedViewsController = window.SignalDockSavedViewsController.create({',
  '      state,',
  '      el,',
  '      persistSavedViews: (views) => utils().saveJson(STORAGE_VIEWS, views),',
  '      requestName: (message, suggested) => window.prompt(message, suggested),',
  '      createViewId: () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,',
  '      getShortSource: (value) => utils().shortSource(value),',
  '      syncLevelChips,',
  '      applyFilters,',
  '      toast',
  '    });',
  '    savedViewsController.bind();'
].join("\n");
app = replaceOnce(app, savedViewsLoad, savedViewsWiring, "Saved Views controller wiring");

app = replaceOnce(app, '    el.saveViewButton.addEventListener("click", saveCurrentView);\n', "", "save-view listener ownership");
app = replaceOnce(app, '    el.savedList.addEventListener("click", onSavedViewsClick);\n', "", "saved-list listener ownership");

const savedStart = app.indexOf("  function saveCurrentView() {");
const syncStart = app.indexOf("  function syncLevelChips(level) {", savedStart);
assert.ok(savedStart >= 0 && syncStart > savedStart, "could not isolate Saved Views block");
const savedDelegates = [
  "  function saveCurrentView() { savedViewsController?.saveCurrentView(); }",
  "",
  '  function buildViewName() { return savedViewsController?.buildViewName() || "My log view"; }',
  "",
  "  function renderSavedViews() { savedViewsController?.render(); }",
  "",
  ""
].join("\n");
app = app.slice(0, savedStart) + savedDelegates + app.slice(syncStart);
write("app.js", app);

let html = read("index.html");
html = replaceOnce(
  html,
  '  <script src="src/app/recovery-diagnostics-controller.js" defer></script>\n',
  '  <script src="src/app/recovery-diagnostics-controller.js" defer></script>\n  <script src="src/app/saved-views-controller.js" defer></script>\n',
  "Saved Views controller script order"
);
write("index.html", html);

let sourceLayoutTest = read("tests/source-layout-smoke.mjs");
sourceLayoutTest = replaceOnce(
  sourceLayoutTest,
  '  "src/app/recovery-diagnostics-controller.js",\n',
  '  "src/app/recovery-diagnostics-controller.js",\n  "src/app/saved-views-controller.js",\n',
  "source-layout Saved Views controller list"
);
write("tests/source-layout-smoke.mjs", sourceLayoutTest);

let accessibilityTest = read("tests/accessibility-production-smoke.mjs");
accessibilityTest = replaceOnce(
  accessibilityTest,
  'const commandNavigationController = read("src/app/command-navigation-controller.js");\n',
  'const commandNavigationController = read("src/app/command-navigation-controller.js");\nconst savedViewsController = read("src/app/saved-views-controller.js");\n',
  "accessibility Saved Views owner"
);
accessibilityTest = replaceOnce(
  accessibilityTest,
  'assert.ok(app.includes(\'remove.setAttribute("aria-label", \`Delete saved view ${view.name}\`)\'));\n',
  'assert.ok(savedViewsController.includes(\'remove.setAttribute("aria-label", \`Delete saved view ${view.name}\`)\'));\n',
  "accessibility Saved Views assertion"
);
write("tests/accessibility-production-smoke.mjs", accessibilityTest);

const savedViewsSmoke = "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst controllerSource = read(\"src/app/saved-views-controller.js\");\n\nassert.ok(html.includes('src/app/saved-views-controller.js'), \"Saved Views controller missing from index.html\");\nassert.ok(html.indexOf('src/app/saved-views-controller.js') < html.indexOf('app.js'), \"Saved Views controller must load before app.js\");\nassert.ok(app.includes(\"SignalDockSavedViewsController.create\"), \"Saved Views controller factory wiring missing\");\nassert.ok(app.includes(\"savedViewsController.bind();\"), \"Saved Views controller bind() missing\");\nassert.ok(!app.includes('el.saveViewButton.addEventListener(\"click\", saveCurrentView)'), \"root still owns save-view listener\");\nassert.ok(!app.includes('el.savedList.addEventListener(\"click\", onSavedViewsClick)'), \"root still owns saved-list listener\");\nfor (const token of [\"saveCurrentView\", \"buildViewName\", \"render\", \"onListClick\", \"function bind()\", \"function destroy()\"]) {\n  assert.ok(controllerSource.includes(token), `controller missing expected ownership token: ${token}`);\n}\nfor (const token of [\"localStorage\", \"sessionStorage\", \"SignalDockPersistence\", \"SignalDockSearchCache\", \"indexedDB\", \"showOpenFilePicker\", \"SignalDockDesktopBridge\", \"XMLHttpRequest\", \"WebSocket\", \"EventSource\", \".invoke(\"]) {\n  assert.ok(!controllerSource.includes(token), `forbidden capability reference in Saved Views controller: ${token}`);\n}\nassert.ok(!/\\bfetch\\s*\\(/.test(controllerSource), \"Saved Views controller must not use fetch()\");\n\nclass FakeNode {\n  constructor(document) {\n    this.ownerDocument = document;\n    this.hidden = false;\n    this.textContent = \"\";\n    this.className = \"\";\n    this.title = \"\";\n    this.type = \"\";\n    this.value = \"\";\n    this.dataset = {};\n    this.children = [];\n    this.options = [];\n    this.selectedIndex = 0;\n    this.listeners = new Map();\n    this.attributes = new Map();\n  }\n  addEventListener(type, handler) { this.listeners.set(type, handler); }\n  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }\n  replaceChildren(...nodes) { this.children = [...nodes]; }\n  append(...nodes) { this.children.push(...nodes); }\n  appendChild(node) { this.children.push(node); return node; }\n  setAttribute(name, value) { this.attributes.set(name, String(value)); }\n}\nconst document = {\n  createElement: () => new FakeNode(document),\n  createElementNS: () => new FakeNode(document)\n};\nconst select = (values, value = values[0] || \"\") => {\n  const node = new FakeNode(document);\n  node.options = values.map(([optionValue, textContent]) => ({ value: optionValue, textContent }));\n  node.value = value;\n  node.selectedIndex = Math.max(0, node.options.findIndex((option) => option.value === value));\n  return node;\n};\nconst rootGlobal = {};\nconst context = { self: rootGlobal, window: rootGlobal, console };\nvm.runInNewContext(controllerSource, context, { filename: \"saved-views-controller.js\" });\n\nconst state = { entries: [{}], savedViews: [], queryLibrary: [{ id: \"query-1\" }] };\nconst el = {\n  saveViewButton: new FakeNode(document),\n  savedList: new FakeNode(document),\n  savedCount: new FakeNode(document),\n  queryInput: new FakeNode(document),\n  levelFilter: select([[\"\", \"All\"], [\"ERROR\", \"Error\"]], \"ERROR\"),\n  sourceFilter: select([[\"\", \"All\"], [\"api.log\", \"api.log\"]], \"api.log\"),\n  timeFilter: select([[\"\", \"All\"], [\"15m\", \"Last 15 minutes\"]], \"15m\"),\n  sortFilter: select([[\"original\", \"Original\"], [\"newest\", \"Newest\"]], \"newest\")\n};\nel.queryInput.value = \"timeout\";\nlet persisted = 0;\nlet applied = 0;\nconst controller = rootGlobal.SignalDockSavedViewsController.create({\n  state,\n  el,\n  ownerDocument: document,\n  persistSavedViews: () => { persisted += 1; },\n  requestName: () => \"Error view\",\n  createViewId: () => \"view-1\",\n  getShortSource: (value) => value,\n  syncLevelChips: () => {},\n  applyFilters: () => { applied += 1; },\n  toast: () => {}\n});\n\ncontroller.bind();\ncontroller.bind();\nassert.equal(el.saveViewButton.listeners.size, 1, \"bind() must be idempotent\");\nassert.equal(el.savedList.listeners.size, 1, \"saved-list listener must be singular\");\n\ncontroller.saveCurrentView();\nassert.equal(state.savedViews.length, 1);\nassert.equal(state.savedViews[0].id, \"view-1\");\nassert.equal(state.savedViews[0].name, \"Error view\");\nassert.equal(persisted, 1);\nassert.equal(el.savedList.children.length, 1);\nassert.equal(el.savedCount.textContent, \"1\");\n\nel.queryInput.value = \"\";\nel.levelFilter.value = \"\";\nel.sourceFilter.value = \"\";\nel.timeFilter.value = \"\";\nel.sortFilter.value = \"original\";\ncontroller.onListClick({\n  target: {\n    closest(selector) {\n      return selector === \"[data-view-id]\" ? { dataset: { viewId: \"view-1\" } } : null;\n    }\n  }\n});\nassert.equal(el.queryInput.value, \"timeout\");\nassert.equal(el.levelFilter.value, \"ERROR\");\nassert.equal(el.sourceFilter.value, \"api.log\");\nassert.equal(el.timeFilter.value, \"15m\");\nassert.equal(el.sortFilter.value, \"newest\");\nassert.equal(applied, 1);\n\ncontroller.onListClick({\n  target: {\n    closest(selector) {\n      return selector === \"[data-delete-view]\" ? { dataset: { deleteView: \"view-1\" } } : null;\n    }\n  }\n});\nassert.equal(state.savedViews.length, 0);\nassert.equal(persisted, 2);\n\ncontroller.destroy();\nassert.equal(el.saveViewButton.listeners.size, 0, \"destroy() must remove save-view listener\");\nassert.equal(el.savedList.listeners.size, 0, \"destroy() must remove saved-list listener\");\n\nconsole.log(\"saved-views-controller-smoke PASS\");\n";
write("tests/saved-views-controller-smoke.mjs", savedViewsSmoke);
write("VERSION", "2.8.18\n");

let readme = read("README.md").replaceAll("2.8.17", "2.8.18");
readme = replaceOnce(
  readme,
  "- feature-level Recovery + Diagnostics controller under `src/app/` that owns recovery banner state, autosave orchestration, diagnostics rendering and support-copy UI while persistence/search-cache/browser capabilities remain root-injected callbacks\n",
  "- feature-level Recovery + Diagnostics controller under `src/app/` that owns recovery banner state, autosave orchestration, diagnostics rendering and support-copy UI while persistence/search-cache/browser capabilities remain root-injected callbacks\n- feature-level Saved Views controller under `src/app/` that owns legacy quick-view creation/render/apply/delete UI while local persistence, prompt/ID generation and filter execution remain root-injected callbacks\n",
  "README Saved Views feature"
);
write("README.md", readme);

let technical = read("docs/TECHNICAL.md");
technical = replaceOnce(technical, "Current version: **2.8.17**.", "Current version: **2.8.18**.", "technical version");
technical = replaceOnce(
  technical,
  "`recovery-diagnostics-controller.js` owns recovery-banner state, autosave scheduling/status, recovery UI actions, diagnostics rendering and support-detail copy orchestration. IndexedDB persistence, search-cache operations, workspace restoration and browser capability detection stay in the root/platform boundary and are supplied only through narrow callbacks.\n",
  "`recovery-diagnostics-controller.js` owns recovery-banner state, autosave scheduling/status, recovery UI actions, diagnostics rendering and support-detail copy orchestration. IndexedDB persistence, search-cache operations, workspace restoration and browser capability detection stay in the root/platform boundary and are supplied only through narrow callbacks.\n\n`saved-views-controller.js` owns the legacy quick Saved Views UI lifecycle: naming, bounded state updates, rendering, apply/delete actions and listener ownership. Loading/persisting view JSON, generating IDs, prompting and executing filter work remain root-injected callbacks so the controller receives no storage, worker, filesystem or network capability.\n",
  "technical Saved Views boundary"
);
write("docs/TECHNICAL.md", technical);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout = replaceOnce(
  sourceLayout,
  "`command-navigation-controller.js`, `recovery-diagnostics-controller.js`, `investigation-controller.js`",
  "`command-navigation-controller.js`, `recovery-diagnostics-controller.js`, `saved-views-controller.js`, `investigation-controller.js`",
  "source layout Saved Views controller list"
);
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let srcReadme = read("src/README.md");
srcReadme = replaceOnce(
  srcReadme,
  "`app/recovery-diagnostics-controller.js` owns recovery/autosave UI orchestration and diagnostics rendering while persistence, search-cache, workspace-restore and browser capabilities remain root-injected callbacks.\n",
  "`app/recovery-diagnostics-controller.js` owns recovery/autosave UI orchestration and diagnostics rendering while persistence, search-cache, workspace-restore and browser capabilities remain root-injected callbacks.\n\n`app/saved-views-controller.js` owns quick Saved Views naming, rendering, apply/delete behavior and UI listeners while JSON persistence, prompt/ID generation and filter execution remain root-injected callbacks.\n",
  "src README Saved Views boundary"
);
write("src/README.md", srcReadme);

let changelog = read("CHANGELOG.md");
const releaseNotes = [
  "## 2.8.18 — 2026-09-18",
  "",
  "### Saved Views application boundary",
  "- Extracted legacy quick Saved Views creation, naming, rendering, apply/delete behavior and event-listener ownership into `src/app/saved-views-controller.js`.",
  "- Kept local JSON loading/persistence, prompt/ID generation and actual filter execution in the root/application boundary behind narrow injected callbacks.",
  "- Retained the existing 24-view cap and current filter/source/time/sort restoration semantics without introducing a second state store.",
  "",
  "### Maintainability and verification",
  "- Added isolated Saved Views controller lifecycle/state/apply/delete coverage and capability-boundary assertions.",
  "- Updated permanent source-layout and HTTP smoke gates for the new controller.",
  "- Preserved the zero-build, local-first, no-backend, no-telemetry and `connect-src 'none'` architecture.",
  "",
  ""
].join("\n");
changelog = replaceOnce(changelog, "# Changelog\n\n", "# Changelog\n\n" + releaseNotes, "changelog release insertion");
write("CHANGELOG.md", changelog);

const finalController = read("src/app/saved-views-controller.js");
for (const token of ["localStorage", "sessionStorage", "SignalDockPersistence", "SignalDockSearchCache", "indexedDB", "showOpenFilePicker", "SignalDockDesktopBridge", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("]) {
  assert.ok(!finalController.includes(token), `forbidden Saved Views controller capability reference: ${token}`);
}
assert.ok(!/\bfetch\s*\(/.test(finalController), "forbidden Saved Views controller fetch() capability");
assert.ok(read("index.html").indexOf("src/app/saved-views-controller.js") < read("index.html").indexOf("app.js"), "Saved Views controller must load before app.js");
assert.ok(!read("app.js").includes('el.saveViewButton.addEventListener("click", saveCurrentView)'), "root still owns save-view listener");
assert.ok(!read("app.js").includes('el.savedList.addEventListener("click", onSavedViewsClick)'), "root still owns saved-list listener");
console.log("SignalDock v2.8.18 migration prepared successfully.");
