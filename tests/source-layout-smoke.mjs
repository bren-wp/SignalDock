import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootJs = fs.readdirSync(root).filter((name) => name.endsWith(".js")).sort();
assert.deepEqual(rootJs, ["app.js", "filter-worker.js"], "root should contain only public JavaScript entrypoints");

const expectedDirs = ["src/app", "src/core", "src/analysis", "src/investigation", "src/platform", "src/ui", "src/vendor"];
for (const dir of expectedDirs) assert.ok(fs.statSync(path.join(root, dir)).isDirectory(), `missing source directory ${dir}`);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
assert.ok(scripts.includes("app.js"), "app.js entrypoint missing from index.html");
assert.ok(scripts.some((ref) => ref.startsWith("src/app/")), "application controllers are not loaded from src/app");
assert.ok(scripts.some((ref) => ref.startsWith("src/core/")), "core scripts are not loaded from src/core");
assert.ok(scripts.some((ref) => ref.startsWith("src/analysis/")), "analysis scripts are not loaded from src/analysis");
assert.ok(scripts.some((ref) => ref.startsWith("src/platform/")), "platform scripts are not loaded from src/platform");
for (const ref of scripts) assert.ok(fs.existsSync(path.join(root, ref)), `script reference does not exist: ${ref}`);

const worker = fs.readFileSync(path.join(root, "filter-worker.js"), "utf8");
for (const ref of ["src/core/search-index.js", "src/core/search-cache.js", "src/core/query-engine.js"]) assert.ok(worker.includes(ref), `worker dependency path missing: ${ref}`);

const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
assert.ok(ci.includes("find . -type f -name '*.js'"), "CI syntax check must recurse into organized source directories");
assert.ok(ci.includes("src/core/parser.js"), "HTTP smoke must verify organized core assets");
assert.ok(ci.includes("src/analysis/trace-explorer.js"), "HTTP smoke must verify organized analysis assets");
assert.ok(ci.includes("src/platform/desktop-bridge.js"), "HTTP smoke must verify organized platform assets");

console.log(`source-layout-smoke PASS (${scripts.length} application scripts)`);
