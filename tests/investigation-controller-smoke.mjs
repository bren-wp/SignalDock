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
const controller = read("src/app/investigation-controller.js");

assert.match(version, /^\d+\.\d+\.\d+$/, "VERSION must remain semantic");
assert.ok(app.includes(`const APP_VERSION = "${version}";`), "APP_VERSION must follow VERSION");
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
const projectIndex = scripts.indexOf("src/app/project-controller.js");
const controllerIndex = scripts.indexOf("src/app/investigation-controller.js");
const caseWorkspaceIndex = scripts.indexOf("src/app/case-workspace-controller.js");
const appIndex = scripts.indexOf("app.js");
assert.ok(projectIndex >= 0 && projectIndex < controllerIndex && controllerIndex < caseWorkspaceIndex && caseWorkspaceIndex < appIndex, "Investigation controller must load between Project and Case Workspace controllers before app.js");

for (const token of [
  "SignalDockInvestigationController.create",
  "investigationController.bind()",
  "investigationController?.renderCaseSurfaces()",
  "investigationController?.pinEvidence(entry",
  "investigationController?.recordActivity(\"case.imported\""
]) assert.ok(app.includes(token), `Investigation app integration token missing: ${token}`);

for (const token of [
  "function openInvestigation()",
  "function renderInvestigation()",
  "function renderInvestigationTimeline()",
  "function renderCaseActivity()",
  "function renderCaseUnifiedTimeline()",
  "function persistInvestigationMeta()",
  "function persistCaseMeta()",
  "function exportInvestigationBundle()",
  "function importInvestigationJson(",
  "el.addEvidenceButton?.addEventListener",
  "el.investigationList?.addEventListener",
  "el.caseTimelineList?.addEventListener"
]) assert.equal(app.includes(token), false, `Investigation UI implementation leaked back into app.js: ${token}`);

for (const token of [
  "const VERSION = 1",
  "SignalDockInvestigation",
  "SignalDockCaseWorkspace",
  "SignalDockCaseTimeline",
  "recordActivity",
  "renderCaseSurfaces",
  "pinEvidence",
  "Could not add evidence:",
  "not added",
  "function bind()",
  "function destroy()"
]) assert.ok(controller.includes(token), `Investigation controller quality token missing: ${token}`);

for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(controller.includes(forbidden), false, `Investigation controller must stay local-only and capability-narrow: ${forbidden}`);
}

const sandbox = { self: {}, console };
vm.runInNewContext(controller, sandbox, { filename: "investigation-controller.js" });
assert.equal(sandbox.self.SignalDockInvestigationController.VERSION, 1);
assert.equal(typeof sandbox.self.SignalDockInvestigationController.create, "function");
assert.equal(Object.isFrozen(sandbox.self.SignalDockInvestigationController), true);

console.log("investigation-controller-smoke PASS");
