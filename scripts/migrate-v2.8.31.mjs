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
function replaceBlock(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "migration block missing: " + label);
  return source.slice(0, start) + replacement + source.slice(end);
}

assert.equal(read("VERSION").trim(), "2.8.30");

let app = read("app.js");
app = replaceOnce(app, '  const APP_VERSION = "2.8.30";', '  const APP_VERSION = "2.8.31";', "APP_VERSION");
app = replaceOnce(app, '  const $ = (id) => document.getElementById(id);\n', '', "legacy element lookup helper");

const registryInit = [
  '    if (!window.SignalDockElementRegistry?.create) throw new Error("SignalDock Element Registry is unavailable.");',
  '    Object.assign(el, window.SignalDockElementRegistry.create(document));',
  ''
].join("\n");
app = replaceBlock(app, '    Object.assign(el, {', '    state.savedViews =', registryInit, "legacy inline element registry");
write("app.js", app);

let html = read("index.html");
html = replaceOnce(
  html,
  '  <meta name="description" content="SignalDock is a private, local-first log inspection workspace for JSON, NDJSON, LOG, TXT and ZIP files.">',
  '  <meta name="description" content="SignalDock is a private, local-first observability workspace for logs, traces, service relationships and incident evidence.">',
  "app meta description"
);
html = replaceOnce(
  html,
  '  <script src="src/app/case-checkpoint-controller.js" defer></script>\n  <script src="app.js" defer></script>',
  '  <script src="src/app/case-checkpoint-controller.js" defer></script>\n  <script src="src/app/element-registry.js" defer></script>\n  <script src="app.js" defer></script>',
  "element registry script"
);
write("index.html", html);

let layout = read("tests/source-layout-smoke.mjs");
layout = replaceOnce(
  layout,
  '  "src/app/view-orchestrator-controller.js",\n',
  '  "src/app/view-orchestrator-controller.js",\n  "src/app/element-registry.js",\n',
  "source layout element registry"
);
write("tests/source-layout-smoke.mjs", layout);
write("tests/element-registry-smoke.mjs", "import fs from \"node:fs\";\nimport path from \"node:path\";\nimport assert from \"node:assert/strict\";\nimport vm from \"node:vm\";\nimport { fileURLToPath } from \"node:url\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\nconst read = (name) => fs.readFileSync(path.join(root, name), \"utf8\");\nconst html = read(\"index.html\");\nconst app = read(\"app.js\");\nconst source = read(\"src/app/element-registry.js\");\n\nassert.ok(html.includes('src/app/element-registry.js'));\nassert.ok(html.indexOf('src/app/element-registry.js') < html.indexOf('app.js'));\nassert.ok(app.includes(\"SignalDockElementRegistry.create(document)\"));\nassert.ok(!app.includes('const $ = (id) => document.getElementById(id);'));\nassert.ok(!app.includes(\"Object.assign(el, {\"));\n\nfor (const token of [\n  \"SignalDockStorageAdapter\", \"SignalDockPersistence\", \"SignalDockQueryEngine\",\n  \"indexedDB\", \"localStorage\", \"sessionStorage\", \"showOpenFilePicker\",\n  \"new Worker\", \".postMessage(\", \"XMLHttpRequest\", \"WebSocket\", \"EventSource\", \".invoke(\"\n]) assert.ok(!source.includes(token), \"forbidden element-registry capability: \" + token);\nassert.ok(!/\\bfetch\\s*\\(/.test(source));\n\nconst htmlIds = [...html.matchAll(/\\bid=\"([^\"]+)\"/g)].map((match) => match[1]);\nconst counts = new Map();\nfor (const id of htmlIds) counts.set(id, (counts.get(id) || 0) + 1);\n\nconst requested = [];\nconst document = {\n  getElementById(id) {\n    requested.push(id);\n    return { id };\n  }\n};\nconst host = { document };\nvm.runInNewContext(source, { self:host, window:host, console, Object }, { filename:\"element-registry.js\" });\n\nconst api = host.SignalDockElementRegistry;\nassert.ok(api);\nassert.ok(Object.isFrozen(api));\nassert.ok(Object.isFrozen(api.ELEMENT_IDS));\nassert.equal(api.ELEMENT_IDS.length, 255);\nassert.equal(new Set(api.ELEMENT_IDS).size, api.ELEMENT_IDS.length, \"registry IDs must be unique\");\n\nfor (const id of api.ELEMENT_IDS) {\n  assert.equal(counts.get(id), 1, \"registered element must exist exactly once in index.html: \" + id);\n}\n\nconst registry = api.create(document);\nassert.ok(Object.isFrozen(registry));\nassert.equal(Object.keys(registry).length, 255);\nassert.equal(requested.length, 255);\nfor (const id of api.ELEMENT_IDS) assert.equal(registry[id].id, id);\n\nconst unregisteredHtmlIds = htmlIds.filter((id) => !api.ELEMENT_IDS.includes(id));\nassert.ok(unregisteredHtmlIds.length < htmlIds.length, \"registry coverage sanity check failed\");\nconsole.log(\"element-registry-smoke PASS\");\n");

