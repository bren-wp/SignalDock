import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "src/analysis/trace-analysis.js"), "utf8"), { filename: "src/analysis/trace-analysis.js" });

function assert(condition, message) { if (!condition) throw new Error(message); }
const base = Date.parse("2026-09-12T20:00:00Z");
const entries = [
  { id: "root", service: "api", timestampMs: base, correlations: { span: "root" }, traceMeta: { parentSpan: "", durationMs: 120 } },
  { id: "auth", service: "auth", timestampMs: base + 10, correlations: { span: "auth" }, traceMeta: { parentSpan: "root", durationMs: 35 } },
  { id: "db", service: "db", timestampMs: base + 20, correlations: { span: "db" }, traceMeta: { parentSpan: "root", durationMs: 80 } },
  { id: "cache", service: "cache", timestampMs: base + 40, correlations: { span: "cache" }, traceMeta: { parentSpan: "db", durationMs: 70 } }
];
const result = globalThis.SignalDockTraceAnalysis.analyze(entries);
assert(result.available, "critical chain should be available");
assert(result.completeParents, "all span parents should be linked");
assert(result.chain.map((item) => item.id).join(",") === "root,db,cache", `unexpected critical chain: ${result.chain.map((item) => item.id)}`);
assert(result.bottleneck?.id === "root", "root span should be bottleneck by measured duration");
assert(result.latencyMs === 120, `expected 120 ms trace latency, got ${result.latencyMs}`);
console.log("PASS explicit parent-span critical chain");

const partial = globalThis.SignalDockTraceAnalysis.analyze([
  entries[0],
  { id: "orphan", service: "worker", timestampMs: base + 5, correlations: { span: "orphan" }, traceMeta: { parentSpan: "missing", durationMs: 20 } }
]);
assert(partial.available && !partial.completeParents, "missing parent should mark analysis partial");
assert(/missing/i.test(partial.note), "partial analysis should explain missing parent spans");
console.log("PASS partial trace honesty guard");
console.log("SignalDock trace analysis smoke test passed.");
