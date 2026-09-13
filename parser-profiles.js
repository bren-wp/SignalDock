(function (root) {
  "use strict";

  const STORAGE_KEY = "signaldock-parser-profiles-v1";
  const MAX_PROFILES = 24;
  const MAX_NAME = 48;
  const MAX_PATTERN = 500;

  function sanitizeFlags(value) {
    return String(value || "i").replace(/[^imsu]/g, "");
  }

  function validate(input) {
    const name = String(input?.name || "").trim().slice(0, MAX_NAME);
    const pattern = String(input?.pattern || "").trim();
    const flags = sanitizeFlags(input?.flags);
    if (!name) throw new Error("Parser profile name is required.");
    if (!pattern) throw new Error("Parser profile regex is required.");
    if (pattern.length > MAX_PATTERN) throw new Error(`Parser regex is limited to ${MAX_PATTERN} characters.`);
    try { new RegExp(pattern, flags); } catch (error) { throw new Error(`Invalid parser regex: ${error.message || error}`); }
    return { name, pattern, flags };
  }

  function load() {
    try {
      const parsed = JSON.parse(root.localStorage?.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, MAX_PROFILES).map((item) => {
        try { return { id: String(item.id || ""), ...validate(item), createdAt: item.createdAt || "" }; } catch { return null; }
      }).filter((item) => item?.id);
    } catch { return []; }
  }

  function saveAll(profiles) {
    const clean = Array.isArray(profiles) ? profiles.slice(0, MAX_PROFILES) : [];
    root.localStorage?.setItem(STORAGE_KEY, JSON.stringify(clean));
    return clean;
  }

  function upsert(input, id = "") {
    const profile = validate(input);
    const profiles = load();
    const nextId = id || `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const record = { id: nextId, ...profile, createdAt: new Date().toISOString() };
    const index = profiles.findIndex((item) => item.id === nextId);
    if (index >= 0) profiles[index] = record;
    else {
      if (profiles.length >= MAX_PROFILES) throw new Error(`SignalDock supports up to ${MAX_PROFILES} saved parser profiles.`);
      profiles.push(record);
    }
    saveAll(profiles);
    return record;
  }

  function remove(id) {
    const profiles = load().filter((item) => item.id !== id);
    saveAll(profiles);
    return profiles;
  }

  function get(id) {
    return load().find((item) => item.id === id) || null;
  }

  function exportJson() {
    return JSON.stringify({ schema: "signaldock.parser-profiles", version: 1, exportedAt: new Date().toISOString(), profiles: load() }, null, 2);
  }

  function importJson(text) {
    const payload = JSON.parse(String(text || ""));
    if (payload?.schema !== "signaldock.parser-profiles" || payload?.version !== 1 || !Array.isArray(payload.profiles)) throw new Error("Unsupported parser profile file.");
    const profiles = payload.profiles.slice(0, MAX_PROFILES).map((item) => ({ id: String(item.id || `profile-${Math.random().toString(36).slice(2)}`), ...validate(item), createdAt: item.createdAt || new Date().toISOString() }));
    saveAll(profiles);
    return profiles;
  }

  root.SignalDockParserProfiles = { STORAGE_KEY, MAX_PROFILES, validate, load, upsert, remove, get, exportJson, importJson };
}(typeof self !== "undefined" ? self : window));