let foundation = read("tests/static-foundation-ui-smoke.mjs");
foundation = replaceOnce(
  foundation,
  'const tableViewController = read("src/app/table-view-controller.js");\n',
  'const tableViewController = read("src/app/table-view-controller.js");\nconst elementRegistry = read("src/app/element-registry.js");\n',
  "foundation element registry source"
);
foundation = replaceOnce(
  foundation,
  'for (const token of [\n  \'queryLibraryBulkCount: $("queryLibraryBulkCount")\',\n  \'baselineHistoryList: $("baselineHistoryList")\'\n]) assert.ok(app.includes(token), `static app registry binding missing: ${token}`);',
  'assert.ok(app.includes("SignalDockElementRegistry.create(document)"), "static app must initialize the declarative element registry");\nfor (const id of ["queryLibraryBulkCount", "baselineHistoryList"]) assert.ok(elementRegistry.includes("\\\"" + id + "\\\""), "static element registry binding missing: " + id);',
  "foundation registry ownership"
);
write("tests/static-foundation-ui-smoke.mjs", foundation);

let uiFoundations = read("tests/ui-foundations-smoke.mjs");
uiFoundations = replaceOnce(
  uiFoundations,
  'const app = fs.readFileSync(path.join(root, "app.js"), "utf8");\n',
  'const app = fs.readFileSync(path.join(root, "app.js"), "utf8");\nconst elementRegistry = fs.readFileSync(path.join(root, "src/app/element-registry.js"), "utf8");\n',
  "UI foundations element registry source"
);
uiFoundations = replaceOnce(
  uiFoundations,
  'const required = [\n  "baselineHistoryList",\n  "touchWorkspace",\n',
  'const required = [\n  "touchWorkspace",\n',
  "UI foundations root token ownership"
);
uiFoundations = replaceOnce(
  uiFoundations,
  'for (const token of required) {\n  if (!app.includes(token)) throw new Error(\`Missing UI foundation token: \${token}\`);\n}\n',
  'for (const token of required) {\n  if (!app.includes(token)) throw new Error(\`Missing UI foundation token: \${token}\`);\n}\nif (!elementRegistry.includes("\\\"baselineHistoryList\\\"")) throw new Error("Missing UI foundation element-registry token: baselineHistoryList");\n',
  "UI foundations registry assertion"
);
write("tests/ui-foundations-smoke.mjs", uiFoundations);

write("VERSION", "2.8.31\n");
write("README.md", read("README.md").replaceAll("2.8.30", "2.8.31"));

let website = read("website/index.html").replaceAll("2.8.30", "2.8.31");
website = replaceOnce(
  website,
  '        <li>Centralized render orchestration with thinner root composition</li>\n        <li>Parser-profile imports now use bounded Storage Adapter reads</li>\n        <li>Mobile layout restores dynamic viewport height and iOS safe-area handling</li>\n        <li>Coarse-pointer controls get stronger touch targets without changing desktop density</li>',
  '        <li>Declarative DOM registry replaces 255 inline startup lookups</li>\n        <li>Every registered UI ID is regression-checked against the shipped HTML</li>\n        <li>Startup composition is thinner without changing feature ownership</li>\n        <li>Application metadata now reflects traces, topology and incident evidence</li>',
  "website release highlights"
);
write("website/index.html", website);

let websiteTest = read("tests/website-production-smoke.mjs")
  .replace('assert.equal(version, "2.8.30");', 'assert.equal(version, "2.8.31");')
  .replace("SignalDock v2.8.30", "SignalDock v2.8.31");
write("tests/website-production-smoke.mjs", websiteTest);

let technical = read("docs/TECHNICAL.md").replace("Current version: **2.8.30**.", "Current version: **2.8.31**.");
technical += "\n\nElement Registry: the 255 application DOM references are declared under src/app/element-registry.js rather than assembled inline inside init(). The registry has no storage, worker, filesystem or network capabilities, and its smoke test requires every registered ID to exist exactly once in index.html. Root startup now performs one explicit registry creation step before controller composition.\n";
write("docs/TECHNICAL.md", technical);

let srcReadme = read("src/README.md");
srcReadme += "\n\napp/element-registry.js is the declarative application DOM registry. It resolves the shipped element IDs from an explicit document context and carries no feature or platform capabilities.\n";
write("src/README.md", srcReadme);

let sourceLayout = read("docs/SOURCE-LAYOUT.md");
sourceLayout += "\n\nElement registry boundary: src/app/element-registry.js owns the declarative list of application DOM IDs and lookup creation. Tests require every registered ID to exist exactly once in index.html.\n";
write("docs/SOURCE-LAYOUT.md", sourceLayout);

let changelog = read("CHANGELOG.md");
const notes = [
  "## 2.8.31 — 2026-09-18",
  "",
  "### Startup composition + DOM integrity",
  "- Replaced 255 inline document.getElementById lookups in app.js startup with src/app/element-registry.js.",
  "- Added a registry smoke test that requires every registered application ID to exist exactly once in index.html and rejects duplicate registry IDs.",
  "- Removed the legacy root $() lookup helper and reduced init() to one explicit element-registry creation step before controller composition.",
  "- Updated the application description to reflect traces, service relationships and incident evidence in addition to local logs.",
  "",
  ""
].join("\n");
changelog = replaceOnce(changelog, "# Changelog\n\n", "# Changelog\n\n" + notes, "changelog");
write("CHANGELOG.md", changelog);

const finalApp = read("app.js");
assert.ok(finalApp.includes("SignalDockElementRegistry.create(document)"));
assert.ok(!finalApp.includes('const $ = (id) => document.getElementById(id);'));
assert.ok(!finalApp.includes("Object.assign(el, {"));
assert.ok(read("index.html").includes("src/app/element-registry.js"));
assert.ok(read("website/index.html").includes("SignalDock v2.8.31"));
console.log("SignalDock v2.8.31 migration prepared successfully.");
