"use strict";
importScripts("src/core/search-index.js", "src/core/search-cache.js", "src/core/query-engine.js");

const WORKER_PROTOCOL_VERSION = 1;
const ALLOWED_MESSAGE_TYPES = new Set(["index", "filter", "correlate", "trace"]);
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{24,128}$/;
const MAX_RELATED_LIMIT = 5000;

let entries = [];
let version = 0;
let searchIndex = null;
let diskBacked = false;
let cacheKey = "";

function sessionTokenFromLocation() {
  try {
    const token = new URL(self.location.href).searchParams.get("sd_session") || "";
    return SESSION_TOKEN_PATTERN.test(token) ? token : "";
  } catch {
    return "";
  }
}

const sessionToken = sessionTokenFromLocation();

function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function validEnvelope(message) { return Boolean(sessionToken) && isRecord(message) && message.protocol === WORKER_PROTOCOL_VERSION && message.token === sessionToken && ALLOWED_MESSAGE_TYPES.has(message.type); }
function boundedInteger(value, min, max, fallback) { const number = Number(value); return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback; }
function safeCorrelations(value) {
  if (!isRecord(value)) return {};
  const out = {};
  for (const key of ["trace", "span", "request", "session", "user", "correlation"]) {
    const item = value[key];
    if (typeof item === "string" && item.length && item.length <= 512) out[key] = item;
  }
  return out;
}
function reply(payload) { self.postMessage({ ...payload, protocol: WORKER_PROTOCOL_VERSION, token: sessionToken }); }

async function onProtocolMessage(event) {
  const message = event?.data;
  // DedicatedWorkerGlobalScope is a private Worker channel, not a cross-window message boundary.
  // MessageEvent.origin is not an authentication primitive here; the protocol is bound to a
  // cryptographically generated per-worker session token carried in the Worker script URL.
  if (!validEnvelope(message)) return;

  if (message.type === "index") {
    if (!Array.isArray(message.entries)) return;
    entries = message.entries;
    version = boundedInteger(message.version, 0, Number.MAX_SAFE_INTEGER, 0);
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
        const bucketIds = new Set();
        for (const key of searchIndex?.tokenMap?.keys?.() || []) bucketIds.add(self.SignalDockSearchCache.bucketId(key));
        cacheSegments = bucketIds.size;
        self.SignalDockSearchCache.save(cacheKey, searchIndex).catch(() => {});
      }
    }
    reply({ type: "indexed", version, count: entries.length, searchIndex: Object.assign({}, searchIndex.stats, { cacheHit, diskBacked, cacheKey: cacheKey ? cacheKey.slice(0, 12) : "", cacheEligible: self.SignalDockSearchCache.eligible(searchIndex).allowed, cacheSegments }) });
    return;
  }

  if (message.type === "filter") {
    if (!isRecord(message.request)) return;
    const requestId = boundedInteger(message.requestId, 0, Number.MAX_SAFE_INTEGER, 0);
    const started = performance.now();
    const parsed = message.request.parsed || self.SignalDockQueryEngine.parseSmartQuery(message.request.query || "");
    let candidate;
    if (diskBacked && cacheKey) {
      try { candidate = await self.SignalDockSearchCache.candidates(cacheKey, parsed, message.request, self.SignalDockSearchIndex); }
      catch { candidate = { indexes: null, reason: "disk-cache-error" }; }
    } else candidate = self.SignalDockSearchIndex.candidates(searchIndex, parsed, message.request);
    const result = self.SignalDockQueryEngine.filterIndexes(entries, Object.assign({}, message.request, { parsed }), candidate.indexes);
    reply({
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
    const correlations = safeCorrelations(message.correlations);
    if (!Object.keys(correlations).length) return;
    const started = performance.now();
    const requestId = boundedInteger(message.requestId, 0, Number.MAX_SAFE_INTEGER, 0);
    const limit = boundedInteger(message.limit, 1, MAX_RELATED_LIMIT, message.type === "trace" ? 1000 : 200);
    const origin = Number.isInteger(Number(message.origin)) ? Number(message.origin) : undefined;
    const indexes = self.SignalDockQueryEngine.relatedIndexes(entries, correlations, limit, origin);
    reply({ type: message.type === "trace" ? "trace-related" : "correlated", requestId, version, indexes, elapsedMs: Math.round((performance.now() - started) * 10) / 10 });
  }
}

self.addEventListener("message", onProtocolMessage);
if (sessionToken) reply({ type: "ready" });
