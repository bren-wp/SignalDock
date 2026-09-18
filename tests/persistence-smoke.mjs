import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "src/core/persistence.js"), "utf8"), { filename: "src/core/persistence.js" });

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

const persistence = globalThis.SignalDockPersistence;
assert(persistence.validChunkCount(1) === 1, "single recovery chunk should be valid");
assert(persistence.validChunkCount(persistence.MAX_CHUNKS) === persistence.MAX_CHUNKS, "maximum recovery chunk count should be valid");
for (const invalid of [0, -1, 1.5, NaN, Infinity, persistence.MAX_CHUNKS + 1, "1", "999999"]) {
  assert(persistence.validChunkCount(invalid) === 0, `invalid recovery chunk count must be rejected: ${String(invalid)}`);
}
console.log("PASS bounded recovery manifest chunks");
const persistenceSource = fs.readFileSync(path.join(root, "src/core/persistence.js"), "utf8");
assert(persistenceSource.includes("const oldCount = validChunkCount(previousManifest?.chunkCount);"), "stale recovery cleanup must validate previous chunk count");
assert(!persistenceSource.includes("const oldCount = Number(previousManifest?.chunkCount) || 0;"), "stale recovery cleanup must not trust coerced chunk metadata");
console.log("PASS bounded stale recovery cleanup");
console.log("PASS recovery size estimation");
console.log("PASS recovery autosave eligibility guards");
console.log("SignalDock persistence smoke test passed.");
