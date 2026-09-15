import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

const required = [
  "baselineHistoryList",
  "compareSavedBaselines",
  "compareById",
  "touchWorkspace",
  "touchDataset",
  "attachBaseline",
  "queryLibrarySelection",
  "bulkUpdate",
  "bulkRemove",
  "exportSelected",
  "markUsed",
  "checkpoint-diff",
  "projectHistorySection"
];
for (const token of required) {
  if (!app.includes(token)) throw new Error(`Missing UI foundation token: ${token}`);
}
for (const selector of [".query-library-bulkbar", ".query-library-item", ".baseline-history", ".baseline-history__compare"]) {
  if (!css.includes(selector)) throw new Error(`Missing UI foundation style: ${selector}`);
}
console.log("ui-foundations-smoke PASS");
