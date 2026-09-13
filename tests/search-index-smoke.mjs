import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.self = globalThis;
globalThis.window = globalThis;
for (const name of ["search-index.js", "query-engine.js"]) vm.runInThisContext(fs.readFileSync(path.join(root, name), "utf8"), { filename: name });
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
console.log(`PASS search index build (${index.stats.tokens.toLocaleString()} tokens · ${index.stats.elapsedMs} ms)`);
console.log("PASS 3-gram substring candidate narrowing + semantic fallback guards");
