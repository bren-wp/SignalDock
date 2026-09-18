import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "src/analysis/service-map.js"), "utf8"), { filename: "src/analysis/service-map.js" });
vm.runInThisContext(fs.readFileSync(path.join(root, "src/vendor/zip.js"), "utf8"), { filename: "src/vendor/zip.js" });
vm.runInThisContext(fs.readFileSync(path.join(root, "src/core/parser.js"), "utf8"), { filename: "src/core/parser.js" });

function assert(condition, message) { if (!condition) throw new Error(message); }

const entries = [
  { service: "api", level: "INFO", correlations: { trace: "t1", span: "s1" }, traceMeta: { parentSpan: "", durationMs: 30 } },
  { service: "auth", level: "ERROR", correlations: { trace: "t1", span: "s2" }, traceMeta: { parentSpan: "s1", durationMs: 8 } },
  { service: "db", level: "INFO", correlations: { trace: "t1", span: "s3" }, traceMeta: { parentSpan: "s1", durationMs: 12 } },
  { service: "auth", level: "WARN", correlations: { trace: "t2", span: "s4" }, traceMeta: { parentSpan: "", durationMs: 4 } }
];
const graph = globalThis.SignalDockServiceMap.build(entries);
assert(graph.stats.services === 3, "service count mismatch");
assert(graph.stats.edges === 2, "explicit edge count mismatch");
assert(graph.stats.traces === 2, "trace count mismatch");
assert(graph.edges.some((edge) => edge.from === "api" && edge.to === "auth" && edge.errors === 1), "api -> auth edge missing");
assert(graph.edges.some((edge) => edge.from === "api" && edge.to === "db"), "api -> db edge missing");
const layout = globalThis.SignalDockServiceMap.layout(graph, 920, 500);
assert(layout.nodes.length === 3 && layout.edges.length === 2, "layout should preserve graph topology");
assert(layout.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)), "layout positions should be finite");
console.log("PASS service map aggregation");
console.log("PASS explicit parent-span edges");
console.log("PASS deterministic local layout");
console.log("SignalDock service map smoke test passed.");

const sampleText = fs.readFileSync(path.join(root, "sample", "signal-demo.ndjson"), "utf8");
const parsed = globalThis.SignalDockParser.parseText(sampleText, "signal-demo.ndjson", "json");
const sampleGraph = globalThis.SignalDockServiceMap.build(parsed);
assert(sampleGraph.edges.some((edge) => edge.from === "api" && edge.to === "auth"), "sample api -> auth dependency missing");
assert(sampleGraph.edges.some((edge) => edge.from === "api" && edge.to === "db"), "sample api -> db dependency missing");
assert(sampleGraph.edges.some((edge) => edge.from === "worker" && edge.to === "auth"), "sample worker -> auth dependency missing");
console.log("PASS sample distributed trace topology");

const scopedEntries = [
  { service: "api", level: "INFO", dimensions: { environment: "prod", namespace: "front" }, correlations: { trace: "t3", span: "p1" }, traceMeta: { parentSpan: "", durationMs: 10 } },
  { service: "db", level: "INFO", dimensions: { environment: "prod", namespace: "data" }, correlations: { trace: "t3", span: "p2" }, traceMeta: { parentSpan: "p1", durationMs: 5 } },
  { service: "api", level: "WARN", dimensions: { environment: "staging", namespace: "front" }, correlations: { trace: "t4", span: "s1" }, traceMeta: { parentSpan: "", durationMs: 4 } }
];
const envGraph = globalThis.SignalDockServiceMap.build(scopedEntries, null, { groupBy: "environment" });
assert(envGraph.stats.groups === 2 && envGraph.nodes.some((node) => node.id === "prod"), "environment grouping failed");
const nsServiceGraph = globalThis.SignalDockServiceMap.build(scopedEntries, null, { groupBy: "namespace-service" });
assert(nsServiceGraph.nodes.some((node) => node.id === "front/api") && nsServiceGraph.nodes.some((node) => node.id === "data/db"), "namespace + service grouping failed");
assert(nsServiceGraph.edges.some((edge) => edge.from === "front/api" && edge.to === "data/db"), "grouped explicit dependency missing");
console.log("PASS environment/namespace topology grouping");

const manyServices = Array.from({ length: 2000 }, (_, index) => ({
  service: `svc-${String(index).padStart(4, "0")}`,
  level: "INFO",
  correlations: { trace: `trace-${index}`, span: `span-${index}` },
  traceMeta: { parentSpan: "", durationMs: 1 }
}));
const cappedGraph = globalThis.SignalDockServiceMap.build(manyServices);
assert(cappedGraph.stats.services === 2000, "large service map service count mismatch");
assert(cappedGraph.stats.groups === 2000, "large service map group count mismatch");
assert(cappedGraph.nodes.length === globalThis.SignalDockServiceMap.MAX_NODES, "service map visible node cap mismatch");
assert(cappedGraph.stats.hiddenServices === 2000 - globalThis.SignalDockServiceMap.MAX_NODES, "service map hidden node count mismatch");
assert(cappedGraph.nodes[0]?.id === "svc-0000" && cappedGraph.nodes.at(-1)?.id === "svc-0023", "bounded service map tie ranking mismatch");
console.log("PASS bounded service map node ranking");
