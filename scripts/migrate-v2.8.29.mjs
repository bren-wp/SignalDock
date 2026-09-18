import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, content) => fs.writeFileSync(path.join(root, name), content);
function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), "migration anchor missing: " + label);
  assert.equal(source.indexOf(before), source.lastIndexOf(before), "migration anchor ambiguous: " + label);
  return source.replace(before, after);
}

assert.equal(read("VERSION").trim(), "2.8.28");

let app = read("app.js");
app = replaceOnce(app, '  const APP_VERSION = "2.8.28";', '  const APP_VERSION = "2.8.29";', "APP_VERSION");
app = replaceOnce(
  app,
  "  let commandNavigationController = null;\n",
  "  let commandNavigationController = null;\n  let interactionShellController = null;\n",
  "Interaction Shell controller slot"
);

const sessionBind = "    datasetSessionController.bind();";
const interactionWiring = [
  sessionBind,
  '    if (!window.SignalDockInteractionShellController?.create) throw new Error("SignalDock Interaction Shell controller is unavailable.");',
  '    interactionShellController = window.SignalDockInteractionShellController.create({',
  '      state,',
  '      el,',
  '      ownerDocument: document,',
  '      dialogs: [',
  '        el.settingsDialog, el.serviceMapDialog, el.serviceMatrixDialog, el.serviceHeatmapDialog,',
  '        el.serviceTrendsDialog, el.baselineDialog, el.projectDialog, el.traceExplorerDialog,',
  '        el.traceCompareDialog, el.traceOutlierDialog, el.queryLibraryDialog, el.healthDialog,',
  '        el.commandPaletteDialog, el.investigationDialog, el.exceptionDialog',
  '      ],',
  '      importLogs: () => el.fileInput?.click(),',
  '      focusSearch: () => { if (!el.queryInput?.disabled) el.queryInput?.focus(); },',
  '      closeInspector: () => closeInspector(),',
  '      applyFilters: (resetPage) => applyFilters(resetPage)',
  '    });',
  '    interactionShellController.bind();'
].join("\n");
app = replaceOnce(app, sessionBind, interactionWiring, "Interaction Shell wiring");

app = replaceOnce(app, "    bindEvents();\n", "", "root event binding removal");

const bindStart = app.indexOf("  function bindEvents() {");
const bindEnd = app.indexOf("  function syncWorkerIndex()", bindStart);
assert.ok(bindStart >= 0 && bindEnd > bindStart, "root bindEvents block missing");
app = app.slice(0, bindStart) + app.slice(bindEnd);

const dialogStart = app.indexOf("  function closeCompetingDialogs(exceptId = \"\") {");
const dialogEnd = app.indexOf("  function openCommandPalette()", dialogStart);
assert.ok(dialogStart >= 0 && dialogEnd > dialogStart, "root dialog helper block missing");
const dialogDelegates = [
  '  function closeCompetingDialogs(exceptId = "") { return interactionShellController?.closeCompetingDialogs(exceptId) || 0; }',
  '',
  '  function showDialogSafely(dialog) { return interactionShellController?.showDialogSafely(dialog) || false; }',
  '',
  ''
].join("\n");
app = app.slice(0, dialogStart) + dialogDelegates + app.slice(dialogEnd);
write("app.js", app);

let html = read("index.html");
html = replaceOnce(
  html,
  '  <script src="src/app/command-navigation-controller.js" defer></script>\n',
  '  <script src="src/app/command-navigation-controller.js" defer></script>\n  <script src="src/app/interaction-shell-controller.js" defer></script>\n',
  "Interaction Shell script"
);
write("index.html", html);

