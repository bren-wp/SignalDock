import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "persistence.js"), "utf8"), { filename: "persistence.js" });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const small = Array.from({ length: 100 }, (_, i) => ({ source: "api.log", service: "api", message: `request ${i}`, raw: { i, ok: true }, correlations: {}, traceMeta: {} }));
const estimate = globalThis.SignalDockPersistence.estimateSnapshotBytes(small);
assert(Number.isFinite(estimate) && estimate > 0, "persistence estimator should return a positive size");
const eligible = globalThis.SignalDockPersistence.autosaveEligibility(small);
assert(eligible.allowed, "small recovery snapshot should be eligible");
const tooMany = globalThis.SignalDockPersistence.autosaveEligibility(new Array(globalThis.SignalDockPersistence.MAX_AUTO_ENTRIES + 1));
assert(!tooMany.allowed && /limited/i.test(tooMany.reason), "oversized entry count should disable autosave");
console.log("PASS recovery size estimation");
console.log("PASS recovery autosave eligibility guards");
console.log("SignalDock persistence smoke test passed.");
