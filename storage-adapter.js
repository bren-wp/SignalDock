(function (root) {
  "use strict";

  function sanitizeName(name, fallback = "signaldock-export.txt") {
    const out = String(name || "").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").slice(0, 180);
    return out || fallback;
  }

  function capabilities() {
    return {
      filePicker: typeof root.showOpenFilePicker === "function",
      savePicker: typeof root.showSaveFilePicker === "function",
      directoryPicker: typeof root.showDirectoryPicker === "function",
      indexedDb: typeof root.indexedDB !== "undefined"
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

  async function saveText(options = {}) {
    const name = sanitizeName(options.name || "signaldock-export.txt");
    const mime = String(options.mime || "text/plain;charset=utf-8");
    const text = String(options.text ?? "");
    if (typeof root.showSaveFilePicker === "function" && options.preferPicker !== false) {
      try {
        const extension = name.includes(".") ? `.${name.split(".").pop()}` : ".txt";
        const handle = await root.showSaveFilePicker({ suggestedName: name, types: [{ description: "SignalDock local export", accept: { [mime.split(";")[0]]: [extension] } }] });
        const writable = await handle.createWritable(); await writable.write(text); await writable.close();
        return { mode: "file-system-access", name: handle.name || name };
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
    return { ...result, handle };
  }

  root.SignalDockStorageAdapter = { sanitizeName, capabilities, reference, saveText, readTextFile, pickText };
}(typeof self !== "undefined" ? self : window));
