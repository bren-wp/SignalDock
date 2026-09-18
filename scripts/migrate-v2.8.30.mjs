import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(name)=>fs.readFileSync(path.join(root,name),"utf8");
const write=(name,content)=>fs.writeFileSync(path.join(root,name),content);
function r1(source,before,after,label){
  assert.ok(source.includes(before),"migration anchor missing: "+label);
  assert.equal(source.indexOf(before),source.lastIndexOf(before),"migration anchor ambiguous: "+label);
  return source.replace(before,after);
}
function replaceBlock(source,startMarker,endMarker,replacement,label){
  const start=source.indexOf(startMarker);
  const end=source.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start,"migration block missing: "+label);
  return source.slice(0,start)+replacement+source.slice(end);
}

assert.equal(read("VERSION").trim(),"2.8.29");

let settings=read("src/app/settings-controller.js");
settings=r1(
  settings,
  '    const scheduleViewAutosave = options.scheduleViewAutosave || (() => {});\n',
  '    const scheduleViewAutosave = options.scheduleViewAutosave || (() => {});\n    const readParserProfilesText = options.readParserProfilesText;\n    const maxParserProfilesImportBytes = Math.max(1024, Number(options.maxParserProfilesImportBytes) || (4 * 1024 * 1024));\n',
  "Settings reader options"
);
settings=r1(
  settings,
  '    if (!document) throw new Error("Settings controller requires a document context.");\n',
  '    if (!document) throw new Error("Settings controller requires a document context.");\n    if (typeof readParserProfilesText !== "function") throw new Error("Settings controller requires readParserProfilesText().");\n',
  "Settings reader requirement"
);
settings=r1(
  settings,
  '    function updateCustomParserVisibility() {\n',
  [
    '    function currentCustomParserProfile() {',
    '      return {',
    '        pattern: String(state.settings.customParserPattern || "").trim(),',
    '        flags: String(state.settings.customParserFlags || "i").replace(/[^imsu]/g, "")',
    '      };',
    '    }',
    '',
    '    function updateCustomParserVisibility() {',
    ''
  ].join("\n"),
  "Settings current parser profile"
);

const settingsImport=[
  '    async function importParserProfiles(event) {',
  '      const profilesApi = getParserProfiles();',
  '      const file = event?.target?.files?.[0];',
  '      if (!file || !profilesApi) return false;',
  '      const size = Math.max(0, Number(file.size) || 0);',
  '      if (size > maxParserProfilesImportBytes) {',
  '        toast("Parser profile file exceeds the 4 MB safety limit.", "error", 6500);',
  '        if (event?.target) event.target.value = "";',
  '        return false;',
  '      }',
  '      try {',
  '        const text = await readParserProfilesText(file, maxParserProfilesImportBytes);',
  '        const profiles = profilesApi.importJson(text);',
  '        refreshSavedParserProfiles();',
  '        toast("Imported " + profiles.length + " parser profile" + (profiles.length === 1 ? "" : "s") + ".");',
  '        return true;',
  '      } catch (error) {',
  '        toast("Could not import parser profiles: " + (error?.message || error), "error", 6500);',
  '        return false;',
  '      } finally {',
  '        if (event?.target) event.target.value = "";',
  '      }',
  '    }',
  ''
].join("\n");
settings=replaceBlock(
  settings,
  "    async function importParserProfiles(event) {",
  "    function onSettingControl(event) {",
  settingsImport,
  "Settings parser profile import"
);
settings=r1(
  settings,
  '      updateCustomParserVisibility,\n      refreshSavedParserProfiles,\n      bind,\n',
  '      updateCustomParserVisibility,\n      refreshSavedParserProfiles,\n      currentCustomParserProfile,\n      importParserProfiles,\n      bind,\n',
  "Settings public API"
);
write("src/app/settings-controller.js",settings);

let app=read("app.js");
app=r1(app,'  const APP_VERSION = "2.8.29";','  const APP_VERSION = "2.8.30";',"version");
app=r1(
  app,
  '  let interactionShellController = null;\n',
  '  let interactionShellController = null;\n  let viewOrchestratorController = null;\n',
  "View Orchestrator slot"
);

