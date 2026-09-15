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
const controller = read("src/app/project-controller.js");

assert.equal(version, "2.8.2");
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
const controllerIndex = scripts.indexOf("src/app/project-controller.js");
const appIndex = scripts.indexOf("app.js");
assert.ok(controllerIndex >= 0 && controllerIndex < appIndex, "project controller must load before app.js");

for (const token of [
  "SignalDockProjectController.create",
  "projectController.bind()",
  "projectController.render()",
  "projects: () => projectController?.open()",
  "renderProjects: () => projectController?.render()"
]) assert.ok(app.includes(token), `Project app integration token missing: ${token}`);

for (const token of [
  "function openProjects()",
  "function renderProjects()",
  "function linkAndLoadProjectFiles()",
  "function reopenProjectHistoryItem(",
  "function onProjectListClick(",
  "el.createProjectButton?.addEventListener"
]) assert.ok(!app.includes(token), `Project implementation leaked back into app.js: ${token}`);

for (const token of [
  "const VERSION = 1",
  "const HISTORY_FIELDS = new Set",
  "function create(options = {})",
  "function bind()",
  "function destroy()",
  "let bound = false",
  "restoreWorkspaceFile",
  "refreshBaselineHistory",
  "requestPermission: true",
  "forgetProjectHandles",
  "without copying local file capabilities"
]) assert.ok(controller.includes(token), `Project controller quality token missing: ${token}`);

for (const forbidden of ["root.invoke", ".invoke(", "shell", "exec(", "spawn("]) {
  assert.ok(!controller.includes(forbidden), `Project controller must not expose generic native capabilities: ${forbidden}`);
}
for (const primitive of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("]) {
  assert.ok(!controller.includes(primitive), `Project controller must stay local-only: ${primitive}`);
}

const sandbox = { self: {}, console, Set };
vm.runInNewContext(controller, sandbox, { filename: "project-controller.js" });
assert.equal(sandbox.self.SignalDockProjectController.VERSION, 1);
assert.equal(typeof sandbox.self.SignalDockProjectController.create, "function");
assert.equal(Object.isFrozen(sandbox.self.SignalDockProjectController), true);

console.log("project-controller-smoke PASS");
