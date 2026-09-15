import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const app = read("app.js");
const html = read("index.html");
const controller = read("src/app/case-workspace-controller.js");

assert.match(version, /^\d+\.\d+\.\d+$/, "VERSION must remain semantic");
assert.ok(app.includes(`const APP_VERSION = "${version}";`), "APP_VERSION must follow VERSION");
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
const controllerIndex = scripts.indexOf("src/app/case-workspace-controller.js");
const checkpointIndex = scripts.indexOf("src/app/case-checkpoint-controller.js");
const appIndex = scripts.indexOf("app.js");
assert.ok(controllerIndex >= 0 && controllerIndex < checkpointIndex && checkpointIndex < appIndex, "Case Workspace controller must load before checkpoint controller and app.js");

for (const token of [
  "SignalDockCaseWorkspaceController.create",
  "caseWorkspaceController.bind()",
  "caseWorkspaceController?.render({ rebuildFindings: rebuild })"
]) assert.ok(app.includes(token), `Case Workspace app integration token missing: ${token}`);

for (const token of [
  "function addCaseFinding()",
  "function onCaseFindingEdit(",
  "function renderCaseMilestones()",
  "function addCaseMilestone()",
  "function renderCaseAttachments()",
  "function addCaseAttachmentMetadata(",
  "el.addCaseFindingButton?.addEventListener",
  "el.addCaseMilestoneButton?.addEventListener",
  "el.addCaseAttachmentButton?.addEventListener"
]) assert.equal(app.includes(token), false, `Case Workspace UI implementation leaked back into app.js: ${token}`);

for (const token of [
  "const VERSION = 1",
  "SignalDockCaseWorkspace",
  "getSelectedEntry",
  "recordCaseActivity",
  "refreshCaseWorkspace",
  "scheduleViewAutosave",
  "scheduleDatasetAutosave",
  "metadata only",
  "Choose a valid milestone date and time.",
  "No new local file references were added.",
  "function bind()",
  "function destroy()"
]) assert.ok(controller.includes(token), `Case Workspace controller quality token missing: ${token}`);

for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(controller.includes(forbidden), false, `Case Workspace controller must stay local-only and capability-narrow: ${forbidden}`);
}

const sandbox = { self: {}, console };
vm.runInNewContext(controller, sandbox, { filename: "case-workspace-controller.js" });
assert.equal(sandbox.self.SignalDockCaseWorkspaceController.VERSION, 1);
assert.equal(typeof sandbox.self.SignalDockCaseWorkspaceController.create, "function");
assert.equal(Object.isFrozen(sandbox.self.SignalDockCaseWorkspaceController), true);

console.log("case-workspace-controller-smoke PASS");