const interactionBind='    interactionShellController.bind();';
const viewWiring=[
  interactionBind,
  '    if (!window.SignalDockViewOrchestratorController?.create) throw new Error("SignalDock View Orchestrator controller is unavailable.");',
  '    viewOrchestratorController = window.SignalDockViewOrchestratorController.create({',
  '      state,',
  '      ownerDocument: document,',
  '      rebuildFilterIndex: () => datasetFilterController?.rebuildFilterIndex(),',
  '      updateStats: () => datasetOverviewController?.updateStats(),',
  '      refreshFilters: () => datasetFilterController?.refreshFilters(),',
  '      renderSavedViews: () => savedViewsController?.render(),',
  '      setControlsEnabled: (enabled) => datasetFilterController?.setControlsEnabled(enabled),',
  '      applyFilters: (resetPage) => datasetFilterController?.applyFilters(resetPage),',
  '      renderTimeline: () => datasetOverviewController?.renderTimeline(),',
  '      renderTable: () => tableViewController?.renderTable(),',
  '      renderInspector: () => inspectorController?.render(),',
  '      updateActiveSourceUI: () => datasetOverviewController?.updateActiveSourceUI()',
  '    });'
].join("\n");
app=r1(app,interactionBind,viewWiring,"View Orchestrator wiring");

app=r1(
  app,
  '      showDialogSafely,\n      scheduleViewAutosave: () => scheduleViewAutosave()\n    });',
  [
    '      showDialogSafely,',
    '      scheduleViewAutosave: () => scheduleViewAutosave(),',
    '      maxParserProfilesImportBytes: 4 * 1024 * 1024,',
    '      readParserProfilesText: async (file, maxBytes) => {',
    '        if (!window.SignalDockStorageAdapter?.readTextFile) throw new Error("Local parser-profile reader is unavailable.");',
    '        const result = await window.SignalDockStorageAdapter.readTextFile(file, maxBytes);',
    '        return result.text;',
    '      }',
    '    });'
  ].join("\n"),
  "Settings Storage Adapter injection"
);

app=r1(app,'      settings: openSettings,\n','      settings: () => settingsController?.open(),\n',"navigation settings callback");
app=r1(app,'    applySettings();\n    refreshSavedParserProfiles();\n','    settingsController?.apply();\n    settingsController?.refreshSavedParserProfiles();\n',"settings init delegates");

const renderDelegates=[
  '  function renderEverything() { return viewOrchestratorController?.renderEverything(); }',
  '',
  '  function renderDataViews() { return viewOrchestratorController?.renderDataViews(); }',
  '',
  ''
].join("\n");
app=replaceBlock(app,"  function renderEverything() {","  function updateStats()",renderDelegates,"render orchestration");

app=r1(
  app,
  '  function syncLevelChips(level) {\n    document.querySelectorAll("[data-level]").forEach((button) => button.classList.toggle("is-active", button.dataset.level === level));\n  }',
  '  function syncLevelChips(level) { return viewOrchestratorController?.syncLevelChips(level); }',
  "level chip orchestration"
);

app=replaceBlock(app,"  function makeUiButton(","  function renderCaseWorkspace(", "", "dead UI button factory");
app=replaceBlock(app,"  async function importCaseJson(event) {","  function entryRowIntoView(", "", "obsolete Case import delegate");
app=replaceBlock(app,"  function refreshSavedParserProfiles(","  function closeCompetingDialogs(", "", "dead parser-profile root wrappers");
app=replaceBlock(app,"  function openCommandPalette() {","  function currentCustomParserProfile() {", "", "dead command/settings root wrappers");

const parserDelegate=[
  '  function currentCustomParserProfile() {',
  '    return settingsController?.currentCustomParserProfile?.() || {',
  '      pattern: String(state.settings.customParserPattern || "").trim(),',
  '      flags: String(state.settings.customParserFlags || "i").replace(/[^imsu]/g, "")',
  '    };',
  '  }',
  '',
  ''
].join("\n");
app=replaceBlock(app,"  function currentCustomParserProfile() {","  function currentViewState()",parserDelegate,"current parser profile delegate");
write("app.js",app);

