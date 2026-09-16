import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const queryController = fs.readFileSync(path.join(root, "src/app/query-library-controller.js"), "utf8");
const baselineController = fs.readFileSync(path.join(root, "src/app/baseline-controller.js"), "utf8");
const projectController = fs.readFileSync(path.join(root, "src/app/project-controller.js"), "utf8");
const investigationController = fs.readFileSync(path.join(root, "src/app/investigation-controller.js"), "utf8");
const caseCheckpointController = fs.readFileSync(path.join(root, "src/app/case-checkpoint-controller.js"), "utf8");
const caseWorkspaceController = fs.readFileSync(path.join(root, "src/app/case-workspace-controller.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

const required = [
  "baselineHistoryList",
  "touchWorkspace",
  "touchDataset",
  "attachBaseline",
  "queryLibrarySelection",
];
for (const token of required) {
  if (!app.includes(token)) throw new Error(`Missing UI foundation token: ${token}`);
}
for (const token of ["bulkUpdate", "bulkRemove", "exportSelected", "markUsed"]) {
  if (!queryController.includes(token)) throw new Error(`Missing Query Library controller foundation token: ${token}`);
}
for (const token of ["renderHistory", "compareById", "baselineHistoryList", "renderComparisonResult"]) {
  if (!baselineController.includes(token)) throw new Error(`Missing Baseline controller foundation token: ${token}`);
}
for (const token of ["historySection", "markHistoryReopened", "forgetProjectHandles"]) {
  if (!projectController.includes(token)) throw new Error(`Missing Project controller foundation token: ${token}`);
}
for (const token of ["renderCaseSurfaces", "renderCaseTimeline", "pinEvidence", "evidence.imported"]) {
  if (!investigationController.includes(token)) throw new Error(`Missing Investigation controller foundation token: ${token}`);
}
for (const token of ["checkpoint-diff", "case.checkpoint.restored", "scheduleDatasetAutosave", "renderCaseWorkspace"]) {
  if (!caseCheckpointController.includes(token)) throw new Error(`Missing Case Checkpoint controller foundation token: ${token}`);
}
for (const token of ["case-finding", "case-milestone", "case-attachment", "refreshCaseWorkspace", "metadata only"]) {
  if (!caseWorkspaceController.includes(token)) throw new Error(`Missing Case Workspace controller foundation token: ${token}`);
}
for (const selector of [".query-library-bulkbar", ".query-library-item", ".baseline-history", ".baseline-history__compare"]) {
  if (!css.includes(selector)) throw new Error(`Missing UI foundation style: ${selector}`);
}
console.log("ui-foundations-smoke PASS");
