import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const values = new Map();
globalThis.localStorage = { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "parser-profiles.js"), "utf8"), { filename: "parser-profiles.js" });

function assert(condition, message) { if (!condition) throw new Error(message); }
const api = globalThis.SignalDockParserProfiles;
const saved = api.upsert({ name: "Billing logs", pattern: "^(?<message>.*)$", flags: "i" });
assert(api.load().length === 1 && api.get(saved.id)?.name === "Billing logs", "saved parser profile missing");
const updated = api.upsert({ name: "Billing v2", pattern: "^(?<level>\\w+) (?<message>.*)$", flags: "i" }, saved.id);
assert(api.load().length === 1 && updated.name === "Billing v2", "profile update should replace existing record");
const exported = api.exportJson();
api.remove(saved.id);
assert(api.load().length === 0, "profile delete failed");
const imported = api.importJson(exported);
assert(imported.length === 1 && api.load()[0].name === "Billing v2", "profile import/export round trip failed");
let rejected = false;
try { api.upsert({ name: "Broken", pattern: "([", flags: "i" }); } catch { rejected = true; }
assert(rejected, "invalid parser regex should be rejected");
console.log("PASS parser profile save/update/delete");
console.log("PASS parser profile export/import");
console.log("PASS parser profile validation");
console.log("SignalDock parser profile smoke test passed.");
