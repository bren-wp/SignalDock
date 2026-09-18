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
const applicationControllers = [
  "src/app/query-library-controller.js",
  "src/app/baseline-controller.js",
  "src/app/project-controller.js",
  "src/app/inspector-controller.js",
  "src/app/settings-controller.js",
  "src/app/command-navigation-controller.js",
  "src/app/recovery-diagnostics-controller.js",
  "src/app/saved-views-controller.js",
  "src/app/import-live-tail-controller.js",
  "src/app/dataset-filter-controller.js",
  "src/app/table-view-controller.js",
  "src/app/workspace-controller.js",
  "src/app/dataset-overview-controller.js",
  "src/app/filter-worker-controller.js",
  "src/app/related-context-controller.js",
  "src/app/dataset-session-controller.js",
  "src/app/investigation-controller.js",
  "src/app/exception-controller.js",
  "src/app/trace-explorer-controller.js",
  "src/app/trace-outlier-controller.js",
  "src/app/service-map-controller.js",
  "src/app/service-matrix-controller.js",
  "src/app/service-heatmap-controller.js",
  "src/app/service-trends-controller.js",
  "src/app/health-controller.js",
  "src/app/case-workspace-controller.js",
  "src/app/case-checkpoint-controller.js"
];
for (const ref of applicationControllers) {
  assert.ok(scripts.includes(ref), `application controller missing from index.html: ${ref}`);
}
assert.ok(scripts.some((ref) => ref.startsWith("src/core/")), "core scripts are not loaded from src/core");
assert.ok(scripts.some((ref) => ref.startsWith("src/analysis/")), "analysis scripts are not loaded from src/analysis");
assert.ok(scripts.some((ref) => ref.startsWith("src/platform/")), "platform scripts are not loaded from src/platform");
for (const ref of scripts) assert.ok(fs.existsSync(path.join(root, ref)), `script reference does not exist: ${ref}`);

const worker = fs.readFileSync(path.join(root, "filter-worker.js"), "utf8");
for (const ref of ["src/core/search-index.js", "src/core/search-cache.js", "src/core/query-engine.js"]) assert.ok(worker.includes(ref), `worker dependency path missing: ${ref}`);

const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
assert.ok(ci.includes("find . -type f -name '*.js'"), "CI syntax check must recurse into organized source directories");
for (const ref of applicationControllers) {
  assert.ok(ci.includes(ref), `HTTP smoke must verify application controller asset: ${ref}`);
}
assert.ok(ci.includes("src/core/parser.js"), "HTTP smoke must verify organized core assets");
assert.ok(ci.includes("src/analysis/trace-explorer.js"), "HTTP smoke must verify organized analysis assets");
assert.ok(ci.includes("src/platform/desktop-bridge.js"), "HTTP smoke must verify organized platform assets");

console.log(`source-layout-smoke PASS (${scripts.length} application scripts)`);
