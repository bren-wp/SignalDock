(function (root) {
  "use strict";

  const HANDLE_DB = "signaldock-local-handles";
  const HANDLE_STORE = "handles";
  const HANDLE_DB_VERSION = 1;

  function sanitizeName(name, fallback = "signaldock-export.txt") {
    const out = String(name || "").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").slice(0, 180);
    return out || fallback;
  }

  function clean(value, max = 200) {
    return String(value ?? "").trim().slice(0, max);
  }

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
      handle
    };
    await withHandleStore("readwrite", (store) => { store.put(record); });
    return { key: record.key, projectId: record.projectId, kind: record.kind, name: record.name, note: record.note, createdAt: record.createdAt, updatedAt: record.updatedAt };
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
      request.onsuccess = () => resolve((request.result || []).map((record) => ({ key: record.key, projectId: record.projectId, kind: record.kind, name: record.name, note: record.note, createdAt: record.createdAt, updatedAt: record.updatedAt })));
      request.onerror = () => reject(request.error || new Error("Could not list local handle references."));
    });
  }

  async function permissionState(handle, mode = "read") {
    if (!handle || typeof handle.queryPermission !== "function") return "unknown";
    try { return await handle.queryPermission({ mode: mode === "readwrite" ? "readwrite" : "read" }); } catch { return "unknown"; }
  }

  async function requestPermission(handle, mode = "read") {
    if (!handle || typeof handle.requestPermission !== "function") return permissionState(handle, mode);
    try { return await handle.requestPermission({ mode: mode === "readwrite" ? "readwrite" : "read" }); } catch { return "denied"; }
  }

  async function reopenFile(ref, options = {}) {
    const record = await getHandle(ref);
    if (!record?.handle || record.handle.kind !== "file") throw new Error("The saved local file handle is unavailable on this device.");
    let permission = await permissionState(record.handle, "read");
    if (permission !== "granted" && options.requestPermission !== false) permission = await requestPermission(record.handle, "read");
    if (permission !== "granted" && permission !== "unknown") throw new Error("Permission to reopen the local file was not granted.");
    const file = await record.handle.getFile();
    return { file, reference: reference(file), handle: record.handle, handleRef: record.key, permission };
  }

  async function saveText(options = {}) {
    const name = sanitizeName(options.name || "signaldock-export.txt");
    const mime = String(options.mime || "text/plain;charset=utf-8");
    const text = String(options.text ?? "");
    if (typeof root.showSaveFilePicker === "function" && options.preferPicker !== false) {
      try {
        const extension = name.includes(".") ? `.${name.split(".").pop()}` : ".txt";
        const handle = await root.showSaveFilePicker({ suggestedName: name, types: [{ description: "SignalDock local export", accept: { [mime.split(";")[0]]: [extension] } }] });
        const writable = await handle.createWritable(); await writable.write(text); await writable.close();
        let savedHandle = null;
        if (options.persistHandle) {
          try { savedHandle = await storeHandle({ handle, projectId: options.projectId, id: options.id, note: options.note }); } catch { savedHandle = null; }
        }
        return { mode: "file-system-access", name: handle.name || name, handle, handleRef: savedHandle?.key || "" };
      } catch (error) {
        if (error?.name === "AbortError") return { mode: "cancelled", name };
      }
    }
    if (!root.document || !root.URL || !root.Blob) throw new Error("Browser download APIs are unavailable.");
    const blob = new Blob([text], { type: mime }); const url = root.URL.createObjectURL(blob); const a = root.document.createElement("a"); a.href = url; a.download = name; a.hidden = true; root.document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    return { mode: "download", name };
  }

  async function readTextFile(file, maxBytes = 512 * 1024 * 1024) {
    if (!file || typeof file.text !== "function") throw new Error("A readable local file is required.");
    const size = Math.max(0, Number(file.size) || 0);
    if (size > maxBytes) throw new Error(`Local file exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB safety limit.`);
    return { text: await file.text(), reference: reference(file), file };
  }

  async function pickText(options = {}) {
    if (typeof root.showOpenFilePicker !== "function") throw new Error("Native local file picker is unavailable in this browser.");
    const types = Array.isArray(options.types) ? options.types : [{ description: "SignalDock local file", accept: { "application/json": [".json", ".sdsession", ".sdbaseline", ".sdcase", ".sdbundle"] } }];
    const [handle] = await root.showOpenFilePicker({ multiple: false, types });
    if (!handle) return null;
    const file = await handle.getFile();
    const result = await readTextFile(file, Number(options.maxBytes) || 512 * 1024 * 1024);
    let savedHandle = null;
    if (options.persistHandle) {
      try { savedHandle = await storeHandle({ handle, projectId: options.projectId, id: options.id, note: options.note }); } catch { savedHandle = null; }
    }
    return { ...result, handle, handleRef: savedHandle?.key || "" };
  }

  root.SignalDockStorageAdapter = {
    HANDLE_DB, HANDLE_STORE, HANDLE_DB_VERSION,
    sanitizeName, capabilities, reference, handleRef,
    saveText, readTextFile, pickText,
    storeHandle, getHandle, removeHandle, listHandles,
    permissionState, requestPermission, reopenFile
  };
}(typeof self !== "undefined" ? self : window));
