(function (root) {
  "use strict";

  const KEY = "signaldock-projects-v4";
  const LEGACY_KEYS = ["signaldock-projects-v3", "signaldock-projects-v2", "signaldock-projects-v1"];
  const SCHEMA = "signaldock.projects";
  const VERSION = 4;
  const LEGACY_VERSIONS = [1, 2, 3];
  const MAX = 50;
  const MAX_HISTORY = 20;

  function clean(value, max = 2000) { return String(value ?? "").trim().slice(0, max); }
  function tags(value) {
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

  function historyList(value, kind) {
    return (Array.isArray(value) ? value : []).slice(0, MAX_HISTORY).map((item, index) => ({
      id: clean(item?.id || `${kind}-${index + 1}`, 96),
      name: clean(item?.name || item?.filename || `${kind} ${index + 1}`, 240),
      openedAt: clean(item?.openedAt || item?.savedAt || item?.capturedAt || new Date().toISOString(), 64),
      size: Math.max(0, Number(item?.size) || 0),
      fingerprint: clean(item?.fingerprint, 160),
      handleRef: clean(item?.handleRef, 300),
      handleKind: item?.handleRef ? (item?.handleKind === "directory" ? "directory" : "file") : "",
      reopenable: Boolean(item?.handleRef),
      linkedAt: item?.handleRef ? clean(item?.linkedAt || item?.openedAt || new Date().toISOString(), 64) : "",
      lastReopenedAt: clean(item?.lastReopenedAt, 64),
      reopenCount: Math.max(0, Math.floor(Number(item?.reopenCount) || 0))
    }));
  }

  function baselineList(value) { return (Array.isArray(value) ? value : []).slice(0, MAX_HISTORY).map((item, index) => ({ id: clean(item?.id || `baseline-${index + 1}`, 96), name: clean(item?.name || `Baseline ${index + 1}`, 120), capturedAt: clean(item?.capturedAt || new Date().toISOString(), 64), tags: tags(item?.tags) })); }
  function caseList(value) { return (Array.isArray(value) ? value : []).slice(0, MAX_HISTORY).map((item, index) => ({ id: clean(item?.id || `case-${index + 1}`, 96), title: clean(item?.title || `Case ${index + 1}`, 160), status: clean(item?.status || "open", 40), updatedAt: clean(item?.updatedAt || new Date().toISOString(), 64) })); }

  function prependUniqueById(list, item, normalizeList) {
    const current = Array.isArray(list) ? list : [];
    return normalizeList([item, ...current.filter((candidate) => candidate.id !== item.id)]);
  }

  function historyKind(field) {
    return field === "recentWorkspaces" ? "workspace" : "dataset";
  }

  function normalize(project, index = 0) {
    const source = project && typeof project === "object" ? project : {};
    const now = new Date().toISOString();
    return {
      id: clean(source.id || `project-${index + 1}`, 96),
      name: clean(source.name || `Project ${index + 1}`, 120),
      description: clean(source.description || "", 2000),
      tags: tags(source.tags),
      archived: Boolean(source.archived),
      createdAt: clean(source.createdAt || now, 64),
      updatedAt: clean(source.updatedAt || now, 64),
      lastOpenedAt: clean(source.lastOpenedAt || source.updatedAt || now, 64),
      lastWorkspace: clean(source.lastWorkspace || "", 240),
      baselineName: clean(source.baselineName || "", 120),
      recentWorkspaces: historyList(source.recentWorkspaces, "workspace"),
      recentDatasets: historyList(source.recentDatasets, "dataset"),
      baselines: baselineList(source.baselines),
      cases: caseList(source.cases)
    };
  }

  function normalizeList(list) { return (Array.isArray(list) ? list : []).slice(0, MAX).map(normalize).sort((a, b) => Number(a.archived) - Number(b.archived) || b.lastOpenedAt.localeCompare(a.lastOpenedAt) || a.name.localeCompare(b.name)); }
  function loadRaw(key) { try { const raw = JSON.parse(root.localStorage?.getItem(key) || "null"); return Array.isArray(raw) ? raw : null; } catch { return null; } }

  function load() {
    const current = loadRaw(KEY);
    if (current) return normalizeList(current);
    for (const legacyKey of LEGACY_KEYS) {
      const legacy = loadRaw(legacyKey);
      if (!legacy) continue;
      const migrated = persist(legacy);
      try { root.localStorage?.removeItem(legacyKey); } catch { /* no-op */ }
      return migrated;
    }
    return [];
  }

  function persist(list) { const out = normalizeList(list); root.localStorage?.setItem(KEY, JSON.stringify(out)); return out; }
  function loadOr(list) { return Array.isArray(list) ? normalizeList(list) : load(); }

  function create(list, patch = {}) {
    const out = loadOr(list);
    if (out.length >= MAX) throw new Error(`Project manager is limited to ${MAX} projects.`);
    const now = new Date().toISOString();
    const project = normalize({ ...patch, id: `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, createdAt: now, updatedAt: now, lastOpenedAt: now }, out.length);
    out.push(project);
    return { projects: persist(out), project };
  }

  function update(list, id, patch = {}) {
    const out = loadOr(list); const project = out.find((item) => item.id === id); if (!project) return persist(out);
    for (const key of ["name", "description", "lastWorkspace", "baselineName"]) if (key in patch) project[key] = clean(patch[key], key === "description" ? 2000 : 240) || (key === "name" ? project.name : "");
    if ("tags" in patch) project.tags = tags(patch.tags);
    if ("archived" in patch) project.archived = Boolean(patch.archived);
    project.updatedAt = new Date().toISOString();
    return persist(out);
  }

  function touch(list, id, field, value) {
    const out = loadOr(list); const project = out.find((item) => item.id === id); if (!project) return persist(out);
    const now = new Date().toISOString();
    const item = { ...value, id: clean(value?.id || `${field}-${Date.now().toString(36)}`, 96), openedAt: now };
    project[field] = prependUniqueById(project[field], item, (items) => historyList(items, historyKind(field)));
    project.lastOpenedAt = now; project.updatedAt = now;
    if (field === "recentWorkspaces") project.lastWorkspace = clean(item.name || item.filename, 240);
    return persist(out);
  }

  function touchWorkspace(list, id, value = {}) { return touch(list, id, "recentWorkspaces", value); }
  function touchDataset(list, id, value = {}) { return touch(list, id, "recentDatasets", value); }

  function linkHistoryHandle(list, id, field, itemId, ref, handleKind = "file") {
    if (!["recentWorkspaces", "recentDatasets"].includes(field)) throw new Error("Unsupported project history collection.");
    const out = loadOr(list); const project = out.find((item) => item.id === id); if (!project) return persist(out);
    const historyItem = (project[field] || []).find((item) => item.id === clean(itemId, 96));
    if (!historyItem) return persist(out);
    const value = clean(ref, 300);
    historyItem.handleRef = value;
    historyItem.handleKind = value ? (handleKind === "directory" ? "directory" : "file") : "";
    historyItem.reopenable = Boolean(value);
    historyItem.linkedAt = value ? new Date().toISOString() : "";
    project.updatedAt = new Date().toISOString();
    return persist(out);
  }

  function unlinkHistoryHandle(list, id, field, itemId) { return linkHistoryHandle(list, id, field, itemId, "", "file"); }

  function markHistoryReopened(list, id, field, itemId) {
    if (!["recentWorkspaces", "recentDatasets"].includes(field)) throw new Error("Unsupported project history collection.");
    const out = loadOr(list); const project = out.find((item) => item.id === id); if (!project) return persist(out);
    const item = (project[field] || []).find((candidate) => candidate.id === clean(itemId, 96));
    if (!item) return persist(out);
    const now = new Date().toISOString();
    const updated = { ...item, openedAt: now, lastReopenedAt: now, reopenCount: Math.max(0, Number(item.reopenCount) || 0) + 1 };
    project[field] = prependUniqueById(project[field], updated, (items) => historyList(items, historyKind(field)));
    project.lastOpenedAt = now; project.updatedAt = now;
    if (field === "recentWorkspaces") project.lastWorkspace = updated.name;
    return persist(out);
  }

  function attachBaseline(list, id, value = {}) { const out = loadOr(list); const project = out.find((item) => item.id === id); if (!project) return persist(out); const baseline = baselineList([value])[0]; project.baselines = prependUniqueById(project.baselines, baseline, baselineList); project.baselineName = baseline.name; project.updatedAt = new Date().toISOString(); return persist(out); }
  function attachCase(list, id, value = {}) { const out = loadOr(list); const project = out.find((item) => item.id === id); if (!project) return persist(out); const caseMeta = caseList([value])[0]; project.cases = prependUniqueById(project.cases, caseMeta, caseList); project.updatedAt = new Date().toISOString(); return persist(out); }
  function archive(list, id, archived = true) { return update(list, id, { archived }); }

  function portableProject(project) {
    const out = normalize(project);
    const stripHandles = (items) => items.map(({ handleRef: _handleRef, handleKind: _handleKind, reopenable: _reopenable, linkedAt: _linkedAt, ...item }) => item);
    return { ...out, recentWorkspaces: stripHandles(out.recentWorkspaces), recentDatasets: stripHandles(out.recentDatasets) };
  }

  function duplicate(list, id, name = "") {
    const out = loadOr(list); const source = out.find((item) => item.id === id); if (!source) throw new Error("Project not found.");
    const copy = portableProject(source);
    return create(out, { ...copy, name: clean(name, 120) || `${source.name} copy`, archived: false });
  }

  function remove(list, id) { return persist(loadOr(list).filter((item) => item.id !== id)); }

  function exportJson(list, activeId = "") { return JSON.stringify({ schema: SCHEMA, version: VERSION, exportedAt: new Date().toISOString(), activeId: clean(activeId, 96), projects: loadOr(list).map(portableProject) }, null, 2); }

  function importJson(text) {
    const parsed = JSON.parse(String(text || ""));
    if (parsed?.schema !== SCHEMA || ![...LEGACY_VERSIONS, VERSION].includes(parsed.version) || !Array.isArray(parsed.projects)) throw new Error("Unsupported or invalid SignalDock projects file.");
    return { projects: persist(parsed.projects.slice(0, MAX).map(portableProject)), activeId: clean(parsed.activeId, 96) };
  }

  root.SignalDockProjectManager = {
    KEY, LEGACY_KEYS, SCHEMA, VERSION, LEGACY_VERSIONS, MAX, MAX_HISTORY,
    normalize, load, persist, create, update, touchWorkspace, touchDataset,
    linkHistoryHandle, unlinkHistoryHandle, markHistoryReopened,
    attachBaseline, attachCase, archive, duplicate, remove,
    portableProject, exportJson, importJson
  };
}(typeof self !== "undefined" ? self : window));
