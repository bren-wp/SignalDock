(function (root) {
  "use strict";

  const plugins = new Map();
  let orderedPlugins = [];
  let orderDirty = true;

  function validate(plugin) {
    if (!plugin || typeof plugin !== "object") throw new Error("Parser plugin must be an object.");
    const id = String(plugin.id || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(id)) throw new Error("Parser plugin id must use lowercase letters, numbers and hyphens.");
    if (typeof plugin.test !== "function" || typeof plugin.parse !== "function") throw new Error(`Parser plugin ${id} requires test() and parse().`);
    return Object.freeze({ id, label: String(plugin.label || id), priority: Number(plugin.priority) || 0, test: plugin.test, parse: plugin.parse });
  }

  function ordered() {
    if (orderDirty) {
      orderedPlugins = [...plugins.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
      orderDirty = false;
    }
    return orderedPlugins;
  }

  function register(plugin) {
    const normalized = validate(plugin);
    plugins.set(normalized.id, normalized);
    orderDirty = true;
    return normalized;
  }

  function unregister(id) {
    const removed = plugins.delete(String(id || "").toLowerCase());
    if (removed) orderDirty = true;
    return removed;
  }

  function list() {
    return ordered().map((plugin) => ({ id: plugin.id, label: plugin.label, priority: plugin.priority }));
  }

  function parseLine(line, context = {}) {
    for (const plugin of ordered()) {
      try {
        if (!plugin.test(line, context)) continue;
        const result = plugin.parse(line, context);
        if (result && typeof result === "object") return Object.assign({ pluginId: plugin.id }, result);
      } catch {
        // A parser plugin must never prevent the built-in parser chain from continuing.
      }
    }
    return null;
  }

  function splitCefHeader(line) {
    const fields = [];
    let current = "";
    let escaped = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (escaped) { current += ch; escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === "|" && fields.length < 7) { fields.push(current); current = ""; continue; }
      current += ch;
    }
    fields.push(current);
    return fields;
  }

  function parseCefExtension(text) {
    const out = {};
    const matcher = /(?:^|\s)([A-Za-z][A-Za-z0-9_.-]{0,63})=(.*?)(?=\s+[A-Za-z][A-Za-z0-9_.-]{0,63}=|$)/g;
    let match;
    while ((match = matcher.exec(String(text || ""))) !== null) out[match[1]] = match[2].trim();
    return out;
  }

  register({
    id: "cef",
    label: "CEF security event",
    priority: 100,
    test(line) { return /^CEF:\d+\|/.test(String(line || "")); },
    parse(line) {
      const fields = splitCefHeader(String(line));
      if (fields.length < 8) return null;
      const extension = parseCefExtension(fields.slice(7).join("|"));
      const severityRaw = String(fields[6] || extension.severity || "").toLowerCase();
      const numericSeverity = Number(severityRaw);
      let level = "INFO";
      if (Number.isFinite(numericSeverity)) level = numericSeverity >= 8 ? "ERROR" : numericSeverity >= 5 ? "WARN" : "INFO";
      else if (/fatal|critical|very-high|high/.test(severityRaw)) level = "ERROR";
      else if (/warn|medium/.test(severityRaw)) level = "WARN";
      const rawTimestamp = extension.rt || extension.end || extension.start || "";
      const timestamp = /^\d{10,16}$/.test(String(rawTimestamp)) ? Number(rawTimestamp) : rawTimestamp;
      const service = fields[2] || fields[1] || "cef";
      const message = fields[5] || extension.msg || "CEF event";
      return { message, level, timestamp, service, rawObject: { cef: { version: fields[0], vendor: fields[1], product: fields[2], productVersion: fields[3], signature: fields[4], name: fields[5], severity: fields[6] }, extension } };
    }
  });

  root.SignalDockParserPlugins = { register, unregister, list, parseLine };
}(typeof self !== "undefined" ? self : window));
