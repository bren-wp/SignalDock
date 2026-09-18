import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("app.js");
const source = read("src/app/element-registry.js");

assert.ok(html.includes('src/app/element-registry.js'));
assert.ok(html.indexOf('src/app/element-registry.js') < html.indexOf('app.js'));
assert.ok(app.includes("SignalDockElementRegistry.create(document)"));
assert.ok(!app.includes('const $ = (id) => document.getElementById(id);'));
assert.ok(!app.includes("Object.assign(el, {"));

for (const token of [
  "SignalDockStorageAdapter", "SignalDockPersistence", "SignalDockQueryEngine",
  "indexedDB", "localStorage", "sessionStorage", "showOpenFilePicker",
  "new Worker", ".postMessage(", "XMLHttpRequest", "WebSocket", "EventSource", ".invoke("
]) assert.ok(!source.includes(token), "forbidden element-registry capability: " + token);
assert.ok(!/\bfetch\s*\(/.test(source));

const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const counts = new Map();
for (const id of htmlIds) counts.set(id, (counts.get(id) || 0) + 1);

const requested = [];
const document = {
  getElementById(id) {
    requested.push(id);
    return { id };
  }
};
const host = { document };
vm.runInNewContext(source, { self:host, window:host, console, Object }, { filename:"element-registry.js" });

const api = host.SignalDockElementRegistry;
assert.ok(api);
assert.ok(Object.isFrozen(api));
assert.ok(Object.isFrozen(api.ELEMENT_IDS));
assert.equal(api.ELEMENT_IDS.length, 255);
assert.equal(new Set(api.ELEMENT_IDS).size, api.ELEMENT_IDS.length, "registry IDs must be unique");

for (const id of api.ELEMENT_IDS) {
  assert.equal(counts.get(id), 1, "registered element must exist exactly once in index.html: " + id);
}

const registry = api.create(document);
assert.ok(Object.isFrozen(registry));
assert.equal(Object.keys(registry).length, 255);
assert.equal(requested.length, 255);
for (const id of api.ELEMENT_IDS) assert.equal(registry[id].id, id);

const unregisteredHtmlIds = htmlIds.filter((id) => !api.ELEMENT_IDS.includes(id));
assert.ok(unregisteredHtmlIds.length < htmlIds.length, "registry coverage sanity check failed");
console.log("element-registry-smoke PASS");
