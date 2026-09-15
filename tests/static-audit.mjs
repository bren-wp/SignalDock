import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const srcRoot = path.join(root, "src");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectFiles(dir, predicate, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) collectFiles(full, predicate, out);
    else if (predicate(full, name)) out.push(full);
  }
  return out;
}

const appHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const websiteHtml = fs.readFileSync(path.join(root, "website", "index.html"), "utf8");

const ids = [...appHtml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const idSet = new Set(ids);
assert(idSet.size === ids.length, "index.html contains duplicate ids");

const assignedDynamicIds = [...appJs.matchAll(/\.id\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
const buttonDynamicIds = [...appJs.matchAll(/makeUiButton\("([^"]+)"/g)].map((match) => match[1]).filter(Boolean);
const dynamicIds = [...new Set([...assignedDynamicIds, ...buttonDynamicIds])];
const declaredIdSet = new Set([...ids, ...dynamicIds]);
const conflictingDynamicIds = dynamicIds.filter((id) => idSet.has(id));
assert(!conflictingDynamicIds.length, `dynamic DOM ids conflict with index.html ids: ${conflictingDynamicIds.join(", ")}`);

const jsRefs = [...appJs.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
const missingRefs = [...new Set(jsRefs.filter((id) => !declaredIdSet.has(id)))];
assert(!missingRefs.length, `app.js references missing ids: ${missingRefs.join(", ")}`);

for (const [name, html] of [["index.html", appHtml], ["website/index.html", websiteHtml]]) {
  assert(!/\sstyle\s*=/i.test(html), `${name} contains inline style attributes`);
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${name} contains inline script blocks`);
  assert(!/(?:src|href)=["']https?:\/\//i.test(html), `${name} contains external runtime resources`);
}

const productionJs = [
  path.join(root, "app.js"),
  path.join(root, "filter-worker.js"),
  ...collectFiles(srcRoot, (_full, name) => name.endsWith(".js")),
  ...collectFiles(path.join(root, "website"), (_full, name) => name.endsWith(".js"))
];
const combinedJs = productionJs.map((file) => fs.readFileSync(file, "utf8")).join("\n");
assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\(/.test(combinedJs), "runtime network primitive detected");

const textFiles = collectFiles(root, (_full, name) => /\.(?:html|css|js|md|svg|txt|json|ndjson|log)$/i.test(name));
const combinedText = textFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
assert(!/LogFrog|TraceNest|PulseRoot/i.test(combinedText), "old product branding detected");

function verifyLocalRefs(html, baseDir, label) {
  const localRefs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map((match) => match[1])
    .filter((value) => !value.startsWith("data:") && value !== "#" && !value.startsWith("#"));
  for (const ref of localRefs) assert(fs.existsSync(path.resolve(baseDir, ref)), `missing local asset referenced by ${label}: ${ref}`);
}
verifyLocalRefs(appHtml, root, "index.html");
verifyLocalRefs(websiteHtml, path.join(root, "website"), "website/index.html");

console.log(`PASS unique static DOM ids (${ids.length})`);
console.log(`PASS trusted dynamic DOM ids (${dynamicIds.length})`);
console.log(`PASS DOM references (${new Set(jsRefs).size})`);
console.log(`PASS recursive production JS audit (${productionJs.length} files)`);
console.log("PASS no inline CSS/JS");
console.log("PASS no external runtime resources");
console.log("PASS no runtime network primitives");
console.log("PASS no legacy product branding");
console.log("PASS local asset references");
console.log("SignalDock static audit passed.");