let layout = read("tests/source-layout-smoke.mjs");
layout = replaceOnce(
  layout,
  '  "src/app/command-navigation-controller.js",\n',
  '  "src/app/command-navigation-controller.js",\n  "src/app/interaction-shell-controller.js",\n',
  "source layout Interaction Shell"
);
write("tests/source-layout-smoke.mjs", layout);
write("tests/interaction-shell-controller-smoke.mjs", "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst source = read(\"src/app/interaction-shell-controller.js\");\n\nassert.ok(html.includes(\"src/app/interaction-shell-controller.js\"));\nassert.ok(html.indexOf(\"src/app/interaction-shell-controller.js\") < html.indexOf(\"app.js\"));\nassert.ok(app.includes(\"SignalDockInteractionShellController.create\"));\nassert.ok(app.includes(\"interactionShellController.bind();\"));\nassert.ok(!app.includes('document.addEventListener(\"keydown\"'));\nassert.ok(!app.includes(\"function bindEvents()\"));\nassert.ok(app.includes(\"interactionShellController?.closeCompetingDialogs\"));\nassert.ok(app.includes(\"interactionShellController?.showDialogSafely\"));\n\nfor (const token of [\n  \"SignalDockStorageAdapter\", \"SignalDockPersistence\", \"SignalDockQueryEngine\",\n  \"indexedDB\", \"localStorage\", \"sessionStorage\", \"showOpenFilePicker\",\n  \"new Worker\", \".postMessage(\", \"XMLHttpRequest\", \"WebSocket\", \"EventSource\", \".invoke(\"\n]) assert.ok(!source.includes(token), \"forbidden Interaction Shell capability: \" + token);\nassert.ok(!/\\bfetch\\s*\\(/.test(source));\n\nclass FakeDocument {\n  constructor() { this.activeElement = null; this.listeners = new Map(); }\n  addEventListener(type, handler) {\n    if (!this.listeners.has(type)) this.listeners.set(type, new Set());\n    this.listeners.get(type).add(handler);\n  }\n  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }\n}\nclass FakeDialog {\n  constructor(id) { this.id = id; this.open = false; this.attrs = new Set(); this.closeCount = 0; this.throwOnShow = false; }\n  hasAttribute(name) { return name === \"open\" && (this.open || this.attrs.has(\"open\")); }\n  setAttribute(name) { if (name === \"open\") { this.open = true; this.attrs.add(\"open\"); } }\n  removeAttribute(name) { if (name === \"open\") { this.open = false; this.attrs.delete(\"open\"); } }\n  close() { this.closeCount += 1; this.open = false; this.attrs.delete(\"open\"); }\n  showModal() {\n    if (this.throwOnShow) throw new Error(\"show failed\");\n    this.open = true;\n    this.attrs.add(\"open\");\n  }\n}\nfunction event(key, extra = {}) {\n  return {\n    key,\n    ctrlKey: false,\n    metaKey: false,\n    defaultPrevented: false,\n    target: extra.target || null,\n    preventDefault() { this.defaultPrevented = true; },\n    ...extra\n  };\n}\n\nconst doc = new FakeDocument();\nconst commandDialog = new FakeDialog(\"commandPaletteDialog\");\nconst settingsDialog = new FakeDialog(\"settingsDialog\");\nconst el = {\n  queryInput: { value: \"service:api\", disabled: false, ownerDocument: doc },\n  fileInput: {},\n  commandPaletteDialog: commandDialog,\n  settingsDialog\n};\nconst state = { selectedId: null };\nlet imports = 0;\nlet focuses = 0;\nlet closes = 0;\nlet filters = 0;\nconst host = { document: doc };\nvm.runInNewContext(source, { self: host, window: host, console, Object, String, Array, Boolean }, { filename: \"interaction-shell-controller.js\" });\n\nconst controller = host.SignalDockInteractionShellController.create({\n  state,\n  el,\n  ownerDocument: doc,\n  dialogs: [commandDialog, settingsDialog],\n  importLogs: () => { imports += 1; },\n  focusSearch: () => { focuses += 1; },\n  closeInspector: () => { closes += 1; state.selectedId = null; },\n  applyFilters: () => { filters += 1; }\n});\n\ncontroller.bind();\ncontroller.bind();\nassert.equal(doc.listeners.get(\"keydown\").size, 1, \"bind() must be idempotent\");\n\nconst alreadyHandled = event(\"Escape\", { defaultPrevented: true });\nassert.equal(controller.handleGlobalKeydown(alreadyHandled), false);\nassert.equal(el.queryInput.value, \"service:api\");\nassert.equal(closes, 0);\nassert.equal(filters, 0);\n\ncommandDialog.open = true;\nconst escapeWithModal = event(\"Escape\");\nassert.equal(controller.handleGlobalKeydown(escapeWithModal), false, \"open modal must own Escape\");\nassert.equal(el.queryInput.value, \"service:api\");\nassert.equal(filters, 0);\n\nconst ctrlFWithModal = event(\"f\", { ctrlKey: true });\nassert.equal(controller.handleGlobalKeydown(ctrlFWithModal), false, \"open modal must block global focus shortcut\");\nassert.equal(focuses, 0);\ncommandDialog.open = false;\n\nconst editable = { tagName: \"DIV\", isContentEditable: true };\nassert.equal(controller.handleGlobalKeydown(event(\"/\", { target: editable })), false);\nassert.equal(focuses, 0);\n\nconst slash = event(\"/\", { target: { tagName: \"DIV\", isContentEditable: false } });\nassert.equal(controller.handleGlobalKeydown(slash), true);\nassert.equal(slash.defaultPrevented, true);\nassert.equal(focuses, 1);\n\nconst openEvent = event(\"o\", { ctrlKey: true });\nassert.equal(controller.handleGlobalKeydown(openEvent), true);\nassert.equal(imports, 1);\n\nconst findEvent = event(\"f\", { metaKey: true });\nassert.equal(controller.handleGlobalKeydown(findEvent), true);\nassert.equal(focuses, 2);\n\nstate.selectedId = \"sd-1\";\nel.queryInput.value = \"keep-this-query\";\nconst inspectorEscape = event(\"Escape\");\nassert.equal(controller.handleGlobalKeydown(inspectorEscape), true);\nassert.equal(closes, 1);\nassert.equal(el.queryInput.value, \"keep-this-query\", \"Inspector Escape must not also clear query\");\n\nstate.selectedId = null;\nconst queryEscape = event(\"Escape\");\nassert.equal(controller.handleGlobalKeydown(queryEscape), true);\nassert.equal(el.queryInput.value, \"\");\nassert.equal(filters, 1);\n\ncommandDialog.open = true;\nsettingsDialog.open = true;\nassert.equal(controller.closeCompetingDialogs(\"settingsDialog\"), 1);\nassert.equal(commandDialog.open, false);\nassert.equal(settingsDialog.open, true);\n\nconst fallbackDialog = new FakeDialog(\"fallback\");\nfallbackDialog.throwOnShow = true;\nassert.equal(controller.showDialogSafely(fallbackDialog), true);\nassert.equal(fallbackDialog.open, true);\n\ncontroller.destroy();\nassert.equal(doc.listeners.get(\"keydown\").size, 0);\nconsole.log(\"interaction-shell-controller-smoke PASS\");\n");
write("tests/website-production-smoke.mjs", "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst websiteDir = path.join(root, \"website\");\nconst readWebsite = (name) => fs.readFileSync(path.join(websiteDir, name), \"utf8\");\nconst home = readWebsite(\"index.html\");\nconst privacy = readWebsite(\"privacy.html\");\nconst security = readWebsite(\"security.html\");\nconst css = readWebsite(\"styles.css\");\nconst version = fs.readFileSync(path.join(root, \"VERSION\"), \"utf8\").trim();\n\nassert.equal(version, \"2.8.29\");\n\nfor (const [name, html] of [[\"index.html\", home], [\"privacy.html\", privacy], [\"security.html\", security]]) {\n  assert.ok(html.includes('class=\"skip-link\"'), name + \" missing skip link\");\n  assert.ok(html.includes(\"script-src 'none'\"), name + \" missing script-src none\");\n  assert.ok(html.includes(\"connect-src 'none'\"), name + \" missing connect-src none\");\n  assert.ok(html.includes('rel=\"stylesheet\" href=\"styles.css\"'), name + \" missing local stylesheet\");\n  assert.ok(!/<script\\b/i.test(html), name + \" must remain script-free\");\n  assert.ok(!/\\sstyle\\s*=/i.test(html), name + \" must not use inline styles\");\n  assert.ok(!/(?:src|href)=[\"']https?:\\/\\//i.test(html), name + \" must not use external runtime resources\");\n}\n\nfor (const token of [\n  '<meta name=\"application-name\" content=\"SignalDock\">',\n  'id=\"security\"',\n  'id=\"formats\"',\n  'id=\"faq\"',\n  'SignalDock v2.8.29',\n  'href=\"privacy.html\"',\n  'href=\"security.html\"'\n]) assert.ok(home.includes(token), \"homepage token missing: \" + token);\n\nassert.ok((home.match(/<details>/g) || []).length >= 6, \"FAQ should expose at least six script-free questions\");\nassert.ok(home.includes(\"Does SignalDock upload my logs?\"));\nassert.ok(privacy.includes(\"No telemetry endpoint\"));\nassert.ok(privacy.includes(\"Explicit exports\"));\nassert.ok(security.includes(\"Authenticated worker protocol\"));\nassert.ok(security.includes(\"No generic native bridge\"));\n\nfor (const token of [\n  \".skip-link\", \":focus-visible\", \"overflow-x:auto\",\n  \"@media (prefers-reduced-motion: reduce)\", \".faq-grid\", \".faq-grid details\", \".faq-grid summary\"\n]) assert.ok(css.includes(token), \"website CSS token missing: \" + token);\n\nassert.ok(!/\\.site-header nav\\s*\\{[^}]*display\\s*:\\s*none/is.test(css), \"responsive website nav must remain reachable\");\nconsole.log(\"website-production-smoke PASS\");\n");

