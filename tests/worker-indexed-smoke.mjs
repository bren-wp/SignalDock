import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const posted = [];
const workerToken = "c".repeat(32);
let messageHandler = null;
globalThis.self = {
  location: { href: `https://local.invalid/filter-worker.js?sd_session=${workerToken}` },
  postMessage(message) { posted.push(message); },
  addEventListener(type, handler) { if (type === "message") messageHandler = handler; }
};
globalThis.importScripts = (...names) => { for (const name of names) vm.runInThisContext(fs.readFileSync(path.join(root, name), "utf8"), { filename: name }); };
globalThis.performance ??= { now: () => Date.now() };
vm.runInThisContext(fs.readFileSync(path.join(root, "filter-worker.js"), "utf8"), { filename: "filter-worker.js" });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const handler = messageHandler || self.onmessage;
assert(typeof handler === "function", "worker message handler missing");
assert(posted.shift()?.type === "ready", "worker should announce ready");
const envelope = (data) => messageHandler ? { ...data, protocol: 1, token: workerToken } : data;
const entries = Array.from({ length: 25000 }, (_, i) => ({ level: "INFO", source: "bulk.log", service: "api", message: i === 19001 ? "needle marker" : `routine ${i}`, searchText: i === 19001 ? "needle marker bulk.log api" : `routine ${i} bulk.log api`, correlations: {}, dimensions: {}, timestampMs: i }));
await handler({ data: envelope({ type: "index", version: 17, entries }) });
const indexed = posted.shift();
assert(indexed?.type === "indexed" && indexed.searchIndex?.enabled, "large worker dataset should build search index");
await handler({ data: envelope({ type: "filter", requestId: 71, request: { query: "needle", showUnknown: true, sortMode: "original" } }) });
const result = posted.shift();
assert(result?.type === "filtered" && result.searchMode === "indexed", `expected indexed worker filtering, got ${result?.searchMode}`);
assert(result.candidateCount === 1 && result.indexes.length === 1 && result.indexes[0] === 19001, `unexpected indexed worker result: candidates=${result.candidateCount}, indexes=${result.indexes}`);
console.log(`PASS worker indexed filtering (${indexed.searchIndex.tokens.toLocaleString()} tokens · 1 candidate)`);
