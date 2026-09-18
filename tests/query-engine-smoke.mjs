import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "src/core/query-engine.js"), "utf8"), { filename: "src/core/query-engine.js" });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const entries = [
  { level: "INFO", source: "a.log", service: "api", message: "alpha", searchText: "alpha api", timestampMs: 300, correlations: {}, dimensions: {} },
  { level: "ERROR", source: "b.log", service: "worker", message: "beta", searchText: "beta worker", timestampMs: 100, correlations: {}, dimensions: {} },
  { level: "WARN", source: "c.log", service: "api", message: "gamma", searchText: "gamma api", timestampMs: 200, correlations: {}, dimensions: {} }
];

const full = globalThis.SignalDockQueryEngine.filterIndexes(entries, { query: "", sortMode: "original", showUnknown: true });
assert(full.indexes.join(",") === "0,1,2", "full original-order query changed");

const sortedCandidates = globalThis.SignalDockQueryEngine.filterIndexes(entries, { query: "", sortMode: "original", showUnknown: true }, [0, 2]);
assert(sortedCandidates.indexes.join(",") === "0,2", "sorted candidate order changed");

const unsortedCandidates = globalThis.SignalDockQueryEngine.filterIndexes(entries, { query: "", sortMode: "original", showUnknown: true }, [2, 0, 1]);
assert(unsortedCandidates.indexes.join(",") === "0,1,2", "unsorted candidates must be normalized to original order");

const newest = globalThis.SignalDockQueryEngine.filterIndexes(entries, { query: "", sortMode: "newest", showUnknown: true });
assert(newest.indexes.join(",") === "0,2,1", "newest ordering changed");

const source = fs.readFileSync(path.join(root, "src/core/query-engine.js"), "utf8");
assert(source.includes('if (sortMode !== "original" || !ascending)'), "query engine must skip redundant original-order sorts only when input is already ascending");

console.log("query-engine-smoke PASS");