let audit = read("tests/static-audit.mjs");
audit = replaceOnce(
  audit,
  'const websiteHtml = fs.readFileSync(path.join(root, "website", "index.html"), "utf8");',
  'const websiteDir = path.join(root, "website");\nconst websiteHtmlEntries = fs.readdirSync(websiteDir).filter((name) => name.endsWith(".html")).sort().map((name) => ["website/" + name, fs.readFileSync(path.join(websiteDir, name), "utf8")]);',
  "static audit website collection"
);
audit = replaceOnce(
  audit,
  'for (const [name, html] of [["index.html", appHtml], ["website/index.html", websiteHtml]]) {',
  'for (const [name, html] of [["index.html", appHtml], ...websiteHtmlEntries]) {',
  "static audit HTML loop"
);
audit = replaceOnce(
  audit,
  'verifyLocalRefs(websiteHtml, path.join(root, "website"), "website/index.html");',
  'for (const [name, html] of websiteHtmlEntries) verifyLocalRefs(html, websiteDir, name);',
  "static audit local website refs"
);
write("tests/static-audit.mjs", audit);

let website = read("website/index.html").replaceAll("2.8.28", "2.8.29");
website = replaceOnce(
  website,
  '      <a href="#workflow">Workflow</a>\n',
  '      <a href="#workflow">Workflow</a>\n      <a href="#faq">FAQ</a>\n',
  "website FAQ navigation"
);
website = replaceOnce(
  website,
  '    <section class="release-strip" aria-labelledby="release-title">',
  "\n    <section class=\"faq section-shell\" id=\"faq\" aria-labelledby=\"faq-title\">\n      <div class=\"section-head section-head--wide\">\n        <span class=\"eyebrow\">QUESTIONS BEFORE YOU LOAD A FILE</span>\n        <h2 id=\"faq-title\">Local-first, without hidden assumptions.</h2>\n        <p>SignalDock is intentionally explicit about what it can observe, what stays local and where browser capabilities begin and end.</p>\n      </div>\n      <div class=\"faq-grid\">\n        <details>\n          <summary>Does SignalDock upload my logs?</summary>\n          <p>No SignalDock backend is required for ordinary analysis. The shipped application CSP keeps <code>connect-src 'none'</code>, and production audits reject runtime network primitives.</p>\n        </details>\n        <details>\n          <summary>Do I need an account or API key?</summary>\n          <p>No. Local log, trace, case and workspace workflows do not require a SignalDock account or API credential.</p>\n        </details>\n        <details>\n          <summary>What happens when I save a workspace?</summary>\n          <p>A portable <code>.sdsession</code> file is created through an explicit save action. Portable exports do not carry live browser file-handle capabilities.</p>\n        </details>\n        <details>\n          <summary>Can SignalDock follow a changing local file?</summary>\n          <p>Live Tail is available in supported browsers through an explicit local file capability. The file remains local to the browser session.</p>\n        </details>\n        <details>\n          <summary>How are case attachments handled?</summary>\n          <p>Case attachments are metadata-only references. SignalDock does not embed arbitrary attachment file contents into the Case Workspace record.</p>\n        </details>\n        <details>\n          <summary>Is the website itself tracking visitors?</summary>\n          <p>The bundled static website is script-free, uses no analytics runtime and carries the same no-connection CSP boundary.</p>\n        </details>\n      </div>\n    </section>\n" + '\n    <section class="release-strip" aria-labelledby="release-title">',
  "website FAQ section"
);
website = replaceOnce(
  website,
  '        <li>Cleaner query/topology filter orchestration</li>\n        <li>Bounded case import and explicit export cancellation</li>\n        <li>Authenticated local worker routing with stale-response guards</li>\n        <li>Responsive, keyboard-accessible static website with no marketing scripts</li>',
  '        <li>Centralized global shortcuts and dialog exclusivity</li>\n        <li>Command Palette Escape no longer leaks into query/Inspector actions</li>\n        <li>Dedicated Privacy and Security website pages under the same static CSP</li>\n        <li>All website HTML pages are now covered by the production static audit</li>',
  "website release highlights"
);
website = replaceOnce(
  website,
  '    <span>Private observability on your machine.</span>\n    <span>v2.8.29 · local-first · zero telemetry</span>',
  '    <span><a href="privacy.html">Privacy</a> · <a href="security.html">Security</a> · <a href="#faq">FAQ</a></span>\n    <span>v2.8.29 · local-first · zero telemetry</span>',
  "website footer links"
);
write("website/index.html", website);

