(function (root) {
  "use strict";
  const SCHEMA = "signaldock.query-library", VERSION = 3, LEGACY_VERSION = 1, LEGACY_VERSIONS = [1, 2], STORAGE_KEY = "signaldock-query-library-v3", LEGACY_STORAGE_KEY = "signaldock-query-library-v1", LEGACY_STORAGE_KEYS = ["signaldock-query-library-v2", LEGACY_STORAGE_KEY], MAX_ITEMS = 500;
  function clean(value, max = 512) { return String(value ?? "").trim().slice(0, max); }
  function cleanTags(value) {
    const input = Array.isArray(value) ? value : String(value || "").split(/[;,]/);
    const out = [];
    const seen = new Set();
    for (const value of input) {
      const tag = clean(value, 48).toLowerCase().replace(/\s+/g, "-");
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
      if (out.length >= 20) break;
    }
    return out;
  }
  function cleanFolder(value) { const folder = clean(value || "General", 80).replace(/[\\<>:"|?*]/g, "-").replace(/\s+/g, " "); return folder || "General"; }
  function cleanIdSet(ids) { return new Set((Array.isArray(ids) ? ids : []).map((id) => clean(id, 96))); }
  function normalizeItem(item = {}, index = 0) { const now = new Date().toISOString(); return { id: clean(item.id || `query-${Date.now().toString(36)}-${index}`, 96), name: clean(item.name || `Query ${index + 1}`, 120), description: clean(item.description || "", 1000), tags: cleanTags(item.tags), folder: cleanFolder(item.folder), favorite: Boolean(item.favorite), query: clean(item.query || "", 4096), level: clean(item.level || "", 32), source: clean(item.source || "", 512), timeRange: clean(item.timeRange || "", 64), sortMode: clean(item.sortMode || "original", 32), useCount: Math.max(0, Math.floor(Number(item.useCount) || 0)), lastUsedAt: clean(item.lastUsedAt || "", 64), createdAt: clean(item.createdAt || now, 64), updatedAt: clean(item.updatedAt || now, 64) }; }
  function compareItems(a, b) { return Number(b.favorite) - Number(a.favorite) || (b.lastUsedAt || "").localeCompare(a.lastUsedAt || "") || b.useCount - a.useCount || a.folder.localeCompare(b.folder) || b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name); }
  function normalize(input) { return (Array.isArray(input) ? input : []).slice(0, MAX_ITEMS).map(normalizeItem).sort(compareItems); }
  function persistNormalized(items) { const list = (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS).sort(compareItems); root.localStorage?.setItem(STORAGE_KEY, JSON.stringify(list)); return list; }
  function loadRaw(key) { try { return JSON.parse(root.localStorage?.getItem(key) || "null"); } catch { return null; } }
  function save(items) { const normalized = normalize(items); root.localStorage?.setItem(STORAGE_KEY, JSON.stringify(normalized)); return normalized; }
  function load() { const current = loadRaw(STORAGE_KEY); if (Array.isArray(current)) return normalize(current); for (const key of LEGACY_STORAGE_KEYS) { const legacy = loadRaw(key); if (Array.isArray(legacy)) { const migrated = save(legacy); try { root.localStorage?.removeItem(key); } catch { /* no-op */ } return migrated; } } return []; }
  function upsertNormalized(list, patch, id = "") { const now = new Date().toISOString(); const index = id ? list.findIndex((item) => item.id === id) : -1; if (index >= 0) list[index] = normalizeItem({ ...list[index], ...patch, id: list[index].id, createdAt: list[index].createdAt, updatedAt: now }, index); else { if (list.length >= MAX_ITEMS) throw new Error(`Query library is limited to ${MAX_ITEMS} items.`); list.unshift(normalizeItem({ ...patch, id: `query-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, createdAt: now, updatedAt: now }, list.length)); } return persistNormalized(list); }
  function upsert(items, patch, id = "") { return upsertNormalized(normalize(items), patch, id); }
  function remove(items, id) { return persistNormalized(normalize(items).filter((item) => item.id !== id)); }
  function toggleFavorite(items, id) { const list = normalize(items); const item = list.find((candidate) => candidate.id === id); return item ? upsertNormalized(list, { favorite: !item.favorite }, id) : list; }
  function moveToFolder(items, id, folder) { return upsert(items, { folder: cleanFolder(folder) }, id); }
  function markUsed(items, id, when = new Date().toISOString()) { const list = normalize(items); const item = list.find((candidate) => candidate.id === id); return item ? upsertNormalized(list, { useCount: item.useCount + 1, lastUsedAt: clean(when, 64) }, id) : list; }
  function duplicate(items, id, patch = {}) { const list = normalize(items); const item = list.find((candidate) => candidate.id === id); if (!item) throw new Error("Query not found."); const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, useCount: _useCount, lastUsedAt: _lastUsedAt, ...copy } = item; return upsertNormalized(list, { ...copy, ...patch, name: clean(patch.name, 120) || `${item.name} copy`, favorite: Boolean(patch.favorite), useCount: 0, lastUsedAt: "" }); }
  function bulkUpdateNormalized(list, wanted, patch = {}) { const now = new Date().toISOString(); return persistNormalized(list.map((item, index) => wanted.has(item.id) ? normalizeItem({ ...item, ...patch, id: item.id, createdAt: item.createdAt, updatedAt: now, folder: "folder" in patch ? cleanFolder(patch.folder) : item.folder, tags: "tags" in patch ? cleanTags(patch.tags) : item.tags }, index) : item)); }
  function bulkUpdate(items, ids, patch = {}) { return bulkUpdateNormalized(normalize(items), cleanIdSet(ids), patch); }
  function bulkRemove(items, ids) { const wanted = cleanIdSet(ids); return persistNormalized(normalize(items).filter((item) => !wanted.has(item.id))); }
  function folders(items) { const counts = new Map(); normalize(items).forEach((item) => counts.set(item.folder, (counts.get(item.folder) || 0) + 1)); return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)); }
  function search(items, query = "", folder = "") { const q = clean(query, 240).toLowerCase(); const wantedFolder = clean(folder, 80); return normalize(items).filter((item) => { if (wantedFolder && wantedFolder !== "*" && item.folder !== wantedFolder) return false; if (!q) return true; const haystack = [item.name, item.description, item.query, item.folder, ...(item.tags || [])].join(" ").toLowerCase(); return q.split(/\s+/).filter(Boolean).every((part) => haystack.includes(part)); }); }
  function renameFolder(items, from, to) { const source = cleanFolder(from); const target = cleanFolder(to); const list = normalize(items); const wanted = new Set(list.filter((item) => item.folder === source).map((item) => item.id)); return bulkUpdateNormalized(list, wanted, { folder: target }); }
  function deleteFolder(items, folder, moveTo = "General") { return renameFolder(items, folder, moveTo); }
  function exportNormalized(items) { return JSON.stringify({ schema: SCHEMA, version: VERSION, exportedAt: new Date().toISOString(), items }, null, 2); }
  function exportJson(items) { return exportNormalized(normalize(items)); }
  function exportSelected(items, ids) { const wanted = cleanIdSet(ids); return exportNormalized(normalize(items).filter((item) => wanted.has(item.id))); }
  function importJson(text, mergeWith = []) { const parsed = JSON.parse(String(text || "")); if (parsed?.schema !== SCHEMA || ![...LEGACY_VERSIONS, VERSION].includes(parsed?.version) || !Array.isArray(parsed.items)) throw new Error("Unsupported SignalDock query library file."); const byId = new Map(normalize(mergeWith).map((item) => [item.id, item])); normalize(parsed.items).forEach((item) => byId.set(item.id, item)); return persistNormalized([...byId.values()].slice(0, MAX_ITEMS)); }
  root.SignalDockQueryLibrary = { SCHEMA, VERSION, LEGACY_VERSION, LEGACY_VERSIONS, STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_STORAGE_KEYS, MAX_ITEMS, normalize, load, save, upsert, remove, toggleFavorite, moveToFolder, markUsed, duplicate, bulkUpdate, bulkRemove, folders, search, renameFolder, deleteFolder, exportJson, exportSelected, importJson };
}(typeof self !== "undefined" ? self : window));