let html=read("index.html");
html=r1(
  html,
  '  <script src="src/app/interaction-shell-controller.js" defer></script>\n',
  '  <script src="src/app/interaction-shell-controller.js" defer></script>\n  <script src="src/app/view-orchestrator-controller.js" defer></script>\n',
  "View Orchestrator script"
);
write("index.html",html);

let layout=read("tests/source-layout-smoke.mjs");
layout=r1(
  layout,
  '  "src/app/interaction-shell-controller.js",\n',
  '  "src/app/interaction-shell-controller.js",\n  "src/app/view-orchestrator-controller.js",\n',
  "source layout View Orchestrator"
);
write("tests/source-layout-smoke.mjs",layout);
write("tests/view-orchestrator-controller-smoke.mjs","import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst source = read(\"src/app/view-orchestrator-controller.js\");\n\nassert.ok(html.includes(\"src/app/view-orchestrator-controller.js\"));\nassert.ok(html.indexOf(\"src/app/view-orchestrator-controller.js\") < html.indexOf(\"app.js\"));\nassert.ok(app.includes(\"SignalDockViewOrchestratorController.create\"));\nassert.ok(app.includes(\"viewOrchestratorController?.renderEverything\"));\nassert.ok(app.includes(\"viewOrchestratorController?.renderDataViews\"));\nassert.ok(app.includes(\"viewOrchestratorController?.syncLevelChips\"));\n\nfor (const token of [\n  \"SignalDockQueryEngine\", \"SignalDockStorageAdapter\", \"SignalDockPersistence\",\n  \"SignalDockFilterWorkerController\", \"indexedDB\", \"localStorage\", \"sessionStorage\",\n  \"showOpenFilePicker\", \"new Worker\", \".postMessage(\", \"XMLHttpRequest\", \"WebSocket\",\n  \"EventSource\", \".invoke(\"\n]) assert.ok(!source.includes(token), \"forbidden View Orchestrator capability: \" + token);\nassert.ok(!/\\bfetch\\s*\\(/.test(source));\n\nconst chips = [\n  { dataset:{ level:\"ERROR\" }, classList:{ active:false, toggle(name,on){ if(name===\"is-active\") this.active=on; } } },\n  { dataset:{ level:\"WARN\" }, classList:{ active:false, toggle(name,on){ if(name===\"is-active\") this.active=on; } } }\n];\nconst ownerDocument = { querySelectorAll(selector){ assert.equal(selector,\"[data-level]\"); return chips; } };\nconst state = { entries:[{id:1}], filterEntries:[] };\nconst calls = [];\nconst host = {};\nvm.runInNewContext(source,{self:host,window:host,console,Object,Boolean},{filename:\"view-orchestrator-controller.js\"});\n\nconst controller = host.SignalDockViewOrchestratorController.create({\n  state,\n  ownerDocument,\n  rebuildFilterIndex:()=>{ calls.push(\"rebuild\"); state.filterEntries=[{}]; },\n  updateStats:()=>calls.push(\"stats\"),\n  refreshFilters:()=>calls.push(\"filters\"),\n  renderSavedViews:()=>calls.push(\"saved\"),\n  setControlsEnabled:(enabled)=>calls.push(\"controls:\"+enabled),\n  applyFilters:(reset)=>calls.push(\"apply:\"+reset),\n  renderTimeline:()=>calls.push(\"timeline\"),\n  renderTable:()=>calls.push(\"table\"),\n  renderInspector:()=>calls.push(\"inspector\"),\n  updateActiveSourceUI:()=>calls.push(\"source\")\n});\n\ncontroller.renderEverything();\nassert.deepEqual(calls.slice(0,6),[\"rebuild\",\"stats\",\"filters\",\"saved\",\"controls:true\",\"apply:false\"]);\ncalls.length=0;\ncontroller.renderEverything();\nassert.deepEqual(calls,[\"stats\",\"filters\",\"saved\",\"controls:true\",\"apply:false\"],\"existing filter index must not rebuild\");\n\ncalls.length=0;\ncontroller.renderDataViews();\nassert.deepEqual(calls,[\"timeline\",\"table\",\"inspector\",\"source\"]);\n\ncontroller.syncLevelChips(\"WARN\");\nassert.equal(chips[0].classList.active,false);\nassert.equal(chips[1].classList.active,true);\nassert.ok(Object.isFrozen(controller));\nassert.ok(Object.isFrozen(host.SignalDockViewOrchestratorController));\nconsole.log(\"view-orchestrator-controller-smoke PASS\");\n");
write("tests/settings-controller-capability-smoke.mjs","import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),\"..\");\nconst read=(name)=>fs.readFileSync(path.join(root,name),\"utf8\");\nconst app=read(\"app.js\");\nconst source=read(\"src/app/settings-controller.js\");\n\nassert.ok(!source.includes(\"file.text()\"),\"Settings controller must not read files directly\");\nassert.ok(source.includes(\"maxParserProfilesImportBytes\"));\nassert.ok(source.includes(\"currentCustomParserProfile\"));\nassert.ok(app.includes(\"SignalDockStorageAdapter.readTextFile\"),\"root must inject Storage Adapter parser-profile reads\");\nfor(const token of [\"showOpenFilePicker\",\"new Worker\",\".postMessage(\",\"XMLHttpRequest\",\"WebSocket\",\"EventSource\",\".invoke(\"]) assert.ok(!source.includes(token),token);\nassert.ok(!/\\bfetch\\s*\\(/.test(source));\n\nclass Select {\n  constructor(){this.value=\"\";this.children=[];}\n  replaceChildren(...children){this.children=children;}\n}\nconst doc={\n  body:{classList:{toggle(){}}},\n  createElement(tag){return {tagName:tag.toUpperCase(),value:\"\",textContent:\"\"};}\n};\nconst state={\n  entries:[],\n  renderMode:\"paged\",\n  settings:{\n    wrap:false,compact:false,showUnknown:true,useWorker:true,autosave:true,\n    parserProfile:\"custom\",\n    customParserPattern:\"  ^(?<message>.+)$  \",\n    customParserFlags:\"imx!\"\n  }\n};\nconst savedSelect=new Select();\nconst el={\n  settingsDialog:{ownerDocument:doc},\n  savedParserProfile:savedSelect,\n  deleteParserProfileButton:{disabled:false},\n  savedParserName:{value:\"\"},\n  parserProfile:{value:\"custom\"},\n  customParserPattern:{value:\"\"},\n  customParserFlags:{value:\"\"},\n  wrapToggle:{checked:false},compactToggle:{checked:false},unknownToggle:{checked:true},workerToggle:{checked:true},autosaveToggle:{checked:true}\n};\nlet readerCalls=0;\nlet importedText=\"\";\nconst notices=[];\nconst profiles={\n  load:()=>[],\n  importJson:(text)=>{importedText=text;return [{id:\"p1\",name:\"Imported\",pattern:\".+\",flags:\"i\"}];}\n};\nconst host={document:doc};\nvm.runInNewContext(source,{self:host,window:host,console,Object,String,Number,Math,Boolean,Promise,Date},{filename:\"settings-controller.js\"});\nconst controller=host.SignalDockSettingsController.create({\n  state,el,\n  getUtils:()=>({saveJson(){}}),\n  getParserProfiles:()=>profiles,\n  toast:(message)=>notices.push(message),\n  applyFilters:()=>{},\n  markDatasetForAutosave:()=>{},\n  updateAutosaveStatus:()=>{},\n  updateDiagnostics:()=>{},\n  closeCompetingDialogs:()=>{},\n  showDialogSafely:()=>true,\n  scheduleViewAutosave:()=>{},\n  maxParserProfilesImportBytes:4*1024*1024,\n  readParserProfilesText:async(file,maxBytes)=>{readerCalls++;assert.equal(maxBytes,4*1024*1024);return file.payload;}\n});\n\nconst currentProfile=controller.currentCustomParserProfile(); assert.equal(currentProfile.pattern,\"^(?<message>.+)$\"); assert.equal(currentProfile.flags,\"im\");\n\nconst tooLargeTarget={files:[{name:\"huge.json\",size:4*1024*1024+1,payload:\"bad\"}],value:\"x\"};\nassert.equal(await controller.importParserProfiles({target:tooLargeTarget}),false);\nassert.equal(readerCalls,0,\"oversized profile import must fail before read\");\nassert.equal(tooLargeTarget.value,\"\");\n\nconst input={files:[{name:\"profiles.json\",size:1024,payload:'{\"profiles\":[]}'}],value:\"x\"};\nassert.equal(await controller.importParserProfiles({target:input}),true);\nassert.equal(readerCalls,1);\nassert.equal(importedText,'{\"profiles\":[]}');\nassert.equal(input.value,\"\");\nassert.ok(notices.some((message)=>message.includes(\"Imported 1 parser profile\")));\nconsole.log(\"settings-controller-capability-smoke PASS\");\n");

