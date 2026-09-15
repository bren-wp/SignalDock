import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const html = read("index.html");
const app = read("app.js");

assert.match(version, /^2\.7\.\d+$/);
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
  'baselineHistoryList: $("baselineHistoryList")',
  'el.queryLibraryBulkSelectVisible?.addEventListener',
  'el.baselineHistoryExportButton?.addEventListener'
]) assert.ok(app.includes(token), `static control binding missing: ${token}`);
assert.ok(app.includes('icon.setAttribute("aria-hidden", "true")'));
console.log("static-foundation-ui-smoke PASS");
