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

const indexedSource = [
  null,
  entries[0],
  { id: "plain", service: "api", message: "not a span" },
  entries[2]
];
const indexedResult = globalThis.SignalDockTraceAnalysis.analyze(indexedSource, [0, 1, 2, 3, 99]);
assert(indexedResult.entries === 3, `indexed selection should count only present entries, got ${indexedResult.entries}`);
assert(indexedResult.spans === 2, `indexed selection should include only timestamped spans, got ${indexedResult.spans}`);
assert(indexedResult.traceStart === base && indexedResult.traceEnd === base + 120, "indexed trace bounds changed");
console.log("PASS indexed trace selection semantics");

const partial = globalThis.SignalDockTraceAnalysis.analyze([
  entries[0],
  { id: "orphan", service: "worker", timestampMs: base + 5, correlations: { span: "orphan" }, traceMeta: { parentSpan: "missing", durationMs: 20 } }
]);
assert(partial.available && !partial.completeParents, "missing parent should mark analysis partial");
assert(/missing/i.test(partial.note), "partial analysis should explain missing parent spans");
console.log("PASS partial trace honesty guard");

const largeTrace = Array.from({ length: 200000 }, (_, index) => ({
  id: `large-${index}`,
  timestampMs: base + index,
  correlations: { span: `span-${index}` },
  traceMeta: { parentSpan: "", durationMs: 1 }
}));
const largeResult = globalThis.SignalDockTraceAnalysis.analyze(largeTrace);
assert(largeResult.available, "large trace analysis should remain available");
assert(largeResult.traceStart === base, "large trace minimum timestamp mismatch");
assert(largeResult.traceEnd === base + 200000, "large trace maximum end mismatch");
console.log("PASS large trace range scan");

const deepEntries = [{
  id: "deep-root",
  timestampMs: base,
  correlations: { span: "deep-root" },
  traceMeta: { parentSpan: "", durationMs: 1 }
}];
const depth = 12000;
for (const prefix of ["a", "b"]) {
  let parentSpan = "deep-root";
  const offset = prefix === "a" ? 1000 : 50000;
  for (let index = 0; index < depth; index += 1) {
    const span = `${prefix}-${index}`;
    deepEntries.push({
      id: span,
      timestampMs: base + offset + index,
      correlations: { span },
      traceMeta: { parentSpan, durationMs: 1 }
    });
    parentSpan = span;
  }
}
const deepResult = globalThis.SignalDockTraceAnalysis.analyze(deepEntries);
assert(deepResult.available, "deep branching trace should remain analyzable");
assert(deepResult.chain[1]?.id === "b-0", "critical chain should choose the later-ending deep branch");
assert(deepResult.chain.length === depth + 1, "deep critical chain length mismatch");
console.log("PASS iterative deep trace subtree scan");
console.log("SignalDock trace analysis smoke test passed.");
