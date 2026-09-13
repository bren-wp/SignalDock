(function (root) {
  "use strict";

  const SCHEMA = "signaldock.query-library";
  const VERSION = 2;
  const LEGACY_VERSION = 1;
  const STORAGE_KEY = "signaldock-query-library-v2";
  const LEGACY_STORAGE_KEY = "signaldock-query-library-v1";
  const MAX_ITEMS = 500;

  function clean(value, max = 512) { return String(value ?? "").trim().slice(0, max); }
  function cleanTags(value) {
    const input = Array.isArray(value) ? value : String(value || "").split(/[;,]/);
    return [...new Set(input.map((tag) => clean(tag, 48).toLowerCase().replace(/\s+/g, "-")).filter(Boolean))].slice(0, 20);
  }
  function cleanFolder(value) {
    const folder = clean(value || "General", 80).replace(/[\\<>:"|?*]/g, "-").replace(/\s+/g, " ");
    return folder || "General";
  }
  function normalizeItem(item = {}, index = 0) {
    const now = new Date().toISOString();
    return {
      id: clean(item.id || `query-${Date.now().toString(36)}-${index}`, 96),
      name: clean(item.name || `Query ${index + 1}`, 120),
      description: clean(item.description || "", 1000),
      tags: cleanTags(item.tags),
      folder: cleanFolder(item.folder),
      favorite: Boolean(item.favorite),
      query: clean(item.query || "", 4096),
      level: clean(item.level || "", 32),
      source: clean(item.source || "", 512),
      timeRange: clean(item.timeRange || "", 64),
      sortMode: clean(item.sortMode || "original", 32),
      createdAt: clean(item.createdAt || now, 64),
      updatedAt: clean(item.updatedAt || now, 64)
    };
  }
  function normalize(input) {
    return (Array.isArray(input) ? input : []).slice(0, MAX_ITEMS).map(normalizeItem).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.folder.localeCompare(b.folder) || b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }
  function loadRaw(key) {
    try { return JSON.parse(root.localStorage?.getItem(key) || "null"); } catch { return null; }
  }
  function load() {
    const current = loadRaw(STORAGE_KEY);
    if (Array.isArray(current)) return normalize(current);
    const legacy = loadRaw(LEGACY_STORAGE_KEY);
    if (Array.isArray(legacy)) {
      const migrated = save(legacy);
      try { root.localStorage?.removeItem(LEGACY_STORAGE_KEY); } catch { /* no-op */ }
      return migrated;
    }
    return [];
  }
  function save(items) {
    const normalized = normalize(items);
    root.localStorage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
  function upsert(items, patch, id = "") {
    const list = normalize(items);
    const now = new Date().toISOString();
    const index = id ? list.findIndex((item) => item.id === id) : -1;
    if (index >= 0) list[index] = normalizeItem({ ...list[index], ...patch, id: list[index].id, createdAt: list[index].createdAt, updatedAt: now }, index);
    else {
      if (list.length >= MAX_ITEMS) throw new Error(`Query library is limited to ${MAX_ITEMS} items.`);
      list.unshift(normalizeItem({ ...patch, id: `query-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, createdAt: now, updatedAt: now }, list.length));
    }
    return save(list);
  }
  function remove(items, id) { return save(normalize(items).filter((item) => item.id !== id)); }
  function toggleFavorite(items, id) {
    const list = normalize(items); const item = list.find((candidate) => candidate.id === id); if (!item) return list;
    return upsert(list, { favorite: !item.favorite }, id);
  }
  function moveToFolder(items, id, folder) { return upsert(items, { folder: cleanFolder(folder) }, id); }
  function folders(items) {
    const counts = new Map(); normalize(items).forEach((item) => counts.set(item.folder, (counts.get(item.folder) || 0) + 1));
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }
  function search(items, query = "", folder = "") {
    const q = clean(query, 240).toLowerCase(); const wantedFolder = clean(folder, 80);
    return normalize(items).filter((item) => {
      if (wantedFolder && wantedFolder !== "*" && item.folder !== wantedFolder) return false;
      if (!q) return true;
      const haystack = [item.name, item.description, item.query, item.folder, ...(item.tags || [])].join(" ").toLowerCase();
      return q.split(/\s+/).filter(Boolean).every((part) => haystack.includes(part));
    });
  }
  function renameFolder(items, from, to) {
    const source = cleanFolder(from); const target = cleanFolder(to);
    return save(normalize(items).map((item) => item.folder === source ? normalizeItem({ ...item, folder: target, updatedAt: new Date().toISOString() }) : item));
  }
  function deleteFolder(items, folder, moveTo = "General") {
    const source = cleanFolder(folder); const target = cleanFolder(moveTo);
    return save(normalize(items).map((item) => item.folder === source ? normalizeItem({ ...item, folder: target, updatedAt: new Date().toISOString() }) : item));
  }
  function exportJson(items) { return JSON.stringify({ schema: SCHEMA, version: VERSION, exportedAt: new Date().toISOString(), items: normalize(items) }, null, 2); }
  function importJson(text, mergeWith = []) {
    const parsed = JSON.parse(String(text || ""));
    if (parsed?.schema !== SCHEMA || ![LEGACY_VERSION, VERSION].includes(Number(parsed?.version)) || !Array.isArray(parsed.items)) throw new Error("Unsupported SignalDock query library file.");
    const incoming = normalize(parsed.items);
    const byId = new Map(normalize(mergeWith).map((item) => [item.id, item]));
    incoming.forEach((item) => byId.set(item.id, item));
    return save([...byId.values()].slice(0, MAX_ITEMS));
  }

  root.SignalDockQueryLibrary = { SCHEMA, VERSION, LEGACY_VERSION, STORAGE_KEY, LEGACY_STORAGE_KEY, MAX_ITEMS, normalize, load, save, upsert, remove, toggleFavorite, moveToFolder, folders, search, renameFolder, deleteFolder, exportJson, importJson };
}(typeof self !== "undefined" ? self : window));
