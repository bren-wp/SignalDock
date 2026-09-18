import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const html = read("index.html");
const app = read("app.js");
const queryController = read("src/app/query-library-controller.js");
const baselineController = read("src/app/baseline-controller.js");
const tableViewController = read("src/app/table-view-controller.js");

const featureVersionParts = version.split(".").map(Number);
assert.ok(featureVersionParts.length === 3 && featureVersionParts.every(Number.isFinite) && (featureVersionParts[0] > 2 || (featureVersionParts[0] === 2 && featureVersionParts[1] >= 7)), `expected SignalDock >= 2.7.x, got ${version}`);
for (const id of [
  "queryLibraryBulkBar", "queryLibraryBulkCount", "queryLibraryBulkFolder", "queryLibraryBulkSelectVisible",
  "queryLibraryBulkFavorite", "queryLibraryBulkUnfavorite", "queryLibraryBulkMove", "queryLibraryBulkExport",
  "queryLibraryBulkDelete", "queryLibraryBulkClear", "baselineHistoryList", "baselineHistoryExportButton",
  "baselineHistoryImportButton", "baselineHistoryFileInput", "baselineCompareBase", "baselineCompareCurrent",
  "compareSavedBaselinesButton"
]) assert.ok(html.includes(`id="${id}"`), `static foundation control missing from index.html: ${id}`);

assert.ok(html.includes('id="queryLibraryBulkBar" role="group" aria-label="Bulk query actions"'));
assert.ok(html.includes('class="baseline-history" aria-labelledby="baselineHistoryTitle"'));
assert.ok(html.includes('id="compareSavedBaselinesButton" type="button" disabled'));
assert.ok(!app.includes("function ensureFoundationUi()"), "stable UI must not be synthesized at runtime");
assert.ok(!app.includes("ensureFoundationUi();"), "runtime foundation initializer must stay removed");
assert.ok(!app.includes('bar.id = "queryLibraryBulkBar"'));
assert.ok(!app.includes('list.id = "baselineHistoryList"'));
for (const token of [
  'queryLibraryBulkCount: $("queryLibraryBulkCount")',
  'baselineHistoryList: $("baselineHistoryList")'
]) assert.ok(app.includes(token), `static app registry binding missing: ${token}`);
assert.ok(queryController.includes('listen(el.queryLibraryBulkSelectVisible, "click", selectVisible)'), "Query Library bulk selection listener must be owned by the feature controller");
assert.ok(baselineController.includes('listen(el.baselineHistoryExportButton, "click", exportHistory)'), "Baseline history export listener must be owned by the Baseline controller");
assert.ok(tableViewController.includes('icon.setAttribute("aria-hidden", "true")'));
console.log("static-foundation-ui-smoke PASS");
