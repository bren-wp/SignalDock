import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const controller = fs.readFileSync(path.join(root, "src/app/case-checkpoint-controller.js"), "utf8");

assert.ok(html.includes('src/app/case-checkpoint-controller.js'), "Case Checkpoint controller must load before app.js");
assert.ok(app.includes("SignalDockCaseCheckpointController.create"), "root app must initialize Case Checkpoint controller");
assert.ok(app.includes("caseCheckpointController.bind()"), "root app must bind Case Checkpoint controller");
assert.ok(app.includes("caseCheckpointController?.render()"), "Case Workspace rendering must refresh checkpoint diffs");
assert.equal(app.includes("function createCaseCheckpoint()"), false, "checkpoint creation must not remain owned by app.js");
assert.equal(app.includes("function renderCaseCheckpoints()"), false, "checkpoint rendering must not remain owned by app.js");
assert.equal(app.includes("function onCaseCheckpointClick("), false, "checkpoint actions must not remain owned by app.js");
assert.equal(app.includes('el.addCaseCheckpointButton?.addEventListener'), false, "checkpoint event ownership must not be duplicated");

for (const token of [
  "const VERSION = 1",
  "SignalDockCaseCheckpoints",
  "SignalDockCaseWorkspace",
  "checkpoint-diff",
  "case.checkpoint.restored",
  "renderCaseWorkspace",
  "scheduleDatasetAutosave",
  "function bind()",
  "function destroy()",
  "Unknown time"
]) {
  assert.ok(controller.includes(token), `missing Case Checkpoint controller token: ${token}`);
}
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(controller.includes(forbidden), false, `Case Checkpoint controller must not introduce ${forbidden}`);
}

console.log("case-checkpoint-controller-smoke PASS");
