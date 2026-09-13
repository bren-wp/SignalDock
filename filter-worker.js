"use strict";
importScripts("search-index.js", "search-cache.js", "query-engine.js");

let entries = [];
let version = 0;
let searchIndex = null;
let diskBacked = false;
let cacheKey = "";

self.onmessage = async function (event) {
  const message = event.data || {};
  if (message.type === "index") {
    entries = Array.isArray(message.entries) ? message.entries : [];
    version = message.version || 0;
    let cacheHit = false;
    let cacheSegments = 0;
    diskBacked = false;
    cacheKey = "";
    try {
      cacheKey = await self.SignalDockSearchCache.fingerprint(entries);
      const cached = await self.SignalDockSearchCache.loadMetadata(cacheKey);
      if (cached?.index?.stats?.entries === entries.length) {
        searchIndex = cached.index;
        cacheHit = true;
        diskBacked = true;
        cacheSegments = Number(cached.metadata?.bucketCount || cached.metadata?.segmentCount) || 0;
      }
    } catch { /* IndexedDB cache is optional */ }
    if (!searchIndex || searchIndex.stats?.entries !== entries.length || !cacheHit) {
      searchIndex = self.SignalDockSearchIndex.build(entries);
      diskBacked = false;
      if (cacheKey) {
        const bucketIds = new Set(); for (const key of searchIndex?.tokenMap?.keys?.() || []) bucketIds.add(self.SignalDockSearchCache.bucketId(key));
        cacheSegments = bucketIds.size;
        self.SignalDockSearchCache.save(cacheKey, searchIndex).catch(() => {});
      }
    }
    self.postMessage({ type: "indexed", version, count: entries.length, searchIndex: Object.assign({}, searchIndex.stats, { cacheHit, diskBacked, cacheKey: cacheKey ? cacheKey.slice(0, 12) : "", cacheEligible: self.SignalDockSearchCache.eligible(searchIndex).allowed, cacheSegments }) });
    return;
  }
  if (message.type === "filter") {
    const requestId = message.requestId;
    const started = performance.now();
    const parsed = message.request?.parsed || self.SignalDockQueryEngine.parseSmartQuery(message.request?.query || "");
    let candidate;
    if (diskBacked && cacheKey) {
      try { candidate = await self.SignalDockSearchCache.candidates(cacheKey, parsed, message.request || {}, self.SignalDockSearchIndex); }
      catch { candidate = { indexes: null, reason: "disk-cache-error" }; }
    } else candidate = self.SignalDockSearchIndex.candidates(searchIndex, parsed, message.request || {});
    const result = self.SignalDockQueryEngine.filterIndexes(entries, Object.assign({}, message.request, { parsed }), candidate.indexes);
    self.postMessage({
      type: "filtered",
      requestId,
      version,
      indexes: result.indexes,
      invalid: result.parsed.invalid,
      elapsedMs: Math.round((performance.now() - started) * 10) / 10,
      searchMode: candidate.indexes ? (diskBacked ? "disk-indexed" : "indexed") : "linear",
      candidateCount: candidate.indexes ? candidate.indexes.length : entries.length,
      indexReason: candidate.reason
    });
    return;
  }
  if (message.type === "correlate" || message.type === "trace") {
    const started = performance.now();
    const indexes = self.SignalDockQueryEngine.relatedIndexes(entries, message.correlations || {}, message.limit || 200, message.origin);
    self.postMessage({ type: message.type === "trace" ? "trace-related" : "correlated", requestId: message.requestId, version, indexes, elapsedMs: Math.round((performance.now() - started) * 10) / 10 });
  }
};

self.postMessage({ type: "ready" });