let settingsTest=read("tests/settings-controller-smoke.mjs");
settingsTest=r1(
  settingsTest,
  'assert.ok(app.includes("function currentCustomParserProfile()"), "parser execution profile must remain in root app");',
  'assert.ok(app.includes("function currentCustomParserProfile()"), "parser execution profile delegate must remain available to parser callbacks");\nassert.ok(controller.includes("currentCustomParserProfile"), "Settings controller must own custom parser profile normalization");\nassert.ok(!controller.includes("file.text()"), "Settings controller must not read parser-profile files directly");\nassert.ok(app.includes("SignalDockStorageAdapter.readTextFile"), "root must inject Storage Adapter reads for parser-profile import");',
  "settings ownership assertions"
);
write("tests/settings-controller-smoke.mjs",settingsTest);

let css=read("styles.css");
css += '\n\n/* mobile viewport, safe-area and touch hardening */\n@media (max-width: 760px) {\n  .app-frame { min-height: 100dvh; grid-template-rows: calc(58px + env(safe-area-inset-top)) auto; }\n  .topbar { padding-top: env(safe-area-inset-top); padding-left: max(12px, env(safe-area-inset-left)); padding-right: max(12px, env(safe-area-inset-right)); }\n  .sidebar { padding-left: max(10px, env(safe-area-inset-left)); padding-right: max(10px, env(safe-area-inset-right)); }\n  .inspector { left: max(8px, env(safe-area-inset-left)); right: max(8px, env(safe-area-inset-right)); bottom: max(8px, env(safe-area-inset-bottom)); max-height: min(78dvh, calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom))); }\n  .toast-region { right: max(8px, env(safe-area-inset-right)); bottom: max(8px, env(safe-area-inset-bottom)); }\n}\n@media (pointer: coarse) {\n  :where(button, [role="button"], summary) { touch-action: manipulation; }\n  .query-actions .button, .command-button, .pagination .icon-button { min-width: 44px; min-height: 44px; }\n}\n';
write("styles.css",css);

