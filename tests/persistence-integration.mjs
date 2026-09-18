import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const records = new Map();

function asyncRequest(producer) {
  const request = {};
  setTimeout(() => {
    try { request.result = producer(); request.onsuccess?.(); }
    catch (error) { request.error = error; request.onerror?.(); }
  }, 0);
  return request;
}

function makeStore(tx) {
  return {
    put(value) { records.set(value.key, structuredClone(value)); tx.pending += 1; setTimeout(() => { tx.pending -= 1; tx.maybeComplete(); }, 0); },
    delete(key) { records.delete(key); tx.pending += 1; setTimeout(() => { tx.pending -= 1; tx.maybeComplete(); }, 0); },
    get(key) { tx.pending += 1; const req = asyncRequest(() => records.get(key)); const originalSuccess = () => {}; setTimeout(() => { tx.pending -= 1; tx.maybeComplete(); }, 1); return req; }
  };
}

function makeDb() {
  return {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    transaction() {
      const tx = {
        pending: 0,
        done: false,
        objectStore() { return makeStore(tx); },
        maybeComplete() { if (!tx.done && tx.pending === 0) { tx.done = true; setTimeout(() => tx.oncomplete?.(), 0); } }
      };
      return tx;
    },
    close() {}
  };
}

globalThis.window = globalThis;
globalThis.indexedDB = {
  open() {
    const request = {};
    setTimeout(() => {
      request.result = makeDb();
      request.onupgradeneeded?.();
      request.onsuccess?.();
    }, 0);
    return request;
  }
};

for (const file of ["src/core/workspace.js", "src/core/persistence.js"]) vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });

function assert(condition, message) { if (!condition) throw new Error(message); }

const entries = [
  { source: "api.log", service: "api", index: 0, raw: { message: "boom", trace_id: "t-1" }, message: "boom", level: "ERROR", timestamp: "2026-09-12T20:00:00Z", timestampMs: Date.parse("2026-09-12T20:00:00Z"), correlations: { trace: "t-1" }, traceMeta: {} },
  { source: "large.log", service: "worker", index: 1, raw: "x".repeat(4.5 * 1024 * 1024), message: "large recovery payload", level: "INFO", timestamp: "", timestampMs: null, correlations: {}, traceMeta: {} }
];
const workspace = { loadedBytes: 42, inputFileCount: 1, view: { query: "level:error" }, settings: { autosave: true, parserProfile: "auto" }, investigation: { schema: "signaldock.investigation", version: 1, title: "Recovery case", summary: "local", items: [{ id: "ev-1", entryId: "sd-0", globalIndex: 0, source: "api.log", service: "api", level: "ERROR", timestamp: "2026-09-12T20:00:00Z", message: "boom", note: "preserve me", tags: ["recovery"] }] }, caseFile: { schema:'signaldock.case', version:1, title:'Recovery case', status:'monitoring', severity:'sev3', findings:[{id:'f1',title:'Finding',body:'Recovered',state:'confirmed',tags:[],evidenceIds:['ev-1']}] } };

const staleLastChunkKey = `dataset-chunk:${globalThis.SignalDockPersistence.MAX_CHUNKS - 1}`;
records.set("dataset-manifest", { key: "dataset-manifest", chunkCount: "corrupt" });
records.set(staleLastChunkKey, { key: staleLastChunkKey, blob: new Blob(["stale-orphan"]) });
const saved = await globalThis.SignalDockPersistence.saveDataset(entries, workspace, "1.9.0");
assert(!records.has(staleLastChunkKey), "successful recovery save must sweep stale chunks when the previous manifest is corrupt");
assert(saved.allowed, "dataset autosave failed");
await globalThis.SignalDockPersistence.saveView({ query: "trace:t-1", inspectorTab: "trace" }, { autosave: true, parserProfile: "auto" });
const info = await globalThis.SignalDockPersistence.recoveryInfo();
assert(info?.entryCount === 2, "recovery metadata count failed");
assert(info?.format === "chunked-v1" && info.chunkCount >= 2, "recovery should use multiple chunks for large snapshots");
const recovery = await globalThis.SignalDockPersistence.loadRecovery();
assert(recovery?.parsed?.entries?.[0]?.correlations?.trace === "t-1", "recovery dataset did not round-trip");
assert(recovery.parsed.workspace.view.query === "trace:t-1", "latest recovery view did not merge");
assert(recovery.parsed.workspace.investigation?.items?.[0]?.note === "preserve me", "investigation notebook did not survive recovery");
assert(recovery.parsed.workspace.caseFile?.status === 'monitoring' && recovery.parsed.workspace.caseFile?.findings?.[0]?.body === 'Recovered', 'case workspace did not survive recovery');
records.set("dataset-manifest", { key: "dataset-manifest", chunkCount: "corrupt", entryCount: 999, savedAt: "2026-09-12T20:00:00Z" });
assert(await globalThis.SignalDockPersistence.recoveryInfo() === null, "corrupt recovery manifest must not be advertised as restorable");
records.set("dataset-chunk:0", { key: "dataset-chunk:0", blob: new Blob(["orphan-0"]) });
records.set(`dataset-chunk:${globalThis.SignalDockPersistence.MAX_CHUNKS - 1}`, { key: `dataset-chunk:${globalThis.SignalDockPersistence.MAX_CHUNKS - 1}`, blob: new Blob(["orphan-last"]) });
records.set("dataset-manifest", { key: "dataset-manifest", chunkCount: "corrupt" });
records.set("dataset-chunk:0", { key: "dataset-chunk:0", blob: new Blob(["orphan-0"]) });
const lastChunkKey = `dataset-chunk:${globalThis.SignalDockPersistence.MAX_CHUNKS - 1}`;
records.set(lastChunkKey, { key: lastChunkKey, blob: new Blob(["orphan-last"]) });
await globalThis.SignalDockPersistence.clearRecovery();
assert(await globalThis.SignalDockPersistence.recoveryInfo() === null, "recovery clear failed");
assert(!records.has("dataset-chunk:0"), "recovery clear must remove orphan first chunk");
assert(!records.has(lastChunkKey), "recovery clear must remove orphan last bounded chunk");
assert(!records.has("dataset-chunk:0"), "recovery clear must remove orphan first chunk");
assert(!records.has(`dataset-chunk:${globalThis.SignalDockPersistence.MAX_CHUNKS - 1}`), "recovery clear must remove orphan last bounded chunk");
console.log("PASS IndexedDB chunked recovery dataset save/load");
console.log("PASS multi-chunk recovery manifest");
console.log("PASS recovery view overlay");
console.log("PASS recovery clear");
console.log("SignalDock persistence integration test passed.");
