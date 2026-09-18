(function (root) {
  "use strict";

  const SCHEMA = "signaldock.workspace";
  const VERSION = 1;
  const MAX_ENTRIES = 2_000_000;
  const MAX_RAW_SEARCH = 24 * 1024;

  function safeStringify(value) {
    if (typeof value === "string") return value;
    if (value === undefined) return "";
    try {
      const serialized = JSON.stringify(value);
      return typeof serialized === "string" ? serialized : "";
    } catch {
      return String(value ?? "");
    }
  }

  function normalizeEntry(entry, index) {
    const timestamp = String(entry?.timestamp || "");
    const timestampMs = Number.isFinite(entry?.timestampMs)
      ? entry.timestampMs
      : (timestamp ? Date.parse(timestamp) : null);
    const correlations = entry?.correlations && typeof entry.correlations === "object" ? entry.correlations : {};
    const traceMeta = entry?.traceMeta && typeof entry.traceMeta === "object" ? entry.traceMeta : {};
    const dimensions = entry?.dimensions && typeof entry.dimensions === "object" ? { environment: String(entry.dimensions.environment || ""), namespace: String(entry.dimensions.namespace || "") } : { environment: "", namespace: "" };
    const rawText = safeStringify(entry?.raw).slice(0, MAX_RAW_SEARCH);
    const correlationText = Object.entries(correlations).map(([key, value]) => `${key}:${value}`).join("\n");
    return {
      source: String(entry?.source || "workspace"),
      service: String(entry?.service || "—"),
      index: Number.isFinite(entry?.index) ? entry.index : index,
      raw: entry?.raw ?? "",
      message: String(entry?.message || ""),
      level: String(entry?.level || "UNKNOWN").toUpperCase(),
      timestamp,
      timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
      correlations,
      traceMeta,
      dimensions,
      searchText: `${entry?.message || ""}\n${rawText}\n${entry?.source || ""}\n${entry?.service || ""}\n${correlationText}`.toLowerCase()
    };
  }

  function serializableEntry(entry) {
    return {
      source: entry.source,
      service: entry.service,
      index: entry.index,
      raw: entry.raw,
      message: entry.message,
      level: entry.level,
      timestamp: entry.timestamp,
      timestampMs: entry.timestampMs,
      correlations: entry.correlations || {},
      traceMeta: entry.traceMeta || {},
      dimensions: entry.dimensions || {}
    };
  }

  function serializeParts(entries, workspace, appVersion = "") {
    const header = JSON.stringify({ schema: SCHEMA, version: VERSION, appVersion, savedAt: new Date().toISOString() }).replace(/}$/, ',"entries":[');
    const parts = [header];
    const chunkSize = 1000;
    let first = true;
    for (let offset = 0; offset < entries.length; offset += chunkSize) {
      const rows = entries.slice(offset, offset + chunkSize).map((entry) => JSON.stringify(serializableEntry(entry)));
      if (!rows.length) continue;
      parts.push((first ? "" : ",") + rows.join(","));
      first = false;
    }
    parts.push(`],"workspace":${JSON.stringify(workspace || {})}}`);
    return parts;
  }

  function parse(text) {
    const payload = JSON.parse(String(text || ""));
    if (payload?.schema !== SCHEMA || payload?.version !== VERSION || !Array.isArray(payload.entries)) {
      throw new Error("Unsupported or invalid SignalDock workspace.");
    }
    if (payload.entries.length > MAX_ENTRIES) throw new Error(`Workspace exceeds the ${MAX_ENTRIES.toLocaleString()} entry safety limit.`);
    return {
      entries: payload.entries.map(normalizeEntry),
      workspace: payload.workspace && typeof payload.workspace === "object" ? payload.workspace : {},
      metadata: { schema: payload.schema, version: payload.version, appVersion: payload.appVersion || "", savedAt: payload.savedAt || "" }
    };
  }

  root.SignalDockWorkspace = { SCHEMA, VERSION, MAX_ENTRIES, serializeParts, parse, normalizeEntry };
}(typeof self !== "undefined" ? self : window));