let websiteCss = read("website/styles.css");
websiteCss += "\n\n.faq { padding-top:64px; }\n.faq-grid {\n  display:grid;\n  grid-template-columns:1fr 1fr;\n  gap:12px;\n}\n.faq-grid details {\n  border:1px solid var(--line);\n  border-radius:13px;\n  background:linear-gradient(180deg,rgba(15,31,48,.8),rgba(8,18,29,.8));\n}\n.faq-grid summary {\n  position:relative;\n  padding:20px 48px 20px 20px;\n  cursor:pointer;\n  color:#dceef3;\n  font-size:12px;\n  font-weight:800;\n  list-style:none;\n}\n.faq-grid summary::-webkit-details-marker { display:none; }\n.faq-grid summary::after {\n  content:\"+\";\n  position:absolute;\n  right:20px;\n  top:17px;\n  color:var(--cyan);\n  font:800 18px ui-monospace,monospace;\n}\n.faq-grid details[open] summary::after { content:\"−\"; }\n.faq-grid details p {\n  margin:0;\n  padding:0 20px 20px;\n  color:#7f96a9;\n  font-size:11px;\n  line-height:1.72;\n}\n.faq-grid code { color:#79e6ee; }\nfooter a:not(.logo) { color:#88a3b5; }\nfooter a:not(.logo):hover { color:#dffcff; }\n@media (max-width:720px) {\n  .faq-grid { grid-template-columns:1fr; }\n}\n";
write("website/styles.css", websiteCss);

