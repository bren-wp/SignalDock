import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.self = globalThis;
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "src/analysis/trace-flame.js"), "utf8"), { filename: "src/analysis/trace-flame.js" });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const base = Date.parse("2026-09-12T20:00:00Z");
const entries = [
  { id: "root", level: "INFO", service: "api", timestampMs: base, correlations: { span: "root" }, traceMeta: { parentSpan: "", durationMs: 100, name: "request" } },
  { id: "db", level: "WARN", service: "db", timestampMs: base + 10, correlations: { span: "db" }, traceMeta: { parentSpan: "root", durationMs: 60, name: "query" } },
  { id: "event", level: "INFO", service: "api", timestampMs: base + 20, correlations: { span: "event" }, traceMeta: { parentSpan: "root", durationMs: null, name: "annotation" } }
];
const result = SignalDockTraceFlame.layout(entries);
assert(result.available, "timed spans should produce flame layout");
assert(result.bars.length === 2, `duration-less event must be excluded, got ${result.bars.length} bars`);
assert(result.maxDepth === 1, `expected depth 1, got ${result.maxDepth}`);
assert(result.bars.find((bar) => bar.id === "db")?.depth === 1, "child span depth should be preserved");
assert(result.totalMs === 100, `expected 100ms total range, got ${result.totalMs}`);
console.log("PASS trace flame layout + duration honesty guard");

const largeTrace = Array.from({ length: 200000 }, (_, index) => ({
  id: `large-${index}`,
  level: "INFO",
  service: "api",
  timestampMs: base + index,
  correlations: { span: `span-${index}` },
  traceMeta: { parentSpan: "", durationMs: 1, name: "large-span" }
}));
const largeLayout = SignalDockTraceFlame.layout(largeTrace, { maxBars: 50 });
assert(largeLayout.available, "large trace flame layout should remain available");
assert(largeLayout.minStart === base, "large flame minimum timestamp mismatch");
assert(largeLayout.maxEnd === base + 200000, "large flame maximum end mismatch");
assert(largeLayout.bars.length === 50 && largeLayout.omitted === 199950, "large flame render bound mismatch");
console.log("PASS large trace flame range scan");
