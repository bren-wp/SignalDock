(function (root) {
  "use strict";

  const HANDLE_DB = "signaldock-local-handles";
  const HANDLE_STORE = "handles";
  const HANDLE_DB_VERSION = 1;
  const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
  const DEFAULT_PICK_TYPES = [
    { description: "SignalDock logs", accept: { "application/json": [".json", ".jsonl", ".ndjson"], "text/plain": [".log", ".txt"], "application/zip": [".zip"] } },
    { description: "SignalDock workspace", accept: { "application/json": [".sdsession", ".sdbaseline", ".sdcase", ".sdbundle", ".sdprojects"] } }
  ];

  function sanitizeName(name, fallback = "signaldock-export.txt") {
    const out = String(name || "").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").slice(0, 180);
    return out || fallback;
  }

  function clean(value, max = 200) { return String(value ?? "").trim().slice(0, max); }
  function clamp(value, min, max, fallback) { if (value === null || value === undefined || value === "") return fallback; const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback; }
  function byteLimit(value, fallback = DEFAULT_MAX_BYTES) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback; }

  function capabilities() {
    return {
      filePicker: typeof root.showOpenFilePicker === "function",
      savePicker: typeof root.showSaveFilePicker === "function",
      directoryPicker: typeof root.showDirectoryPicker === "function",
      indexedDb: typeof root.indexedDB !== "undefined",
      persistentHandles: typeof root.indexedDB !== "undefined" && (typeof root.showOpenFilePicker === "function" || typeof root.showDirectoryPicker === "function")
    };
  }

  function reference(fileLike = {}, note = "") {
    return {
      name: sanitizeName(fileLike.name || "Local file", "Local file"),
      type: String(fileLike.type || "application/octet-stream").slice(0, 160),
      size: Math.max(0, Number(fileLike.size) || 0),
      lastModified: Math.max(0, Number(fileLike.lastModified) || 0),
      note: String(note || "").trim().slice(0, 2000)
    };
  }

  function handleRef(projectId = "", kind = "file", id = "") {
    const project = clean(projectId || "global", 96).replace(/[^a-z0-9._-]+/gi, "-") || "global";
    const type = kind === "directory" ? "directory" : "file";
    const suffix = clean(id, 96).replace(/[^a-z0-9._-]+/gi, "-") || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    return `${project}:${type}:${suffix}`;
  }

  function openHandleDb() {
    if (!root.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable; persistent local handles are not supported."));
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(HANDLE_DB, HANDLE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HANDLE_STORE)) {
          const store = db.createObjectStore(HANDLE_STORE, { keyPath: "key" });
          store.createIndex("projectId", "projectId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open the local handle registry."));
    });
  }

  async function withHandleStore(mode, work) {
    const db = await openHandleDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, mode);
        const store = tx.objectStore(HANDLE_STORE);
        let value;
        try { value = work(store, resolve, reject); } catch (error) { reject(error); return; }
        tx.oncomplete = () => { if (value !== undefined) resolve(value); };
        tx.onerror = () => reject(tx.error || new Error("Local handle registry transaction failed."));
        tx.onabort = () => reject(tx.error || new Error("Local handle registry transaction was aborted."));
      });
    } finally {
      db.close();
    }
  }

  async function storeHandle(options = {}) {
    const handle = options.handle;
    if (!handle || !["file", "directory"].includes(handle.kind)) throw new Error("A File System Access handle is required.");
    const projectId = clean(options.projectId, 96);
    const key = clean(options.ref, 300) || handleRef(projectId, handle.kind, options.id);
    const now = new Date().toISOString();
    const record = {
      key,
      projectId,
      kind: handle.kind,
      name: sanitizeName(handle.name || options.name || "Local handle", "Local handle"),
      note: clean(options.note, 1000),
      createdAt: clean(options.createdAt || now, 64),
      updatedAt: now,
      lastUsedAt: clean(options.lastUsedAt, 64),
      handle
    };
    await withHandleStore("readwrite", (store) => { store.put(record); });
    return { key: record.key, projectId: record.projectId, kind: record.kind, name: record.name, note: record.note, createdAt: record.createdAt, updatedAt: record.updatedAt, lastUsedAt: record.lastUsedAt };
  }

  async function getHandle(ref) {
    const key = clean(ref, 300);
    if (!key) return null;
    return withHandleStore("readonly", (store, resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not read the local handle reference."));
    });
  }

  async function removeHandle(ref) {
    const key = clean(ref, 300);
    if (!key) return false;
    await withHandleStore("readwrite", (store) => { store.delete(key); });
    return true;
  }

  async function listHandles(projectId = "") {
    const wanted = clean(projectId, 96);
    return withHandleStore("readonly", (store, resolve, reject) => {
      const request = wanted ? store.index("projectId").getAll(wanted) : store.getAll();
      request.onsuccess = () => resolve((request.result || []).map((record) => ({ key: record.key, projectId: record.projectId, kind: record.kind, name: record.name, note: record.note, createdAt: record.createdAt, updatedAt: record.updatedAt, lastUsedAt: record.lastUsedAt || "" })));
      request.onerror = () => reject(request.error || new Error("Could not list local handle references."));
    });
  }

  async function removeProjectHandles(projectId = "") {
    const wanted = clean(projectId, 96);
    if (!wanted) return 0;
    const records = await listHandles(wanted);
    if (!records.length) return 0;
    await withHandleStore("readwrite", (store) => { records.forEach((record) => store.delete(record.key)); });
    return records.length;
  }

  async function permissionState(handle, mode = "read") {
    if (!handle || typeof handle.queryPermission !== "function") return "unknown";
    try { return await handle.queryPermission({ mode: mode === "readwrite" ? "readwrite" : "read" }); } catch { return "unknown"; }
  }

  async function requestPermission(handle, mode = "read") {
    if (!handle || typeof handle.requestPermission !== "function") return permissionState(handle, mode);
    try { return await handle.requestPermission({ mode: mode === "readwrite" ? "readwrite" : "read" }); } catch { return "denied"; }
  }

  async function handleStatus(ref) {
    const record = await getHandle(ref);
    if (!record?.handle) return { exists: false, ref: clean(ref, 300), permission: "missing", kind: "", name: "" };
    return { exists: true, ref: record.key, permission: await permissionState(record.handle, "read"), kind: record.kind, name: record.name, projectId: record.projectId, updatedAt: record.updatedAt || "", lastUsedAt: record.lastUsedAt || "" };
  }

  async function markHandleUsed(record) {
    if (!record?.key || !record.handle) return;
    const now = new Date().toISOString();
    record.updatedAt = now;
    record.lastUsedAt = now;
    try { await withHandleStore("readwrite", (store) => { store.put(record); }); } catch { /* reopening succeeded; metadata refresh is best-effort */ }
  }

  async function reopenFile(ref, options = {}) {
    const record = await getHandle(ref);
    if (!record?.handle || record.handle.kind !== "file") throw new Error("The saved local file handle is unavailable on this device.");
    let permission = await permissionState(record.handle, "read");
    if (permission !== "granted" && options.requestPermission !== false) permission = await requestPermission(record.handle, "read");
    if (permission === "denied") throw new Error("Permission to reopen the local file was not granted.");
    const file = await record.handle.getFile();
    await markHandleUsed(record);
    return { file, reference: reference(file), handle: record.handle, handleRef: record.key, permission };
  }

  async function pickFiles(options = {}) {
    if (typeof root.showOpenFilePicker !== "function") throw new Error("Native local file picker is unavailable in this browser.");
    const multiple = Boolean(options.multiple);
    const maxFiles = clamp(options.maxFiles, 1, 128, multiple ? 64 : 1);
    const maxBytes = byteLimit(options.maxBytes);
    const types = Array.isArray(options.types) && options.types.length ? options.types : DEFAULT_PICK_TYPES;
    let handles;
    try { handles = await root.showOpenFilePicker({ multiple, types }); }
    catch (error) { if (error?.name === "AbortError") return []; throw error; }
    if (!Array.isArray(handles) || !handles.length) return [];
    if (handles.length > maxFiles) throw new Error(`Select at most ${maxFiles} files at a time.`);
    const records = [];
    for (const handle of handles) {
      if (!handle || handle.kind !== "file" || typeof handle.getFile !== "function") throw new Error("The picker returned an unsupported file handle.");
      const file = await handle.getFile();
      if (typeof file?.size !== "number" || !Number.isFinite(file.size) || file.size < 0) throw new Error("The selected local file must report a valid non-negative size.");
      if (file.size > maxBytes) throw new Error(`${file.name || "Local file"} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB safety limit.`);
      records.push({ file, handle, reference: reference(file), handleRef: "" });
    }
    if (options.persistHandle) {
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        const identity = `${options.idPrefix || "file"}-${index}-${record.reference.name}-${record.reference.size}-${record.reference.lastModified}`;
        const saved = await storeHandle({ handle: record.handle, projectId: options.projectId, id: identity, note: options.note || "SignalDock project file" });
        record.handleRef = saved.key;
      }
    }
    return records;
  }

  async function saveParts(options = {}) {
    const name = sanitizeName(options.name || "signaldock-export.txt");
    const mime = String(options.mime || "application/octet-stream");
    const parts = Array.isArray(options.parts) ? options.parts : [options.parts ?? ""];
    if (typeof root.showSaveFilePicker === "function" && options.preferPicker !== false) {
      try {
        const extension = name.includes(".") ? `.${name.split(".").pop()}` : ".txt";
        const handle = await root.showSaveFilePicker({ suggestedName: name, types: [{ description: "SignalDock local export", accept: { [mime.split(";")[0]]: [extension] } }] });
        const writable = await handle.createWritable();
        try { for (const part of parts) await writable.write(part); await writable.close(); }
        catch (error) { try { await writable.abort?.(); } catch { /* no-op */ } throw error; }
        let savedHandle = null;
        if (options.persistHandle) savedHandle = await storeHandle({ handle, projectId: options.projectId, id: options.id, note: options.note });
        return { mode: "file-system-access", name: handle.name || name, handle, handleRef: savedHandle?.key || "" };
      } catch (error) {
        if (error?.name === "AbortError") return { mode: "cancelled", name, handleRef: "" };
        throw error;
      }
    }
    if (!root.document || !root.URL || !root.Blob) throw new Error("Browser download APIs are unavailable.");
    const blob = new root.Blob(parts, { type: mime });
    const url = root.URL.createObjectURL(blob);
    const a = root.document.createElement("a"); a.href = url; a.download = name; a.hidden = true; root.document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    return { mode: "download", name, handleRef: "" };
  }

  async function saveText(options = {}) { return saveParts({ ...options, parts: [String(options.text ?? "")] }); }

  async function readTextFile(file, maxBytes = DEFAULT_MAX_BYTES) {
    if (!file || typeof file.text !== "function") throw new Error("A readable local file is required.");
    const size = file.size;
    if (typeof size !== "number" || !Number.isFinite(size) || size < 0) throw new Error("A readable local file must report a valid non-negative size.");
    const limit = byteLimit(maxBytes);
    if (size > limit) throw new Error(`Local file exceeds the ${Math.round(limit / 1024 / 1024)} MB safety limit.`);
    return { text: await file.text(), reference: reference(file), file };
  }

  async function pickText(options = {}) {
    const records = await pickFiles({ ...options, multiple: false, maxFiles: 1 });
    if (!records.length) return null;
    const record = records[0];
    const result = await readTextFile(record.file, options.maxBytes);
    return { ...result, handle: record.handle, handleRef: record.handleRef || "" };
  }

  root.SignalDockStorageAdapter = {
    HANDLE_DB, HANDLE_STORE, HANDLE_DB_VERSION, DEFAULT_MAX_BYTES, DEFAULT_PICK_TYPES,
    sanitizeName, capabilities, reference, handleRef,
    saveText, saveParts, readTextFile, pickText, pickFiles,
    storeHandle, getHandle, removeHandle, listHandles, removeProjectHandles,
    permissionState, requestPermission, handleStatus, reopenFile
  };
}(typeof self !== "undefined" ? self : window));
