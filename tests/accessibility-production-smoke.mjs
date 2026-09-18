import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const html = read("index.html");
const app = read("app.js");
const inspectorController = read("src/app/inspector-controller.js");
const commandNavigationController = read("src/app/command-navigation-controller.js");
const savedViewsController = read("src/app/saved-views-controller.js");
const hardening = read("src/ui/ui-hardening.js");
const query = read("src/core/query-library.js");
const readme = read("README.md");

const featureVersionParts = version.split(".").map(Number);
assert.ok(featureVersionParts.length === 3 && featureVersionParts.every(Number.isFinite) && (featureVersionParts[0] > 2 || (featureVersionParts[0] === 2 && featureVersionParts[1] >= 7)), `expected SignalDock >= 2.7.x, got ${version}`);
assert.ok(html.includes('id="clearAllButton" type="button" title="Clear all logs" aria-label="Clear all logs"'));
assert.ok(html.includes('id="resetButton" type="button" title="Reset filters" aria-label="Reset filters"'));
for (const tag of html.match(/<svg class="icon[^"]*"[^>]*>/g) || []) assert.ok(tag.includes('aria-hidden="true"'), `decorative icon is exposed to accessibility tree: ${tag}`);
for (const [tab, pane] of [["Details","detailsPane"],["Context","contextPane"],["Correlations","correlationsPane"],["Trace","tracePane"],["Raw","rawPane"],["Json","jsonPane"]]) {
  assert.ok(html.includes(`id="inspectorTab${tab}"`));
  assert.ok(html.includes(`aria-controls="${pane}"`));
  assert.ok(html.includes(`id="${pane}" aria-labelledby="inspectorTab${tab}"`));
}
assert.ok(html.includes('role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="commandPaletteList" aria-expanded="false"'));
for (const token of ['function activateNavView(target)', 'navResetDialogs:', 'el.settingsDialog,']) assert.ok(app.includes(token), `missing interaction token: ${token}`);
for (const token of ['aria-activedescendant', 'listen(dialog, "close", () => setActiveNav("logs"))']) assert.ok(commandNavigationController.includes(token), `missing command/navigation interaction token: ${token}`);
for (const token of ['function onInspectorTabKeydown(event)', 'button.tabIndex = active ? 0 : -1']) assert.ok(inspectorController.includes(token), `missing Inspector interaction token: ${token}`);
assert.ok(savedViewsController.includes('remove.setAttribute("aria-label", `Delete saved view ${view.name}`)'));
assert.ok(hardening.includes('doc.addEventListener("click", (event) =>'));
assert.ok(hardening.includes('element.closest(\'[hidden], [aria-hidden="true"]\')'));
assert.ok(hardening.includes('event.key === "Escape" && typeof dialog.close !== "function"'));
assert.ok(query.includes('LEGACY_VERSION = 1'));
assert.ok(query.includes('LEGACY_STORAGE_KEY = "signaldock-query-library-v1"'));
assert.ok(!readme.includes('experimental local Live Tail'));
console.log('accessibility-production-smoke PASS');
