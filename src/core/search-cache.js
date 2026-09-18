(function (root) {
  "use strict";

  const DB_NAME = "signaldock-search-cache-v3";
  const LEGACY_DB_NAMES = ["signaldock-search-cache-v2", "signaldock-search-cache-v1"];
  const STORE = "cache";
  const META_KEY = "active-meta";
  const BUCKET_PREFIX = "active-bucket:";
  const VERSION = 3;
  const BUCKET_COUNT = 64;
  const MAX_ESTIMATED_BYTES = 220 * 1024 * 1024;
  const MAX_RUNTIME_BUCKETS = 24;
  const runtimeBuckets = new Map();

  function available() { return typeof indexedDB !== "undefined"; }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!available()) { reject(new Error("IndexedDB unavailable")); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open search cache"));
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Search cache request failed"));
    });
  }

  function deleteDatabase(name) {
    if (!available() || typeof indexedDB.deleteDatabase !== "function") return Promise.resolve();
    return new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve(); request.onerror = () => resolve(); request.onblocked = () => resolve();
    });
  }

  async function deleteLegacyDatabases() { await Promise.all(LEGACY_DB_NAMES.map(deleteDatabase)); }

  async function getRecords(keys) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      return await Promise.all(keys.map((key) => requestResult(store.get(key))));
    } finally { db.close(); }
  }

  async function withStore(mode, callback) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode); const store = tx.objectStore(STORE); let value;
        try { value = callback(store, tx); } catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error || new Error("Search cache transaction failed")); tx.onabort = () => reject(tx.error || new Error("Search cache transaction aborted"));
      });
    } finally { db.close(); }
  }

  async function fingerprint(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const step = Math.max(1, Math.ceil(list.length / 2048));
    const parts = [`n=${list.length}`];
    for (let i = 0; i < list.length; i += step) {
      const entry = list[i] || {};
      parts.push(`${i}|${entry.source || ""}|${entry.index ?? ""}|${entry.timestamp || ""}|${String(entry.message || "").slice(0, 96)}`);
    }
    if (list.length > 1) { const last = list[list.length - 1] || {}; parts.push(`last|${last.source || ""}|${last.index ?? ""}|${last.timestamp || ""}|${String(last.message || "").slice(0, 96)}`); }
    const text = parts.join("\n");
    if (root.crypto?.subtle && typeof TextEncoder !== "undefined") {
      const digest = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `fnv-${(hash >>> 0).toString(16).padStart(8, "0")}-${list.length}`;
  }

  function estimateBytes(index) {
    const stats = index?.stats || {};
    return Math.max(0, Number(stats.postings || 0) * 6 + Number(stats.tokens || 0) * 96 + Number(stats.entries || 0) * 2);
  }

  function eligible(index) {
    const estimatedBytes = estimateBytes(index);
    return { allowed: Boolean(index?.stats?.enabled) && !index?.stats?.truncated && estimatedBytes <= MAX_ESTIMATED_BYTES, estimatedBytes };
  }

  function mapEntries(map) { return map instanceof Map ? [...map.entries()] : []; }
  function correlationEntries(map) { return map instanceof Map ? [...map.entries()].map(([kind, values]) => [kind, mapEntries(values)]) : []; }
  function hydrateMap(entries) { return new Map(Array.isArray(entries) ? entries : []); }
  function hydrateCorrelations(entries) { const out = new Map(); for (const [kind, values] of Array.isArray(entries) ? entries : []) out.set(kind, hydrateMap(values)); return out; }

  function bucketId(key) {
    const text = String(key || ""); let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0) % BUCKET_COUNT;
  }

  function validBucketIds(value) {
    if (!Array.isArray(value) || value.length > BUCKET_COUNT) return false;
    const seen = new Set();
    for (const id of value) {
      if (!Number.isInteger(id) || id < 0 || id >= BUCKET_COUNT || seen.has(id)) return false;
      seen.add(id);
    }
    return true;
  }

  function indexShell(meta) {
    return {
      tokenMap: new Map(),
      levelMap: hydrateMap(meta.maps?.level), serviceMap: hydrateMap(meta.maps?.service), sourceMap: hydrateMap(meta.maps?.source),
      environmentMap: hydrateMap(meta.maps?.environment), namespaceMap: hydrateMap(meta.maps?.namespace), exceptionMap: hydrateMap(meta.maps?.exception),
      correlationMaps: hydrateCorrelations(meta.maps?.correlations), stats: meta.stats
    };
  }

  async function loadMeta(datasetKey) {
    if (!available() || !datasetKey) return null;
    const [meta] = await getRecords([META_KEY]);
    if (!meta || meta.version !== VERSION || meta.datasetKey !== datasetKey || !meta.stats || !validBucketIds(meta.bucketIds)) return null;
    return meta;
  }

  async function loadMetadata(datasetKey) {
    const meta = await loadMeta(datasetKey); if (!meta) return null;
    return { index: indexShell(meta), metadata: { savedAt: meta.savedAt, estimatedBytes: meta.estimatedBytes || 0, segmentCount: meta.bucketIds.length, bucketCount: meta.bucketIds.length, format: "bucketed-v3", datasetKey } };
  }

  function touchRuntimeBucket(key, record) {
    runtimeBuckets.delete(key); runtimeBuckets.set(key, record);
    while (runtimeBuckets.size > MAX_RUNTIME_BUCKETS) runtimeBuckets.delete(runtimeBuckets.keys().next().value);
  }

  async function loadBuckets(datasetKey, ids) {
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    const out = new Map(); const missing = [];
    for (const id of unique) {
      const key = `${datasetKey}:${id}`;
      if (runtimeBuckets.has(key)) { const record = runtimeBuckets.get(key); touchRuntimeBucket(key, record); out.set(id, record); }
      else missing.push(id);
    }
    if (missing.length) {
      const records = await getRecords(missing.map((id) => `${BUCKET_PREFIX}${id}`));
      records.forEach((record, index) => {
        const id = missing[index];
        if (!record || record.version !== VERSION || record.datasetKey !== datasetKey || record.bucket !== id || !Array.isArray(record.entries)) return;
        out.set(id, record); touchRuntimeBucket(`${datasetKey}:${id}`, record);
      });
    }
    return out;
  }

  async function load(datasetKey) {
    const meta = await loadMeta(datasetKey); if (!meta) return null;
    const records = await loadBuckets(datasetKey, meta.bucketIds);
    if (records.size !== meta.bucketIds.length) return null;
    const index = indexShell(meta);
    for (const id of meta.bucketIds) for (const [key, posting] of records.get(id).entries) index.tokenMap.set(key, posting);
    return { index, metadata: { savedAt: meta.savedAt, estimatedBytes: meta.estimatedBytes || 0, segmentCount: meta.bucketIds.length, bucketCount: meta.bucketIds.length, format: "bucketed-v3" } };
  }

  function requiredGrams(parsed, searchIndexApi) {
    if (!parsed || parsed.invalid?.length || parsed.regexes?.length || parsed.excludes?.length || parsed.before !== null || parsed.after !== null || parsed.has?.length) return { grams: null, reason: "query-requires-linear" };
    const grams = new Set();
    for (const term of [...(parsed.terms || []), ...(parsed.any || [])]) {
      const current = searchIndexApi?.gramsForTerm?.(term);
      if (!current?.length) return { grams: null, reason: "substring-term" };
      current.forEach((gram) => grams.add(gram));
    }
    return { grams: [...grams], reason: "disk-indexed" };
  }

  async function candidates(datasetKey, parsed, request, searchIndexApi) {
    const meta = await loadMeta(datasetKey); if (!meta) return { indexes: null, reason: "disk-cache-miss" };
    const requirement = requiredGrams(parsed, searchIndexApi);
    if (requirement.grams === null) return { indexes: null, reason: requirement.reason };
    const shell = indexShell(meta);
    if (requirement.grams.length) {
      const ids = requirement.grams.map(bucketId);
      const buckets = await loadBuckets(datasetKey, ids);
      for (const gram of requirement.grams) {
        const record = buckets.get(bucketId(gram));
        if (!record) return { indexes: null, reason: "disk-bucket-missing" };
        const found = record.entries.find(([key]) => key === gram);
        if (found) shell.tokenMap.set(found[0], found[1]);
      }
    }
    const result = searchIndexApi.candidates(shell, parsed, request);
    return { ...result, reason: result.indexes !== null ? "disk-indexed" : result.reason };
  }

  async function save(datasetKey, index) {
    const check = eligible(index);
    if (!available() || !datasetKey || !check.allowed) return { saved: false, reason: check.allowed ? "indexeddb-unavailable" : "ineligible", estimatedBytes: check.estimatedBytes };
    const buckets = Array.from({ length: BUCKET_COUNT }, () => []);
    for (const pair of mapEntries(index.tokenMap)) buckets[bucketId(pair[0])].push(pair);
    const bucketIds = []; buckets.forEach((entries, id) => { if (entries.length) bucketIds.push(id); });
    const savedAt = new Date().toISOString();
    const meta = { key: META_KEY, version: VERSION, datasetKey, savedAt, estimatedBytes: check.estimatedBytes, bucketIds, stats: index.stats, maps: { level: mapEntries(index.levelMap), service: mapEntries(index.serviceMap), source: mapEntries(index.sourceMap), environment: mapEntries(index.environmentMap), namespace: mapEntries(index.namespaceMap), exception: mapEntries(index.exceptionMap), correlations: correlationEntries(index.correlationMaps) } };
    await withStore("readwrite", (store) => {
      bucketIds.forEach((id) => store.put({ key: `${BUCKET_PREFIX}${id}`, version: VERSION, datasetKey, bucket: id, entries: buckets[id] }));
      store.put(meta);
      const activeBucketIds = new Set(bucketIds);
      for (let id = 0; id < BUCKET_COUNT; id += 1) if (!activeBucketIds.has(id)) store.delete(`${BUCKET_PREFIX}${id}`);
    });
    runtimeBuckets.clear(); await deleteLegacyDatabases();
    return { saved: true, savedAt, estimatedBytes: check.estimatedBytes, segmentCount: bucketIds.length, bucketCount: bucketIds.length, format: "bucketed-v3" };
  }

  async function info() {
    if (!available()) return null; const [meta] = await getRecords([META_KEY]); if (!meta) return null;
    return { datasetKey: meta.datasetKey || "", savedAt: meta.savedAt || "", estimatedBytes: Number(meta.estimatedBytes) || 0, segmentCount: Array.isArray(meta.bucketIds) ? meta.bucketIds.length : 0, bucketCount: Array.isArray(meta.bucketIds) ? meta.bucketIds.length : 0, entries: Number(meta.stats?.entries) || 0, format: "bucketed-v3" };
  }

  async function clear() {
    if (!available()) return;
    await withStore("readwrite", (store) => {
      store.delete(META_KEY);
      for (let id = 0; id < BUCKET_COUNT; id += 1) store.delete(`${BUCKET_PREFIX}${id}`);
    });
    runtimeBuckets.clear(); await deleteLegacyDatabases();
  }

  root.SignalDockSearchCache = { VERSION, BUCKET_COUNT, MAX_ESTIMATED_BYTES, available, fingerprint, estimateBytes, eligible, bucketId, validBucketIds, loadMetadata, load, candidates, save, info, clear };
}(typeof self !== "undefined" ? self : window));
