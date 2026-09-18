import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, content) => fs.writeFileSync(path.join(root, name), content);

function r1(source, before, after, label) {
  assert.ok(source.includes(before), "migration anchor missing: " + label);
  assert.equal(source.indexOf(before), source.lastIndexOf(before), "migration anchor ambiguous: " + label);
  return source.replace(before, after);
}

assert.equal(read("VERSION").trim(), "2.8.31");

let app = read("app.js");
app = r1(app, '  const APP_VERSION = "2.8.31";', '  const APP_VERSION = "2.8.32";', "APP_VERSION");
app = r1(
  app,
  '  let viewOrchestratorController = null;\n',
  '  let viewOrchestratorController = null;\n  let startupStateController = null;\n',
  "Startup State controller slot"
);

const registryInit = [
  '    if (!window.SignalDockElementRegistry?.create) throw new Error("SignalDock Element Registry is unavailable.");',
  '    Object.assign(el, window.SignalDockElementRegistry.create(document));'
].join("\n");
const startupWiring = [
  registryInit,
  '    if (!window.SignalDockStartupStateController?.create) throw new Error("SignalDock Startup State controller is unavailable.");',
  '    startupStateController = window.SignalDockStartupStateController.create({',
  '      state,',
  '      loadJson: (key, fallback) => utils().loadJson(key, fallback),',
  '      savedViewKeys: [STORAGE_VIEWS, "signaldock-saved-views-v2", "signaldock-saved-views-v1"],',
  '      settingsKeys: ["signaldock-settings-v1", "signaldock-settings-v2", "signaldock-settings-v3", "signaldock-settings-v5", "signaldock-settings-v6", "signaldock-settings-v8", STORAGE_SETTINGS],',
  '      activeProjectKey: "signaldock-active-project-v1",',
  '      createInvestigation: () => window.SignalDockInvestigation?.empty?.(),',
  '      createCase: (title) => window.SignalDockCaseWorkspace?.empty?.(title),',
  '      loadQueryLibrary: () => window.SignalDockQueryLibrary?.load?.(),',
  '      loadBaselineHistory: () => window.SignalDockBaselineManager?.loadHistory?.(),',
  '      loadProjects: () => window.SignalDockProjectManager?.load?.(),',
  '      normalizeCheckpoints: (items) => window.SignalDockCaseCheckpoints?.normalizeList?.(items)',
  '    });',
  '    startupStateController.hydratePreferences();'
].join("\n");
app = r1(app, registryInit, startupWiring, "Startup State wiring");

app = r1(
  app,
  '    state.savedViews = utils().loadJson(STORAGE_VIEWS, null) || utils().loadJson("signaldock-saved-views-v2", null) || utils().loadJson("signaldock-saved-views-v1", []);\n',
  '',
  "Saved Views hydration"
);
app = r1(
  app,
  '    state.settings = Object.assign(state.settings, utils().loadJson("signaldock-settings-v1", {}), utils().loadJson("signaldock-settings-v2", {}), utils().loadJson("signaldock-settings-v3", {}), utils().loadJson("signaldock-settings-v5", {}), utils().loadJson("signaldock-settings-v6", {}), utils().loadJson("signaldock-settings-v8", {}), utils().loadJson(STORAGE_SETTINGS, {}));\n',
  '',
  "Settings hydration"
);
app = r1(
  app,
  '    state.investigation = window.SignalDockInvestigation?.empty?.() || { title: "Investigation", summary: "", items: [] };\n    state.caseFile = window.SignalDockCaseWorkspace?.empty?.("Investigation") || { title: "Investigation", status: "open", severity: "none", findings: [] };\n    state.queryLibrary = window.SignalDockQueryLibrary?.load?.() || [];\n',
  '    startupStateController.hydrateInvestigation();\n',
  "Investigation startup hydration"
);
app = r1(
  app,
  '    state.baselineHistory = window.SignalDockBaselineManager?.loadHistory?.() || [];\n',
  '    startupStateController.hydrateBaselineHistory();\n',
  "Baseline startup hydration"
);
app = r1(
  app,
  '    state.projects = window.SignalDockProjectManager?.load?.() || [];\n    state.activeProjectId = String(utils().loadJson("signaldock-active-project-v1", "") || "");\n',
  '    startupStateController.hydrateProjects();\n',
  "Project startup hydration"
);
app = r1(
  app,
  '    state.caseCheckpoints = window.SignalDockCaseCheckpoints?.normalizeList?.([]) || [];\n',
  '    startupStateController.hydrateCaseCheckpoints();\n',
  "Checkpoint startup hydration"
);
write("app.js", app);

let html = read("index.html");
html = r1(
  html,
  '  <script src="src/app/element-registry.js" defer></script>\n  <script src="app.js" defer></script>',
  '  <script src="src/app/element-registry.js" defer></script>\n  <script src="src/app/startup-state-controller.js" defer></script>\n  <script src="app.js" defer></script>',
  "Startup State script"
);
write("index.html", html);

