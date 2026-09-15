import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "src/core/performance.js"), "utf8"), { filename: "src/core/performance.js" });

function assert(condition, message) { if (!condition) throw new Error(message); }
const perf = globalThis.SignalDockPerformance;
perf.reset();
perf.record("filter", 4, { engine: "main" });
perf.record("filter", 10, { engine: "worker" });
const finish = perf.start("render", { rows: 100 });
await new Promise((resolve) => setTimeout(resolve, 2));
const elapsed = finish();
const snapshot = perf.snapshot();
assert(snapshot.metrics.filter.count === 2, "filter sample count mismatch");
assert(snapshot.metrics.filter.lastMs === 10, "filter last sample mismatch");
assert(snapshot.metrics.filter.avgMs === 7, "filter average mismatch");
assert(snapshot.metrics.render.count === 1 && elapsed >= 0, "timed metric missing");
console.log("PASS rolling performance metrics");
console.log("PASS scoped performance timer");
console.log("SignalDock performance smoke test passed.");
