import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.self = globalThis;
globalThis.window = globalThis;
for (const name of ["src/core/search-index.js", "src/core/query-engine.js"]) vm.runInThisContext(fs.readFileSync(path.join(root, name), "utf8"), { filename: name });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const entries = Array.from({ length: 25000 }, (_, i) => ({
  level: i % 17 === 0 ? "ERROR" : "INFO",
  source: i % 2 ? "api.log" : "worker.log",
  service: i % 2 ? "api" : "worker",
  message: i === 17777 ? "needle timeout signature" : `routine message ${i}`,
  searchText: i === 17777 ? "needle timeout signature api.log api" : `routine message ${i} ${i % 2 ? "api.log api" : "worker.log worker"}`,
  correlations: i === 17777 ? { trace: "trace-special" } : {},
  dimensions: { environment: "production", namespace: i % 2 ? "edge" : "jobs" },
  exceptionFingerprint: i === 17777 ? "ex-special" : "",
  timestampMs: i
}));
const index = SignalDockSearchIndex.build(entries);
assert(index.stats.enabled, "large dataset should enable local search index");
assert(index.stats.tokens > 0 && index.stats.postings > 0, "search index should contain tokens/postings");
const parsed = SignalDockQueryEngine.parseSmartQuery("needle service:api env:production trace:trace-special");
const candidate = SignalDockSearchIndex.candidates(index, parsed, {});
assert(candidate.reason === "indexed" && candidate.indexes.length === 1 && candidate.indexes[0] === 17777, `unexpected indexed candidates: ${candidate.indexes}`);
const result = SignalDockQueryEngine.filterIndexes(entries, { parsed, showUnknown: true, sortMode: "original" }, candidate.indexes);
assert(result.indexes.length === 1 && result.indexes[0] === 17777, "indexed candidates must preserve final query semantics");
const substringParsed = SignalDockQueryEngine.parseSmartQuery("need");
const substring = SignalDockSearchIndex.candidates(index, substringParsed, {});
assert(Array.isArray(substring.indexes) && substring.indexes.includes(17777), "3-gram index must preserve substring matches such as need -> needle");
const substringResult = SignalDockQueryEngine.filterIndexes(entries, { parsed: substringParsed, showUnknown: true, sortMode: "original" }, substring.indexes);
assert(substringResult.indexes.includes(17777), "final query engine must retain substring match after candidate narrowing");
const exceptionParsed = SignalDockQueryEngine.parseSmartQuery("exception:ex-special");
const exceptionCandidates = SignalDockSearchIndex.candidates(index, exceptionParsed, {});
assert(exceptionCandidates.indexes?.length === 1 && exceptionCandidates.indexes[0] === 17777, "exception fingerprint should use exact candidate index");
const regex = SignalDockSearchIndex.candidates(index, SignalDockQueryEngine.parseSmartQuery("re:/needle/i"), {});
assert(regex.indexes === null, "regex query should use linear fallback");

const multiLevelParsed = SignalDockQueryEngine.parseSmartQuery("level:error,info service:api");
const multiLevelCandidates = SignalDockSearchIndex.candidates(index, multiLevelParsed, {});
assert(Array.isArray(multiLevelCandidates.indexes), "multi-level query should stay indexable");
for (let i = 1; i < multiLevelCandidates.indexes.length; i += 1) assert(multiLevelCandidates.indexes[i - 1] < multiLevelCandidates.indexes[i], "multi-level candidate union must stay sorted and unique");
const multiLevelIndexed = SignalDockQueryEngine.filterIndexes(entries, { parsed: multiLevelParsed, showUnknown: true, sortMode: "original" }, multiLevelCandidates.indexes);
const multiLevelLinear = SignalDockQueryEngine.filterIndexes(entries, { parsed: multiLevelParsed, showUnknown: true, sortMode: "original" });
assert(multiLevelIndexed.indexes.join(",") === multiLevelLinear.indexes.join(","), "multi-level indexed union changed query semantics");

const anyParsed = SignalDockQueryEngine.parseSmartQuery("any:needle,timeout");
const anyCandidates = SignalDockSearchIndex.candidates(index, anyParsed, {});
assert(Array.isArray(anyCandidates.indexes), "any query should stay indexable");
for (let i = 1; i < anyCandidates.indexes.length; i += 1) assert(anyCandidates.indexes[i - 1] < anyCandidates.indexes[i], "any candidate union must stay sorted and unique");
const anyIndexed = SignalDockQueryEngine.filterIndexes(entries, { parsed: anyParsed, showUnknown: true, sortMode: "original" }, anyCandidates.indexes);
const anyLinear = SignalDockQueryEngine.filterIndexes(entries, { parsed: anyParsed, showUnknown: true, sortMode: "original" });
assert(anyIndexed.indexes.join(",") === anyLinear.indexes.join(","), "any indexed union changed query semantics");
console.log(`PASS search index build (${index.stats.tokens.toLocaleString()} tokens · ${index.stats.elapsedMs} ms)`);
console.log("PASS 3-gram substring candidate narrowing + semantic fallback guards");
const searchIndexSource = fs.readFileSync(path.join(root, "src/core/search-index.js"), "utf8");
assert(searchIndexSource.includes("function mergeSortedUnique("), "search index must merge sorted posting lists directly");
assert(!searchIndexSource.includes("const set = new Set();\n    for (const array of arrays)"), "search index union must not materialize a global Set then sort");
assert(!searchIndexSource.includes("for (const array of arrays) current = mergeSortedUnique(current, array);"), "search index union must not repeatedly merge into one growing array");
assert(searchIndexSource.includes("while (current.length > 1)"), "search index union must use balanced pairwise merging");
console.log("PASS sorted multi-posting union equivalence");
