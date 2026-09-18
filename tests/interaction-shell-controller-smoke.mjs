import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const source = read("src/app/interaction-shell-controller.js");

assert.ok(html.includes("src/app/interaction-shell-controller.js"));
assert.ok(html.indexOf("src/app/interaction-shell-controller.js") < html.indexOf("app.js"));
assert.ok(app.includes("SignalDockInteractionShellController.create"));
assert.ok(app.includes("interactionShellController.bind();"));
assert.ok(!app.includes('document.addEventListener("keydown"'));
assert.ok(!app.includes("function bindEvents()"));
assert.ok(app.includes("interactionShellController?.closeCompetingDialogs"));
assert.ok(app.includes("interactionShellController?.showDialogSafely"));

for (const token of [
  "SignalDockStorageAdapter", "SignalDockPersistence", "SignalDockQueryEngine",
  "indexedDB", "localStorage", "sessionStorage", "showOpenFilePicker",
  "new Worker", ".postMessage(", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("
]) assert.ok(!source.includes(token), "forbidden Interaction Shell capability: " + token);
assert.ok(!/\bfetch\s*\(/.test(source));

class FakeDocument {
  constructor() { this.activeElement = null; this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
}
class FakeDialog {
  constructor(id) { this.id = id; this.open = false; this.attrs = new Set(); this.closeCount = 0; this.throwOnShow = false; }
  hasAttribute(name) { return name === "open" && (this.open || this.attrs.has("open")); }
  setAttribute(name) { if (name === "open") { this.open = true; this.attrs.add("open"); } }
  removeAttribute(name) { if (name === "open") { this.open = false; this.attrs.delete("open"); } }
  close() { this.closeCount += 1; this.open = false; this.attrs.delete("open"); }
  showModal() {
    if (this.throwOnShow) throw new Error("show failed");
    this.open = true;
    this.attrs.add("open");
  }
}
function event(key, extra = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    defaultPrevented: false,
    target: extra.target || null,
    preventDefault() { this.defaultPrevented = true; },
    ...extra
  };
}

const doc = new FakeDocument();
const commandDialog = new FakeDialog("commandPaletteDialog");
const settingsDialog = new FakeDialog("settingsDialog");
const el = {
  queryInput: { value: "service:api", disabled: false, ownerDocument: doc },
  fileInput: {},
  commandPaletteDialog: commandDialog,
  settingsDialog
};
const state = { selectedId: null };
let imports = 0;
let focuses = 0;
let closes = 0;
let filters = 0;
const host = { document: doc };
vm.runInNewContext(source, { self: host, window: host, console, Object, String, Array, Boolean }, { filename: "interaction-shell-controller.js" });

const controller = host.SignalDockInteractionShellController.create({
  state,
  el,
  ownerDocument: doc,
  dialogs: [commandDialog, settingsDialog],
  importLogs: () => { imports += 1; },
  focusSearch: () => { focuses += 1; },
  closeInspector: () => { closes += 1; state.selectedId = null; },
  applyFilters: () => { filters += 1; }
});

controller.bind();
controller.bind();
assert.equal(doc.listeners.get("keydown").size, 1, "bind() must be idempotent");

const alreadyHandled = event("Escape", { defaultPrevented: true });
assert.equal(controller.handleGlobalKeydown(alreadyHandled), false);
assert.equal(el.queryInput.value, "service:api");
assert.equal(closes, 0);
assert.equal(filters, 0);

commandDialog.open = true;
const escapeWithModal = event("Escape");
assert.equal(controller.handleGlobalKeydown(escapeWithModal), false, "open modal must own Escape");
assert.equal(el.queryInput.value, "service:api");
assert.equal(filters, 0);

const ctrlFWithModal = event("f", { ctrlKey: true });
assert.equal(controller.handleGlobalKeydown(ctrlFWithModal), false, "open modal must block global focus shortcut");
assert.equal(focuses, 0);
commandDialog.open = false;

const editable = { tagName: "DIV", isContentEditable: true };
assert.equal(controller.handleGlobalKeydown(event("/", { target: editable })), false);
assert.equal(focuses, 0);

const slash = event("/", { target: { tagName: "DIV", isContentEditable: false } });
assert.equal(controller.handleGlobalKeydown(slash), true);
assert.equal(slash.defaultPrevented, true);
assert.equal(focuses, 1);

const openEvent = event("o", { ctrlKey: true });
assert.equal(controller.handleGlobalKeydown(openEvent), true);
assert.equal(imports, 1);

const findEvent = event("f", { metaKey: true });
assert.equal(controller.handleGlobalKeydown(findEvent), true);
assert.equal(focuses, 2);

state.selectedId = "sd-1";
el.queryInput.value = "keep-this-query";
const inspectorEscape = event("Escape");
assert.equal(controller.handleGlobalKeydown(inspectorEscape), true);
assert.equal(closes, 1);
assert.equal(el.queryInput.value, "keep-this-query", "Inspector Escape must not also clear query");

state.selectedId = null;
const queryEscape = event("Escape");
assert.equal(controller.handleGlobalKeydown(queryEscape), true);
assert.equal(el.queryInput.value, "");
assert.equal(filters, 1);

commandDialog.open = true;
settingsDialog.open = true;
assert.equal(controller.closeCompetingDialogs("settingsDialog"), 1);
assert.equal(commandDialog.open, false);
assert.equal(settingsDialog.open, true);

const fallbackDialog = new FakeDialog("fallback");
fallbackDialog.throwOnShow = true;
assert.equal(controller.showDialogSafely(fallbackDialog), true);
assert.equal(fallbackDialog.open, true);

controller.destroy();
assert.equal(doc.listeners.get("keydown").size, 0);
console.log("interaction-shell-controller-smoke PASS");