let layout = read("tests/source-layout-smoke.mjs");
layout = r1(
  layout,
  '  "src/app/element-registry.js",\n',
  '  "src/app/element-registry.js",\n  "src/app/startup-state-controller.js",\n',
  "source layout Startup State"
);
write("tests/source-layout-smoke.mjs", layout);
write("tests/startup-state-controller-smoke.mjs", "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst source = read(\"src/app/startup-state-controller.js\");\n\nassert.ok(html.includes(\"src/app/startup-state-controller.js\"));\nassert.ok(html.indexOf(\"src/app/startup-state-controller.js\") < html.indexOf(\"app.js\"));\nassert.ok(app.includes(\"SignalDockStartupStateController.create\"));\nfor (const token of [\n  \"hydratePreferences()\", \"hydrateInvestigation()\", \"hydrateBaselineHistory()\",\n  \"hydrateProjects()\", \"hydrateCaseCheckpoints()\"\n]) assert.ok(app.includes(\"startupStateController.\" + token), \"missing startup hydration call: \" + token);\n\nfor (const token of [\n  \"localStorage\", \"sessionStorage\", \"indexedDB\", \"showOpenFilePicker\",\n  \"SignalDockStorageAdapter\", \"SignalDockPersistence\", \"new Worker\", \".postMessage(\",\n  \"XMLHttpRequest\", \"WebSocket\", \"EventSource\", \".invoke(\"\n]) assert.ok(!source.includes(token), \"forbidden Startup State capability: \" + token);\nassert.ok(!/\\bfetch\\s*\\(/.test(source));\n\nconst loads = [];\nconst values = new Map([\n  [\"views-current\", null],\n  [\"views-v2\", [{ id:\"legacy-view\" }]],\n  [\"views-v1\", [{ id:\"oldest-view\" }]],\n  [\"settings-v1\", { wrap:true, parserProfile:\"auto\" }],\n  [\"settings-v2\", { compact:true }],\n  [\"settings-current\", { parserProfile:\"json\", autosave:false }],\n  [\"active-project\", \"project-7\"]\n]);\nconst state = {\n  savedViews: [],\n  settings: { wrap:false, compact:false, autosave:true, parserProfile:\"auto\" },\n  investigation:null,\n  caseFile:null,\n  queryLibrary:[],\n  baselineHistory:[],\n  projects:[],\n  activeProjectId:\"\",\n  caseCheckpoints:[]\n};\nconst host = {};\nvm.runInNewContext(source, { self:host, window:host, console, Object, String, Set }, { filename:\"startup-state-controller.js\" });\n\nlet investigationCalls=0;\nlet caseCalls=0;\nlet queryCalls=0;\nlet baselineCalls=0;\nlet projectCalls=0;\nlet checkpointCalls=0;\n\nconst controller = host.SignalDockStartupStateController.create({\n  state,\n  loadJson:(key,fallback)=>{\n    loads.push(key);\n    return values.has(key) ? values.get(key) : fallback;\n  },\n  savedViewKeys:[\"views-current\",\"views-v2\",\"views-v1\"],\n  settingsKeys:[\"settings-v1\",\"settings-v2\",\"settings-current\"],\n  activeProjectKey:\"active-project\",\n  createInvestigation:()=>{ investigationCalls += 1; return { title:\"Hydrated investigation\", items:[] }; },\n  createCase:(title)=>{ caseCalls += 1; assert.equal(title,\"Investigation\"); return { title, status:\"open\", findings:[] }; },\n  loadQueryLibrary:()=>{ queryCalls += 1; return [{ id:\"q1\" }]; },\n  loadBaselineHistory:()=>{ baselineCalls += 1; return [{ id:\"b1\" }]; },\n  loadProjects:()=>{ projectCalls += 1; return [{ id:\"project-7\" }]; },\n  normalizeCheckpoints:(items)=>{ checkpointCalls += 1; assert.deepEqual(items,[]); return [{ id:\"cp1\" }]; }\n});\n\nassert.equal(controller.hydratePreferences(), true);\nassert.equal(controller.hydratePreferences(), false);\nassert.deepEqual(state.savedViews,[{id:\"legacy-view\"}]);\nassert.equal(state.settings.wrap,true);\nassert.equal(state.settings.compact,true);\nassert.equal(state.settings.parserProfile,\"json\");\nassert.equal(state.settings.autosave,false);\nassert.deepEqual(loads.slice(0,5),[\"views-current\",\"views-v2\",\"settings-v1\",\"settings-v2\",\"settings-current\"]);\n\nassert.equal(controller.hydrateInvestigation(), true);\nassert.equal(controller.hydrateInvestigation(), false);\nassert.equal(investigationCalls,1);\nassert.equal(caseCalls,1);\nassert.equal(queryCalls,1);\nassert.equal(state.investigation.title,\"Hydrated investigation\");\nassert.equal(state.caseFile.title,\"Investigation\");\nassert.deepEqual(state.queryLibrary,[{id:\"q1\"}]);\n\nassert.equal(controller.hydrateBaselineHistory(), true);\nassert.equal(controller.hydrateBaselineHistory(), false);\nassert.equal(baselineCalls,1);\nassert.deepEqual(state.baselineHistory,[{id:\"b1\"}]);\n\nassert.equal(controller.hydrateProjects(), true);\nassert.equal(controller.hydrateProjects(), false);\nassert.equal(projectCalls,1);\nassert.deepEqual(state.projects,[{id:\"project-7\"}]);\nassert.equal(state.activeProjectId,\"project-7\");\n\nassert.equal(controller.hydrateCaseCheckpoints(), true);\nassert.equal(controller.hydrateCaseCheckpoints(), false);\nassert.equal(checkpointCalls,1);\nassert.deepEqual(state.caseCheckpoints,[{id:\"cp1\"}]);\n\nassert.ok(Object.isFrozen(controller));\nassert.ok(Object.isFrozen(host.SignalDockStartupStateController));\nconsole.log(\"startup-state-controller-smoke PASS\");\n");

