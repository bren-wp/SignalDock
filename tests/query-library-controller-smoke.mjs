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
const controller = read("src/app/query-library-controller.js");

const queryFeatureVersion = version.split(".").map(Number);
assert.ok(queryFeatureVersion.length === 3 && queryFeatureVersion.every(Number.isFinite) && (queryFeatureVersion[0] > 2 || (queryFeatureVersion[0] === 2 && queryFeatureVersion[1] >= 8)), `expected SignalDock >= 2.8.x, got ${version}`);
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
const controllerIndex = scripts.indexOf("src/app/query-library-controller.js");
const appIndex = scripts.indexOf("app.js");
assert.ok(controllerIndex >= 0 && controllerIndex < appIndex, "query controller must load before app.js");

for (const token of [
  "SignalDockQueryLibraryController.create",
  "queryLibraryController.bind()",
  "queryLibraryController.render()",
  "saved: () => queryLibraryController?.open()"
]) assert.ok(app.includes(token), `app integration token missing: ${token}`);

for (const token of [
  "function openQueryLibrary()",
  "function renderQueryLibrary()",
  "function saveCurrentQueryToLibrary()",
  "function onQueryLibraryClick(event)",
  "el.queryLibrarySaveButton?.addEventListener"
]) assert.ok(!app.includes(token), `Query Library implementation leaked back into app.js: ${token}`);

for (const token of [
  "const VERSION = 1",
  "function create(options = {})",
  "function bind()",
  "function destroy()",
  "let bound = false",
  "const visibleByFolder = new Map()",
  'move.setAttribute("aria-label", `Move ${item.name} to folder`)'
]) assert.ok(controller.includes(token), `controller quality token missing: ${token}`);

for (const primitive of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("]) {
  assert.ok(!controller.includes(primitive), `query controller must stay local-only: ${primitive}`);
}

const sandbox = { self: {}, console };
vm.runInNewContext(controller, sandbox, { filename: "query-library-controller.js" });
assert.equal(sandbox.self.SignalDockQueryLibraryController.VERSION, 1);
assert.equal(typeof sandbox.self.SignalDockQueryLibraryController.create, "function");
assert.equal(Object.isFrozen(sandbox.self.SignalDockQueryLibraryController), true);

console.log("query-library-controller-smoke PASS");
