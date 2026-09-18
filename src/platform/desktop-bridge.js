(function (root) {
  "use strict";

  const VERSION = 1;
  const MAX_PICKED_FILES = 128;

  function storage() { return root.SignalDockStorageAdapter || null; }
  function nativeBridge() {
    const bridge = root.SignalDockNativeBridge;
    return bridge && typeof bridge === "object" ? bridge : null;
  }
  function clean(value, max = 300) { return String(value ?? "").trim().slice(0, max); }

  function capabilities() {
    const native = nativeBridge();
    const browser = storage()?.capabilities?.() || {};
    return {
      version: VERSION,
      mode: native ? "native" : "browser",
      native: Boolean(native),
      filePicker: native ? typeof native.pickFiles === "function" : Boolean(browser.filePicker),
      savePicker: native ? typeof native.saveParts === "function" : Boolean(browser.savePicker),
      persistentHandles: native ? typeof native.reopenFile === "function" : Boolean(browser.persistentHandles),
      indexedDb: Boolean(browser.indexedDb)
    };
  }

  function normalizeRecord(record) {
    if (!record || typeof record !== "object") throw new Error("Desktop bridge returned an invalid file record.");
    const file = record.file;
    const fileSize = file?.size;
    if (!file || typeof file.name !== "string" || fileSize === null || fileSize === undefined || fileSize === "" || !Number.isFinite(Number(fileSize)) || Number(fileSize) < 0) throw new Error("Desktop bridge file record is missing a File-like object.");
    return { file, handle: record.handle || null, handleRef: clean(record.handleRef), reference: record.reference || storage()?.reference?.(file) || { name: file.name, size: Number(file.size) || 0 } };
  }

  function pickOptions(options = {}) {
    return {
      multiple: Boolean(options.multiple),
      maxFiles: Math.min(MAX_PICKED_FILES, Math.max(1, Number(options.maxFiles) || (options.multiple ? 64 : 1))),
      maxBytes: Math.max(1, Number(options.maxBytes) || 512 * 1024 * 1024),
      types: Array.isArray(options.types) ? options.types : undefined,
      persistHandle: Boolean(options.persistHandle),
      projectId: clean(options.projectId, 96),
      idPrefix: clean(options.idPrefix, 48),
      note: clean(options.note, 500)
    };
  }

  async function pickFiles(options = {}) {
    const safe = pickOptions(options);
    const native = nativeBridge();
    const result = native?.pickFiles ? await native.pickFiles(safe) : await storage()?.pickFiles?.(safe);
    if (result == null) return [];
    if (!Array.isArray(result)) throw new Error("Desktop bridge pickFiles must return an array.");
    if (result.length > safe.maxFiles) throw new Error(`Desktop bridge returned more than ${safe.maxFiles} files.`);
    return result.map(normalizeRecord);
  }

  async function saveParts(options = {}) {
    const safe = { name: clean(options.name, 180), mime: clean(options.mime, 160), parts: Array.isArray(options.parts) ? options.parts : [options.parts ?? ""], persistHandle: Boolean(options.persistHandle), projectId: clean(options.projectId, 96), id: clean(options.id, 96), note: clean(options.note, 500), preferPicker: options.preferPicker !== false };
    const native = nativeBridge();
    const result = native?.saveParts ? await native.saveParts(safe) : await storage()?.saveParts?.(safe);
    if (!result || typeof result !== "object") throw new Error("No storage backend is available to save this file.");
    if (!new Set(["file-system-access", "download", "native", "cancelled"]).has(result.mode)) throw new Error("Desktop bridge returned an unsupported save mode.");
    return { ...result, name: clean(result.name || safe.name, 180), handleRef: clean(result.handleRef, 300) };
  }

  async function reopenFile(ref, options = {}) {
    const key = clean(ref);
    if (!key) throw new Error("A saved local file reference is required.");
    const native = nativeBridge();
    const result = native?.reopenFile ? await native.reopenFile({ ref: key, requestPermission: options.requestPermission !== false }) : await storage()?.reopenFile?.(key, options);
    if (!result) throw new Error("The saved local file could not be reopened.");
    return normalizeRecord(result);
  }

  async function handleStatus(ref) {
    const key = clean(ref);
    if (!key) return { exists: false, ref: "", permission: "missing", kind: "", name: "" };
    const native = nativeBridge();
    if (native?.handleStatus) return native.handleStatus({ ref: key });
    return storage()?.handleStatus?.(key) || { exists: false, ref: key, permission: "unsupported", kind: "", name: "" };
  }

  async function forgetHandle(ref) {
    const key = clean(ref);
    if (!key) return false;
    const native = nativeBridge();
    if (native?.forgetHandle) return Boolean(await native.forgetHandle({ ref: key }));
    return Boolean(await storage()?.removeHandle?.(key));
  }

  async function forgetProjectHandles(projectId) {
    const id = clean(projectId, 96);
    if (!id) return 0;
    const native = nativeBridge();
    if (native?.forgetProjectHandles) return Math.max(0, Number(await native.forgetProjectHandles({ projectId: id })) || 0);
    return Math.max(0, Number(await storage()?.removeProjectHandles?.(id)) || 0);
  }

  root.SignalDockDesktopBridge = { VERSION, MAX_PICKED_FILES, capabilities, pickFiles, saveParts, reopenFile, handleStatus, forgetHandle, forgetProjectHandles };
}(typeof self !== "undefined" ? self : window));