let production=read("tests/production-ui-polish-smoke.mjs");
production=r1(
  production,
  'assert.ok(!css.includes(".nav-list { display: none; }"), "mobile navigation must remain reachable");',
  'assert.ok(!css.includes(".nav-list { display: none; }"), "mobile navigation must remain reachable");\nfor (const token of ["min-height: 100dvh", "env(safe-area-inset-top)", "env(safe-area-inset-bottom)", "@media (pointer: coarse)", "touch-action: manipulation"]) assert.ok(css.includes(token), "mobile production token missing: " + token);',
  "mobile production assertions"
);
write("tests/production-ui-polish-smoke.mjs",production);

let website=read("website/index.html").replaceAll("2.8.29","2.8.30");
website=r1(
  website,
  '        <li>Centralized global shortcuts and dialog exclusivity</li>\n        <li>Command Palette Escape no longer leaks into query/Inspector actions</li>\n        <li>Dedicated Privacy and Security website pages under the same static CSP</li>\n        <li>All website HTML pages are now covered by the production static audit</li>',
  '        <li>Centralized render orchestration with thinner root composition</li>\n        <li>Parser-profile imports now use bounded Storage Adapter reads</li>\n        <li>Mobile layout restores dynamic viewport height and iOS safe-area handling</li>\n        <li>Coarse-pointer controls get stronger touch targets without changing desktop density</li>',
  "website release highlights"
);
write("website/index.html",website);

