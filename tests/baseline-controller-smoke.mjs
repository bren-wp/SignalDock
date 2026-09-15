import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const html = read("index.html");
const app = read("app.js");
const controller = read("src/app/baseline-controller.js");

assert.equal(version, "2.8.1");
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
const controllerIndex = scripts.indexOf("src/app/baseline-controller.js");
const appIndex = scripts.indexOf("app.js");
assert.ok(controllerIndex >= 0 && controllerIndex < appIndex, "baseline controller must load before app.js");

for (const token of [
  "SignalDockBaselineController.create",
  "baselineController.bind()",
  "baseline: () => baselineController?.open()",
  "baselineController?.renderHistory()"
]) assert.ok(app.includes(token), `baseline app integration token missing: ${token}`);

for (const token of [
  "function openBaseline()",
  "function renderBaselineHistory()",
  "function captureBaseline(",
  "function compareSavedBaselines()",
  "function onBaselineServiceClick(",
  "el.captureBaselineButton?.addEventListener"
]) assert.ok(!app.includes(token), `Baseline implementation leaked back into app.js: ${token}`);

for (const token of [
  "const VERSION = 1",
  "function create(options = {})",
  "function bind()",
  "function destroy()",
  "let bound = false",
  "function renderHistory()",
  "function renderComparisonResult(",
  "attachBaselineToActiveProject",
  "getProjectName",
  "Both baselines must exist in local baseline history."
]) assert.ok(controller.includes(token), `baseline controller quality token missing: ${token}`);

for (const primitive of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("]) {
  assert.ok(!controller.includes(primitive), `baseline controller must stay local-only: ${primitive}`);
}

const sandbox = { self: {}, console };
vm.runInNewContext(controller, sandbox, { filename: "baseline-controller.js" });
assert.equal(sandbox.self.SignalDockBaselineController.VERSION, 1);
assert.equal(typeof sandbox.self.SignalDockBaselineController.create, "function");
assert.equal(Object.isFrozen(sandbox.self.SignalDockBaselineController), true);

console.log("baseline-controller-smoke PASS");
