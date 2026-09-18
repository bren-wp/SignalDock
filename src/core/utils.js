(function () {
  "use strict";

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  }

  function formatTime(value) {
    if (!value) return "—";
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return String(value).slice(0, 30);
    const date = new Date(parsed);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}.${ms}`;
  }

  function debounce(fn, delay) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function safeStringify(value, pretty = true) {
    if (typeof value === "string") return value;
    if (value === undefined) return "";
    try {
      const serialized = JSON.stringify(value, null, pretty ? 2 : 0);
      return typeof serialized === "string" ? serialized : "";
    } catch {
      return String(value ?? "");
    }
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadJson(filename, data) {
    downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
  }

  function downloadParts(filename, parts, mime = "text/plain;charset=utf-8") {
    downloadBlob(filename, new Blob(parts, { type: mime }));
  }

  function downloadNdjson(filename, rows, chunkSize = 2000) {
    const parts = [];
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const end = Math.min(rows.length, offset + chunkSize);
      const chunk = [];
      for (let index = offset; index < end; index += 1) chunk.push(JSON.stringify(rows[index]));
      parts.push(chunk.join("\n") + "\n");
    }
    downloadParts(filename, parts, "application/x-ndjson;charset=utf-8");
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "clipboard-fallback";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  function shortSource(source) {
    const parts = String(source || "").split(/\s*\/\s*/);
    return parts[parts.length - 1] || String(source || "unknown");
  }

  function loadJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch { return fallback; }
  }

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  window.SignalDockUtils = { formatBytes, formatTime, debounce, safeStringify, downloadJson, downloadParts, downloadNdjson, copyText, shortSource, loadJson, saveJson };
}());