let websiteTest=read("tests/website-production-smoke.mjs").replace('assert.equal(version, "2.8.29");','assert.equal(version, "2.8.30");').replace("SignalDock v2.8.29","SignalDock v2.8.30");
write("tests/website-production-smoke.mjs",websiteTest);

write("VERSION","2.8.30\n");
write("README.md",read("README.md").replaceAll("2.8.29","2.8.30"));

let technical=read("docs/TECHNICAL.md").replace("Current version: **2.8.29**.","Current version: **2.8.30**.");
technical += "\n\nView Orchestrator controller: high-level full-view and data-view render sequencing plus level-chip UI synchronization are isolated under src/app/view-orchestrator-controller.js. Domain analysis and rendering remain owned by their existing controllers through injected callbacks.\n\nSettings capability hardening: parser-profile imports no longer call file.text() inside Settings. A 4 MB pre-read guard is enforced and text is supplied through a root-injected Storage Adapter callback. Custom parser profile normalization is now owned by Settings with a thin root delegate for parser callbacks.\n\nMobile hardening: the application keeps dynamic viewport height at mobile breakpoints, honors iOS safe-area insets for topbar/Inspector/toasts and increases key coarse-pointer action targets without changing desktop density.\n";
write("docs/TECHNICAL.md",technical);

let srcReadme=read("src/README.md");
srcReadme += "\n\napp/view-orchestrator-controller.js owns high-level render sequencing and level-chip synchronization. Settings parser-profile file reads are injected from the platform boundary rather than performed directly inside app/settings-controller.js.\n";
write("src/README.md",srcReadme);

let sourceLayout=read("docs/SOURCE-LAYOUT.md");
sourceLayout += "\n\nView orchestration application boundary: src/app/view-orchestrator-controller.js coordinates full/data render passes and level-chip UI synchronization without direct parser, storage, worker, filesystem or network capabilities.\n";
write("docs/SOURCE-LAYOUT.md",sourceLayout);

let changelog=read("CHANGELOG.md");
const notes=[
  "## 2.8.30 — 2026-09-18",
  "",
  "### View orchestration + settings capability hardening",
  "- Extracted full-view/data-view render sequencing and level-chip synchronization into src/app/view-orchestrator-controller.js.",
  "- Removed unused root glue for parser-profile actions, Command Palette wrappers, a dead UI button factory and the obsolete Case import delegate.",
  "- Parser-profile imports now enforce a 4 MB safety limit before read and receive file text through the root-injected Storage Adapter instead of calling file.text() in Settings.",
  "- Custom parser profile normalization is owned by Settings while parser callbacks retain a thin root delegate.",
  "- Restored 100dvh semantics on mobile and added safe-area handling for the topbar, Inspector and toast region plus larger key touch targets on coarse pointers.",
  "",
  ""
].join("\n");
changelog=r1(changelog,"# Changelog\n\n","# Changelog\n\n"+notes,"changelog");
write("CHANGELOG.md",changelog);

const finalSettings=read("src/app/settings-controller.js");
assert.ok(!finalSettings.includes("file.text()"));
assert.ok(finalSettings.includes("maxParserProfilesImportBytes"));
const finalApp=read("app.js");
assert.ok(finalApp.includes("SignalDockViewOrchestratorController.create"));
assert.ok(finalApp.includes("SignalDockStorageAdapter.readTextFile"));
assert.ok(!finalApp.includes("function makeUiButton("));
assert.ok(!finalApp.includes("function openCommandPalette("));
assert.ok(read("website/index.html").includes("SignalDock v2.8.30"));
console.log("SignalDock v2.8.30 migration prepared successfully.");
