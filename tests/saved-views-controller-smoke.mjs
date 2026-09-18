import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const controllerSource = read("src/app/saved-views-controller.js");

assert.ok(html.includes('src/app/saved-views-controller.js'), "Saved Views controller missing from index.html");
assert.ok(html.indexOf('src/app/saved-views-controller.js') < html.indexOf('app.js'), "Saved Views controller must load before app.js");
assert.ok(app.includes("SignalDockSavedViewsController.create"), "Saved Views controller factory wiring missing");
assert.ok(app.includes("savedViewsController.bind();"), "Saved Views controller bind() missing");
assert.ok(!app.includes('el.saveViewButton.addEventListener("click", saveCurrentView)'), "root still owns save-view listener");
assert.ok(!app.includes('el.savedList.addEventListener("click", onSavedViewsClick)'), "root still owns saved-list listener");
for (const token of ["saveCurrentView", "buildViewName", "render", "onListClick", "function bind()", "function destroy()"]) {
  assert.ok(controllerSource.includes(token), `controller missing expected ownership token: ${token}`);
}
for (const token of ["localStorage", "sessionStorage", "SignalDockPersistence", "SignalDockSearchCache", "indexedDB", "showOpenFilePicker", "SignalDockDesktopBridge", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("]) {
  assert.ok(!controllerSource.includes(token), `forbidden capability reference in Saved Views controller: ${token}`);
}
assert.ok(!/\bfetch\s*\(/.test(controllerSource), "Saved Views controller must not use fetch()");

class FakeNode {
  constructor(document) {
    this.ownerDocument = document;
    this.hidden = false;
    this.textContent = "";
    this.className = "";
    this.title = "";
    this.type = "";
    this.value = "";
    this.dataset = {};
    this.children = [];
    this.options = [];
    this.selectedIndex = 0;
    this.listeners = new Map();
    this.attributes = new Map();
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}
const document = {
  createElement: () => new FakeNode(document),
  createElementNS: () => new FakeNode(document)
};
const select = (values, value = values[0] || "") => {
  const node = new FakeNode(document);
  node.options = values.map(([optionValue, textContent]) => ({ value: optionValue, textContent }));
  node.value = value;
  node.selectedIndex = Math.max(0, node.options.findIndex((option) => option.value === value));
  return node;
};
const rootGlobal = {};
const context = { self: rootGlobal, window: rootGlobal, console };
vm.runInNewContext(controllerSource, context, { filename: "saved-views-controller.js" });

const state = { entries: [{}], savedViews: [], queryLibrary: [{ id: "query-1" }] };
const el = {
  saveViewButton: new FakeNode(document),
  savedList: new FakeNode(document),
  savedCount: new FakeNode(document),
  queryInput: new FakeNode(document),
  levelFilter: select([["", "All"], ["ERROR", "Error"]], "ERROR"),
  sourceFilter: select([["", "All"], ["api.log", "api.log"]], "api.log"),
  timeFilter: select([["", "All"], ["15m", "Last 15 minutes"]], "15m"),
  sortFilter: select([["original", "Original"], ["newest", "Newest"]], "newest")
};
el.queryInput.value = "timeout";
let persisted = 0;
let applied = 0;
const controller = rootGlobal.SignalDockSavedViewsController.create({
  state,
  el,
  ownerDocument: document,
  persistSavedViews: () => { persisted += 1; },
  requestName: () => "Error view",
  createViewId: () => "view-1",
  getShortSource: (value) => value,
  syncLevelChips: () => {},
  applyFilters: () => { applied += 1; },
  toast: () => {}
});

controller.bind();
controller.bind();
assert.equal(el.saveViewButton.listeners.size, 1, "bind() must be idempotent");
assert.equal(el.savedList.listeners.size, 1, "saved-list listener must be singular");

controller.saveCurrentView();
assert.equal(state.savedViews.length, 1);
assert.equal(state.savedViews[0].id, "view-1");
assert.equal(state.savedViews[0].name, "Error view");
assert.equal(persisted, 1);
assert.equal(el.savedList.children.length, 1);
assert.equal(el.savedCount.textContent, "1");

el.queryInput.value = "";
el.levelFilter.value = "";
el.sourceFilter.value = "";
el.timeFilter.value = "";
el.sortFilter.value = "original";
controller.onListClick({
  target: {
    closest(selector) {
      return selector === "[data-view-id]" ? { dataset: { viewId: "view-1" } } : null;
    }
  }
});
assert.equal(el.queryInput.value, "timeout");
assert.equal(el.levelFilter.value, "ERROR");
assert.equal(el.sourceFilter.value, "api.log");
assert.equal(el.timeFilter.value, "15m");
assert.equal(el.sortFilter.value, "newest");
assert.equal(applied, 1);

controller.onListClick({
  target: {
    closest(selector) {
      return selector === "[data-delete-view]" ? { dataset: { deleteView: "view-1" } } : null;
    }
  }
});
assert.equal(state.savedViews.length, 0);
assert.equal(persisted, 2);

controller.destroy();
assert.equal(el.saveViewButton.listeners.size, 0, "destroy() must remove save-view listener");
assert.equal(el.savedList.listeners.size, 0, "destroy() must remove saved-list listener");

console.log("saved-views-controller-smoke PASS");
