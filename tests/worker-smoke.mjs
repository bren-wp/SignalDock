import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const posted = [];
const workerToken = "d".repeat(32);
let messageHandler = null;

globalThis.self = {
  location: { href: `https://local.invalid/filter-worker.js?sd_session=${workerToken}` },
  postMessage(message) { posted.push(message); },
  addEventListener(type, handler) { if (type === "message") messageHandler = handler; }
};
globalThis.importScripts = (...names) => {
  for (const name of names) vm.runInThisContext(fs.readFileSync(path.join(root, name), "utf8"), { filename: name });
};
globalThis.performance ??= { now: () => Date.now() };

vm.runInThisContext(fs.readFileSync(path.join(root, "filter-worker.js"), "utf8"), { filename: "filter-worker.js" });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const handler = messageHandler || self.onmessage;
assert(typeof handler === "function", "worker message handler missing");
assert(posted.shift()?.type === "ready", "worker did not announce ready state");
const envelope = (data) => messageHandler ? { ...data, protocol: 1, token: workerToken } : data;
const entries = [
  { level: "ERROR", source: "a.log", service: "worker", message: "connect ETIMEDOUT", timestampMs: 1, searchText: "connect etimedout trace:trace-1", correlations: { trace: "trace-1", job: "job-1" } },
  { level: "INFO", source: "a.log", service: "worker", message: "retrying", timestampMs: 2, searchText: "retrying trace:trace-1", correlations: { trace: "trace-1", job: "job-1" } },
  { level: "INFO", source: "b.log", service: "api", message: "healthy", timestampMs: 3, searchText: "healthy", correlations: {} }
];

await handler({ data: envelope({ type: "index", version: 7, entries }) });
const indexed = posted.shift();
assert(indexed?.type === "indexed" && indexed.version === 7 && indexed.count === 3, "worker indexing protocol failed");

await handler({ data: envelope({ type: "filter", requestId: 11, request: { query: "level:error re:/ETIMEDOUT/i", showUnknown: true } }) });
const filtered = posted.shift();
assert(filtered?.type === "filtered" && filtered.requestId === 11 && filtered.version === 7, "worker filter response metadata failed");
assert(filtered.indexes.length === 1 && filtered.indexes[0] === 0, `worker filter expected index 0, received ${filtered.indexes}`);

await handler({ data: envelope({ type: "correlate", requestId: 12, correlations: { trace: "trace-1" }, origin: 1, limit: 20 }) });
const correlated = posted.shift();
assert(correlated?.type === "correlated" && correlated.requestId === 12 && correlated.version === 7, "worker correlate response metadata failed");
assert(correlated.indexes.length === 2 && correlated.indexes.includes(0) && correlated.indexes.includes(1), `worker correlation mismatch: ${correlated.indexes}`);

await handler({ data: envelope({ type: "trace", requestId: 13, correlations: { trace: "trace-1" }, origin: 0, limit: 1000 }) });
const traceRelated = posted.shift();
assert(traceRelated?.type === "trace-related" && traceRelated.requestId === 13 && traceRelated.version === 7, "worker trace response metadata failed");
assert(traceRelated.indexes.length === 2 && traceRelated.indexes.includes(0) && traceRelated.indexes.includes(1), `worker trace mismatch: ${traceRelated.indexes}`);

console.log("PASS worker indexing");
console.log("PASS worker filtering");
console.log("PASS worker correlation");
console.log("PASS worker trace lookup");
console.log("SignalDock worker smoke test passed.");