write("VERSION", "2.8.32\n");
write("README.md", read("README.md").replaceAll("2.8.31", "2.8.32"));

let website = read("website/index.html").replaceAll("2.8.31", "2.8.32");
website = r1(
  website,
  '        <li>Declarative DOM registry replaces 255 inline startup lookups</li>\n        <li>Every registered UI ID is regression-checked against the shipped HTML</li>\n        <li>Startup composition is thinner without changing feature ownership</li>\n        <li>Application metadata now reflects traces, topology and incident evidence</li>',
  '        <li>Startup state hydration now has one explicit application owner</li>\n        <li>Saved Views and settings preserve legacy migration order without root storage glue</li>\n        <li>Investigation, baseline, project and checkpoint initialization is phase-idempotent</li>\n        <li>Startup composition is thinner while domain loaders stay injected and testable</li>',
  "website release highlights"
);
write("website/index.html", website);

let websiteTest = read("tests/website-production-smoke.mjs")
  .replace('assert.equal(version, "2.8.31");', 'assert.equal(version, "2.8.32");')
  .replace("SignalDock v2.8.31", "SignalDock v2.8.32");
write("tests/website-production-smoke.mjs", websiteTest);

let technical = read("docs/TECHNICAL.md").replace("Current version: **2.8.31**.", "Current version: **2.8.32**.");
technical += "\n\nStartup State controller: src/app/startup-state-controller.js owns phased initial hydration of Saved Views/settings, investigation/case/query defaults, baseline history, projects/active project and Case checkpoints. Loaders and domain factories are injected; the controller has no direct browser-storage, filesystem, worker or network capability. Each hydration phase is idempotent and remains invoked at the same startup point as the previous inline logic.\n";
write("docs/TECHNICAL.md", technical);

let srcReadme = read("src/README.md");
srcReadme += "\n\napp/startup-state-controller.js owns phased, idempotent application-state hydration while storage/domain loaders remain injected from the root composition boundary.\n";
write("src/README.md", srcReadme);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout += "\n\nStartup state application boundary: src/app/startup-state-controller.js owns initial Saved Views/settings, investigation/case/query, baseline, project and checkpoint hydration through explicit injected loaders. It must not acquire direct storage, filesystem, worker or network capabilities.\n";
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let changelog = read("CHANGELOG.md");
const notes = [
  "## 2.8.32 — 2026-09-18",
  "",
  "### Startup state composition",
  "- Added src/app/startup-state-controller.js as the explicit owner of phased initial application-state hydration.",
  "- Preserved Saved Views legacy fallback order and settings merge order while removing those storage-load expressions from app.js.",
  "- Moved investigation/case/query defaults, baseline history, projects/active project and Case checkpoint initialization behind injected, idempotent hydration phases.",
  "- Kept each hydration phase at the same startup point as before so controller binding and capability timing do not change.",
  "",
  ""
].join("\n");
changelog = r1(changelog, "# Changelog\n\n", "# Changelog\n\n" + notes, "changelog");
write("CHANGELOG.md", changelog);

const finalApp = read("app.js");
assert.ok(finalApp.includes("SignalDockStartupStateController.create"));
assert.ok(finalApp.includes("startupStateController.hydratePreferences();"));
assert.ok(finalApp.includes("startupStateController.hydrateInvestigation();"));
assert.ok(finalApp.includes("startupStateController.hydrateBaselineHistory();"));
assert.ok(finalApp.includes("startupStateController.hydrateProjects();"));
assert.ok(finalApp.includes("startupStateController.hydrateCaseCheckpoints();"));
assert.ok(!finalApp.includes('state.savedViews = utils().loadJson('));
assert.ok(!finalApp.includes('state.projects = window.SignalDockProjectManager?.load?.()'));
assert.ok(read("website/index.html").includes("SignalDock v2.8.32"));
console.log("SignalDock v2.8.32 migration prepared successfully.");
