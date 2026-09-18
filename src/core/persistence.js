(function (root) {
  "use strict";

  const DB_NAME = "signaldock-local-state";
  const DB_VERSION = 2;
  const STORE = "recovery";
  const LEGACY_DATASET_KEY = "dataset";
  const MANIFEST_KEY = "dataset-manifest";
  const VIEW_KEY = "view";
  const CHUNK_PREFIX = "dataset-chunk:";
  const CHUNK_BYTES = 4 * 1024 * 1024;
  const MAX_AUTO_ENTRIES = 500000;
  const MAX_ESTIMATED_BYTES = 350 * 1024 * 1024;
  const MAX_CHUNKS = Math.ceil(MAX_ESTIMATED_BYTES / CHUNK_BYTES);

  function validChunkCount(value) {
    return Number.isInteger(value) && value >= 1 && value <= MAX_CHUNKS ? value : 0;
  }

  function estimateEntryBytes(entry) {
    let size = 160;
    const values = [entry?.source, entry?.service, entry?.message, entry?.timestamp];
    for (const value of values) size += String(value || "").length * 2;
    try { size += JSON.stringify(entry?.raw ?? "").length * 2; } catch { size += String(entry?.raw ?? "").length * 2; }
    try { size += JSON.stringify(entry?.correlations || {}).length * 2; } catch { /* ignore */ }
    try { size += JSON.stringify(entry?.traceMeta || {}).length * 2; } catch { /* ignore */ }
    try { size += JSON.stringify(entry?.dimensions || {}).length * 2; } catch { /* ignore */ }
    return size;
  }

  function estimateSnapshotBytes(entries) {
    if (!Array.isArray(entries) || !entries.length) return 0;
    const sampleCount = Math.min(entries.length, 240);
    let total = 0;
    const step = Math.max(1, Math.floor(entries.length / sampleCount));
    let sampled = 0;
    for (let i = 0; i < entries.length && sampled < sampleCount; i += step) {
      total += estimateEntryBytes(entries[i]);
      sampled += 1;
    }
    return Math.ceil((total / Math.max(sampled, 1)) * entries.length);
  }

  function autosaveEligibility(entries) {
    const count = Array.isArray(entries) ? entries.length : 0;
    if (!count) return { allowed: false, reason: "No entries loaded", estimatedBytes: 0 };
    if (count > MAX_AUTO_ENTRIES) return { allowed: false, reason: `Autosave is limited to ${MAX_AUTO_ENTRIES.toLocaleString()} entries`, estimatedBytes: 0 };
    const estimatedBytes = estimateSnapshotBytes(entries);
    if (estimatedBytes > MAX_ESTIMATED_BYTES) return { allowed: false, reason: "Estimated recovery snapshot exceeds the 350 MB safety limit", estimatedBytes };
    return { allowed: true, reason: "", estimatedBytes };
  }

  function openDb() {
    if (!root.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local recovery database."));
    });
  }

  async function withStore(mode, callback) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        try { result = callback(store, tx); } catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error("Local recovery transaction failed."));
        tx.onabort = () => reject(tx.error || new Error("Local recovery transaction was aborted."));
      });
    } finally {
      db.close();
    }
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
  }

  async function getRecords(keys) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      return await Promise.all(keys.map((key) => requestValue(store.get(key))));
    } finally { db.close(); }
  }

  async function saveDataset(entries, workspace, appVersion) {
    const eligibility = autosaveEligibility(entries);
    if (!eligibility.allowed) return eligibility;
    if (!root.SignalDockWorkspace) throw new Error("Workspace engine is unavailable.");

    const parts = root.SignalDockWorkspace.serializeParts(entries, workspace || {}, appVersion || "");
    const blob = new Blob(parts, { type: "application/json" });
    if (blob.size > MAX_ESTIMATED_BYTES) return { allowed: false, reason: "Recovery snapshot exceeded the 350 MB safety limit", estimatedBytes: blob.size };

    let previousManifest = null;
    try { [previousManifest] = await getRecords([MANIFEST_KEY]); } catch { /* first save or restricted storage */ }

    const savedAt = new Date().toISOString();
    const chunkCount = Math.max(1, Math.ceil(blob.size / CHUNK_BYTES));
    await withStore("readwrite", (store) => {
      for (let index = 0; index < chunkCount; index += 1) {
        const start = index * CHUNK_BYTES;
        store.put({ key: `${CHUNK_PREFIX}${index}`, blob: blob.slice(start, Math.min(blob.size, start + CHUNK_BYTES)) });
      }
      store.put({
        key: MANIFEST_KEY,
        savedAt,
        entryCount: entries.length,
        byteSize: blob.size,
        appVersion: appVersion || "",
        chunkCount,
        chunkBytes: CHUNK_BYTES,
        format: "chunked-v1"
      });
      store.delete(LEGACY_DATASET_KEY);
      const oldCount = validChunkCount(previousManifest?.chunkCount);
      const cleanupLimit = oldCount || (previousManifest ? MAX_CHUNKS : chunkCount);
      for (let index = chunkCount; index < cleanupLimit; index += 1) store.delete(`${CHUNK_PREFIX}${index}`);
    });

    return { allowed: true, savedAt, entryCount: entries.length, byteSize: blob.size, chunkCount, estimatedBytes: eligibility.estimatedBytes };
  }

  async function saveView(view, settings) {
    const savedAt = new Date().toISOString();
    await withStore("readwrite", (store) => {
      store.put({ key: VIEW_KEY, savedAt, view: view || {}, settings: settings || {} });
    });
    return { savedAt };
  }

  async function recoveryInfo() {
    if (!root.indexedDB) return null;
    const [manifest, legacy, view] = await getRecords([MANIFEST_KEY, LEGACY_DATASET_KEY, VIEW_KEY]);
    const manifestChunkCount = validChunkCount(manifest?.chunkCount);
    const activeManifest = manifestChunkCount ? manifest : null;
    const dataset = activeManifest || legacy;
    if (!dataset) return null;
    return {
      savedAt: view?.savedAt || dataset.savedAt,
      datasetSavedAt: dataset.savedAt,
      entryCount: Number(dataset.entryCount) || 0,
      byteSize: Number(dataset.byteSize) || Number(dataset.blob?.size) || 0,
      appVersion: dataset.appVersion || "",
      hasView: Boolean(view),
      chunkCount: activeManifest ? manifestChunkCount : 1,
      format: activeManifest ? "chunked-v1" : "legacy"
    };
  }

  async function loadRecovery() {
    const [manifest, legacy, view] = await getRecords([MANIFEST_KEY, LEGACY_DATASET_KEY, VIEW_KEY]);
    let blob = null;
    let metadata = null;

    if (manifest?.chunkCount) {
      const chunkCount = validChunkCount(manifest.chunkCount);
      if (!chunkCount) throw new Error("Recovery snapshot manifest has an invalid chunk count.");
      const keys = Array.from({ length: chunkCount }, (_, index) => `${CHUNK_PREFIX}${index}`);
      const chunks = await getRecords(keys);
      if (chunks.some((chunk) => !chunk?.blob)) throw new Error("Recovery snapshot is incomplete or corrupted.");
      blob = new Blob(chunks.map((chunk) => chunk.blob), { type: "application/json" });
      metadata = manifest;
    } else if (legacy?.blob) {
      blob = legacy.blob;
      metadata = legacy;
    }

    if (!blob) return null;
    const parsed = root.SignalDockWorkspace.parse(await blob.text());
    if (view) {
      parsed.workspace = parsed.workspace || {};
      parsed.workspace.view = Object.assign({}, parsed.workspace.view || {}, view.view || {});
      parsed.workspace.settings = Object.assign({}, parsed.workspace.settings || {}, view.settings || {});
    }
    return {
      parsed,
      metadata: {
        savedAt: view?.savedAt || metadata.savedAt,
        byteSize: Number(metadata.byteSize) || blob.size,
        entryCount: Number(metadata.entryCount) || parsed.entries.length,
        chunkCount: manifest ? validChunkCount(metadata.chunkCount) : 1,
        format: manifest ? "chunked-v1" : "legacy"
      }
    };
  }

  async function clearRecovery() {
    if (!root.indexedDB) return;
    await withStore("readwrite", (store) => {
      store.delete(MANIFEST_KEY);
      store.delete(LEGACY_DATASET_KEY);
      store.delete(VIEW_KEY);
      for (let index = 0; index < MAX_CHUNKS; index += 1) store.delete(`${CHUNK_PREFIX}${index}`);
    });
  }

  root.SignalDockPersistence = {
    DB_VERSION,
    CHUNK_BYTES,
    MAX_AUTO_ENTRIES,
    MAX_ESTIMATED_BYTES,
    MAX_CHUNKS,
    validChunkCount,
    estimateSnapshotBytes,
    autosaveEligibility,
    saveDataset,
    saveView,
    recoveryInfo,
    loadRecovery,
    clearRecovery
  };
}(typeof self !== "undefined" ? self : window));