write("VERSION", "2.8.29\n");
write("README.md", read("README.md").replaceAll("2.8.28", "2.8.29"));

let technical = read("docs/TECHNICAL.md").replace("Current version: **2.8.28**.", "Current version: **2.8.29**.");
technical += "\n\nInteraction Shell controller: root-level file/search shortcuts, Escape behavior and generic dialog exclusivity are isolated under src/app/interaction-shell-controller.js. It ignores already-prevented events and does not leak global shortcuts into open dialogs or contenteditable fields. Command Palette ownership remains in command-navigation-controller.js.\n\nWebsite assurance: website/privacy.html and website/security.html are script-free static surfaces. The static audit now checks every website HTML file for inline code, external runtime resources and broken local references. The homepage includes a native-details FAQ with no JavaScript dependency.\n";
write("docs/TECHNICAL.md", technical);

let srcReadme = read("src/README.md");
srcReadme += "\n\napp/interaction-shell-controller.js owns global keyboard shortcuts and generic dialog exclusivity while feature-specific navigation and Command Palette state remain separate.\n";
write("src/README.md", srcReadme);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout += "\n\nInteraction shell application boundary: src/app/interaction-shell-controller.js owns global keyboard shortcuts and dialog exclusivity without direct storage, worker, filesystem or network capabilities.\n";
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let changelog = read("CHANGELOG.md");
const notes = [
  "## 2.8.29 — 2026-09-18",
  "",
  "### Interaction shell + website assurance",
  "- Extracted global file/search shortcuts, Escape handling and generic dialog exclusivity into src/app/interaction-shell-controller.js.",
  "- Fixed an event-order bug where an Escape already handled by Command Palette could still close the Inspector or clear the active query in the old root keydown listener.",
  "- Global Ctrl/Cmd+O, Ctrl/Cmd+F and slash search shortcuts now stay out of open dialogs; slash also respects contenteditable targets.",
  "- Added dedicated script-free website Privacy and Security pages plus a native-details FAQ on the homepage.",
  "- Expanded the production static audit from website/index.html to every HTML page under website/.",
  "",
  ""
].join("\n");
changelog = replaceOnce(changelog, "# Changelog\n\n", "# Changelog\n\n" + notes, "changelog");
write("CHANGELOG.md", changelog);

const shell = read("src/app/interaction-shell-controller.js");
for (const token of ["SignalDockStorageAdapter", "SignalDockPersistence", "SignalDockQueryEngine", "indexedDB", "localStorage", "showOpenFilePicker", "new Worker", ".postMessage(", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("]) {
  assert.ok(!shell.includes(token), "forbidden Interaction Shell capability: " + token);
}
assert.ok(!/\bfetch\s*\(/.test(shell));
const finalApp = read("app.js");
assert.ok(finalApp.includes("SignalDockInteractionShellController.create"));
assert.ok(finalApp.includes("interactionShellController.bind();"));
assert.ok(!finalApp.includes('document.addEventListener("keydown"'));
assert.ok(!finalApp.includes("function bindEvents()"));
assert.ok(read("website/index.html").includes("SignalDock v2.8.29"));
console.log("SignalDock v2.8.29 migration prepared successfully.");
