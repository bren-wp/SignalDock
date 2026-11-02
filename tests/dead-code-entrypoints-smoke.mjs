import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.isFile() && entry.name.endsWith(".js") ? [full] : [];
  });
}

const sourceFiles = walk(path.join(root, "src"))
  .map((file) => path.relative(root, file).replaceAll(path.sep, "/")).sort();
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)]
  .map((match) => match[1]);
const duplicates = scripts.filter((script, index) => scripts.indexOf(script) !== index);
assert.deepEqual(duplicates, [], "Duplicate script tags cause repeat initialization");

const scriptSet = new Set(scripts);
const orphanedFiles = sourceFiles.filter((file) => !scriptSet.has(file));
assert.deepEqual(orphanedFiles, [],
  "Unreachable src/ files detected; verify whether they are truly unused before removal");
assert.ok(scriptSet.has("app.js"), "Main app entrypoint is not loaded");
assert.ok(!scriptSet.has("filter-worker.js"), "Worker must not be executed on the UI thread");
assert.match(app, /new Worker\("filter-worker\.js\?sd_session="/,
  "Background worker entrypoint is not referenced by the main app");

for (const script of scripts) {
  assert.ok(fs.existsSync(path.join(root, script)), "Missing runtime script: " + script);
}

console.log("PASS dead-code entrypoint audit (" + sourceFiles.length + " src modules, " +
  scripts.length + " runtime scripts, 1 worker)");
console.log("NOTE: Reachability is a file-level check, not proof that all exported functions are live.");
