(function () {
  "use strict";

  const SUPPORTED_TEXT = /\.(json|jsonl|ndjson|log|txt)$/i;
  const STREAMABLE_TEXT = /\.(jsonl|ndjson|log|txt)$/i;
  const STREAM_THRESHOLD = 5 * 1024 * 1024;
  const MAX_PLAIN_FILE = 750 * 1024 * 1024;
  const MAX_SEARCH_RAW = 24 * 1024;
  const decoder = new TextDecoder("utf-8", { fatal: false });

  const LEVEL_PATHS = ["level", "loglevel", "log_level", "log.level", "severity", "severitytext", "severity_text", "severityText", "type"];
  const MESSAGE_PATHS = ["message", "msg", "body", "renderedmessage", "rendered_message", "text", "event", "event.original", "exceptionmessage", "exception.message", "error.message"];
  const TIME_PATHS = ["timestamp", "@timestamp", "time", "datetime", "date", "loggedon", "logged_on", "event.created", "event.ingested", "@t"];
  const SERVICE_PATHS = ["service.name", "resource.service.name", "service", "service_name", "servicename", "component", "logger", "category", "application", "app", "module"];
  const ENVIRONMENT_PATHS = ["deployment.environment.name", "resource.deployment.environment.name", "deployment.environment", "resource.deployment.environment", "environment", "env"];
  const NAMESPACE_PATHS = ["service.namespace", "namespace", "kubernetes.namespace_name", "kubernetes.namespace", "k8s.namespace.name", "resource.service.namespace"];
  const CORRELATION_PATHS = {
    trace: ["trace.id", "trace_id", "traceId", "traceid", "otel.trace_id"],
    span: ["span.id", "span_id", "spanId", "spanid", "otel.span_id"],
    request: ["request.id", "request_id", "requestId", "requestid", "http.request.id"],
    correlation: ["correlation.id", "correlation_id", "correlationId", "correlationid"],
    job: ["job.id", "job_id", "jobId", "jobid"],
    session: ["session.id", "session_id", "sessionId", "sessionid"],
    user: ["user.id", "user_id", "userId", "userid"]
  };
  const TRACE_META_PATHS = {
    parentSpan: ["parent_span_id", "parentSpanId", "parent.span.id", "span.parent_id", "otel.parent_span_id"],
    name: ["span.name", "operation.name", "operation", "name", "event.name"],
    durationMs: ["duration_ms", "durationMs", "span.duration_ms", "duration"]
  };

  function getCaseInsensitiveKey(obj, wanted) {
    if (!obj || typeof obj !== "object") return undefined;
    const key = Object.keys(obj).find((item) => item.toLowerCase() === wanted.toLowerCase());
    return key === undefined ? undefined : obj[key];
  }

  function getPathValue(obj, path) {
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
      current = getCaseInsensitiveKey(current, part);
      if (current === undefined) return undefined;
    }
    return current;
  }

  function valueByCandidates(obj, candidates) {
    for (const candidate of candidates) {
      const value = getPathValue(obj, candidate);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  function normalizeLevel(value) {
    const level = String(value ?? "UNKNOWN").trim().toUpperCase();
    const aliases = {
      WARNING: "WARN", WRN: "WARN", ERR: "ERROR", CRITICAL: "FATAL", CRIT: "FATAL",
      INFORMATION: "INFO", VERBOSE: "TRACE", NOTICE: "INFO", SEVERE: "ERROR",
      EMERG: "FATAL", EMERGENCY: "FATAL", ALERT: "FATAL"
    };
    const normalized = aliases[level] || level;
    return ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"].includes(normalized) ? normalized : "UNKNOWN";
  }

  function inferLevel(message, status) {
    if (Number(status) >= 500) return "ERROR";
    if (Number(status) >= 400) return "WARN";
    const text = String(message || "").toLowerCase();
    if (/\b(fatal|panic|critical|crit)\b/.test(text)) return "FATAL";
    if (/\b(error|exception|failed|failure|denied|timeout)\b/.test(text)) return "ERROR";
    if (/\b(warn|warning|slow|retry|degraded)\b/.test(text)) return "WARN";
    if (/\b(debug|trace)\b/.test(text)) return text.includes("trace") ? "TRACE" : "DEBUG";
    return "UNKNOWN";
  }

  function normalizeTime(value) {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "number") {
      const millis = value < 1e12 ? value * 1000 : value;
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
    }
    const text = String(value).trim();
    if (!text) return "";
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? text : new Date(parsed).toISOString();
  }

  function stringifyMessage(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }

  function normalizeService(value) {
    const text = String(value ?? "").trim();
    return text || "—";
  }

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

  function normalizeCorrelationValue(value) {
    if (value === null || value === undefined) return "";
    const text = String(value).trim();
    if (!text || text.length > 256) return "";
    return text;
  }

  function extractCorrelationsFromObject(raw) {
    const correlations = {};
    for (const [kind, paths] of Object.entries(CORRELATION_PATHS)) {
      const value = normalizeCorrelationValue(valueByCandidates(raw, paths));
      if (value) correlations[kind] = value;
    }
    return correlations;
  }

  function normalizeDurationMs(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  function normalizeDurationNs(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric / 1e6 : null;
  }

  function extractTraceMetaFromObject(raw) {
    const parentSpan = normalizeCorrelationValue(valueByCandidates(raw, TRACE_META_PATHS.parentSpan));
    const name = stringifyMessage(valueByCandidates(raw, TRACE_META_PATHS.name)).slice(0, 160);
    let durationMs = normalizeDurationMs(valueByCandidates(raw, TRACE_META_PATHS.durationMs));
    if (durationMs === null) durationMs = normalizeDurationNs(valueByCandidates(raw, ["event.duration", "duration_ns", "durationNano", "duration_nanos", "span.duration_ns"]));
    const events = window.SignalDockSpanEvents?.extract?.(raw) || [];
    const otel = raw?.otel && typeof raw.otel === "object" ? {
      kind: raw.otel.kind ?? "",
      status: raw.otel.status && typeof raw.otel.status === "object" ? raw.otel.status : {},
      resource: raw.otel.resource && typeof raw.otel.resource === "object" ? raw.otel.resource : {},
      resourceSchemaUrl: String(raw.otel.resourceSchemaUrl || ""),
      scope: raw.otel.scope && typeof raw.otel.scope === "object" ? raw.otel.scope : (raw.scope ? { name: String(raw.scope) } : {}),
      attributes: raw.attributes && typeof raw.attributes === "object" ? raw.attributes : {}
    } : null;
    return { parentSpan, name, durationMs, events, otel };
  }

  function extractTraceMetaFromText(text) {
    const source = String(text || "");
    const parent = source.match(/(?:\bparent[._-]?span[._-]?id\s*[=:]|\bparent_span\s*=)\s*["']?([A-Za-z0-9._:-]{4,128})/i);
    const duration = source.match(/\b(?:duration(?:_ms|Ms)?|elapsed(?:_ms|Ms)?)\s*[=:]\s*([0-9]+(?:\.[0-9]+)?)(?:ms)?/i);
    return { parentSpan: parent?.[1] || "", name: "", durationMs: normalizeDurationMs(duration?.[1]), events: [] };
  }

  function extractDimensions(input) {
    if (input && typeof input === "object") {
      return {
        environment: normalizeCorrelationValue(valueByCandidates(input, ENVIRONMENT_PATHS)),
        namespace: normalizeCorrelationValue(valueByCandidates(input, NAMESPACE_PATHS))
      };
    }
    const text = String(input || "");
    const env = text.match(/(?:\b(?:environment|env)\s*[=:])\s*["\']?([A-Za-z0-9._:@/-]{1,128})/i);
    const namespace = text.match(/(?:\b(?:service[._-]?namespace|namespace|k8s[._-]?namespace)\s*[=:])\s*["\']?([A-Za-z0-9._:@/-]{1,128})/i);
    return { environment: env?.[1] || "", namespace: namespace?.[1] || "" };
  }

  function extractCorrelationsFromText(text) {
    const source = String(text || "");
    const correlations = {};
    const patterns = {
      trace: /(?:\btrace[._-]?id\s*[=:]|\btrace\s*=)\s*["']?([A-Za-z0-9._:-]{4,128})/i,
      span: /(?:\bspan[._-]?id\s*[=:]|\bspan\s*=)\s*["']?([A-Za-z0-9._:-]{4,128})/i,
      request: /(?:\brequest[._-]?id\s*[=:]|\brequest\s*=)\s*["']?([A-Za-z0-9._:-]{3,128})/i,
      correlation: /(?:\bcorrelation[._-]?id\s*[=:]|\bcorrelation\s*=)\s*["']?([A-Za-z0-9._:-]{3,128})/i,
      job: /(?:\bjob[._-]?id\s*[=:]|\bjob\s*=)\s*["']?([A-Za-z0-9._:-]{2,128})/i,
      session: /(?:\bsession[._-]?id\s*[=:]|\bsession\s*=)\s*["']?([A-Za-z0-9._:-]{3,128})/i,
      user: /(?:\buser[._-]?id\s*[=:]|\buser\s*=)\s*["']?([A-Za-z0-9._:@-]{2,128})/i
    };
    for (const [kind, pattern] of Object.entries(patterns)) {
      const match = source.match(pattern);
      if (match?.[1]) correlations[kind] = match[1];
    }
    return correlations;
  }

  function createEntry({ raw, source, index, message, level, timestamp, service, correlations, traceMeta, dimensions }) {
    const normalizedMessage = String(message ?? "");
    const normalizedSource = String(source ?? "unknown");
    const normalizedService = normalizeService(service);
    const normalizedTimestamp = normalizeTime(timestamp);
    const normalizedCorrelations = correlations && typeof correlations === "object" ? correlations : extractCorrelationsFromText(typeof raw === "string" ? raw : normalizedMessage);
    const normalizedTraceMeta = traceMeta && typeof traceMeta === "object" ? traceMeta : (typeof raw === "object" && raw !== null ? extractTraceMetaFromObject(raw) : extractTraceMetaFromText(typeof raw === "string" ? raw : normalizedMessage));
    const normalizedDimensions = dimensions && typeof dimensions === "object" ? { environment: String(dimensions.environment || "").trim(), namespace: String(dimensions.namespace || "").trim() } : extractDimensions(typeof raw === "object" && raw !== null ? raw : (typeof raw === "string" ? raw : normalizedMessage));
    const rawText = typeof raw === "string" && raw === normalizedMessage ? "" : safeStringify(raw).slice(0, MAX_SEARCH_RAW);
    const correlationText = Object.entries(normalizedCorrelations).map(([key, value]) => `${key}:${value}`).join("\n");
    const parsedTime = normalizedTimestamp ? Date.parse(normalizedTimestamp) : NaN;
    return {
      id: `${normalizedSource}:${index}`,
      source: normalizedSource,
      service: normalizedService,
      index,
      raw,
      message: normalizedMessage,
      level: normalizeLevel(level),
      timestamp: normalizedTimestamp,
      timestampMs: Number.isNaN(parsedTime) ? null : parsedTime,
      correlations: normalizedCorrelations,
      traceMeta: normalizedTraceMeta,
      dimensions: normalizedDimensions,
      searchText: `${normalizedMessage}\n${rawText}\n${normalizedSource}\n${normalizedService}\n${correlationText}`.toLowerCase()
    };
  }

  function fromObject(raw, source, index) {
    const message = stringifyMessage(valueByCandidates(raw, MESSAGE_PATHS)) || stringifyMessage(raw);
    let level = normalizeLevel(valueByCandidates(raw, LEVEL_PATHS));
    if (level === "UNKNOWN") level = inferLevel(message, valueByCandidates(raw, ["status", "statusCode", "http.status_code", "http.response.status_code"]));
    const timestamp = normalizeTime(valueByCandidates(raw, TIME_PATHS));
    const service = normalizeService(valueByCandidates(raw, SERVICE_PATHS));
    const correlations = extractCorrelationsFromObject(raw);
    const traceMeta = extractTraceMetaFromObject(raw);
    const dimensions = extractDimensions(raw);
    return createEntry({ raw, source, index, message, level, timestamp, service, correlations, traceMeta, dimensions });
  }

  function parseLogfmt(line) {
    const pairs = {};
    const matcher = /([A-Za-z0-9_.@-]+)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)/g;
    let match;
    let found = 0;
    while ((match = matcher.exec(line)) !== null) {
      found += 1;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      pairs[match[1]] = value.replace(/\\"/g, '"');
    }
    return found >= 2 ? pairs : null;
  }

  function normalizeCustomProfile(config) {
    if (config?.regex instanceof RegExp && config.pattern) return config;
    const pattern = String(config?.pattern || "").trim();
    const flags = String(config?.flags || "").replace(/[^imsu]/g, "");
    if (!pattern) return null;
    if (pattern.length > 500) throw new Error("Custom parser regex is limited to 500 characters.");
    let regex;
    try { regex = new RegExp(pattern, flags); }
    catch (error) { throw new Error(`Invalid custom parser regex: ${error.message || error}`); }
    return { pattern, flags, regex };
  }

  function parseCustomLine(line, source, index, config) {
    const normalized = normalizeCustomProfile(config);
    if (!normalized) return null;
    normalized.regex.lastIndex = 0;
    const match = normalized.regex.exec(line);
    if (!match) return null;
    const groups = match.groups || {};
    const message = groups.message ?? groups.msg ?? match[0] ?? line;
    const level = groups.level ?? groups.severity ?? inferLevel(message);
    const timestamp = groups.time ?? groups.timestamp ?? groups.date ?? "";
    const service = groups.service ?? groups.logger ?? groups.source ?? "—";
    return createEntry({
      raw: line, source, index, message, level, timestamp, service,
      correlations: extractCorrelationsFromText(line),
      traceMeta: extractTraceMetaFromText(line)
    });
  }

  function parsePlainLine(line, source, index, profile = "auto", customProfile = null) {
    if (profile === "custom") {
      const custom = parseCustomLine(line, source, index, customProfile);
      if (custom) return custom;
    }
    if (profile === "auto" && window.SignalDockParserPlugins?.parseLine) {
      const plugin = window.SignalDockParserPlugins.parseLine(line, { source, index });
      if (plugin) {
        return createEntry({
          raw: line, source, index,
          message: plugin.message ?? line,
          level: plugin.level ?? inferLevel(plugin.message ?? line),
          timestamp: plugin.timestamp ?? "",
          service: plugin.service ?? "—",
          correlations: Object.assign(extractCorrelationsFromText(line), plugin.correlations || {}),
          traceMeta: Object.assign(extractTraceMetaFromText(line), plugin.traceMeta || {}),
          dimensions: Object.assign(extractDimensions(line), plugin.dimensions || {})
        });
      }
    }
    const correlations = extractCorrelationsFromText(line);
    const traceMeta = extractTraceMetaFromText(line);
    const docker = (profile === "auto") ? line.match(/^(?<time>\d{4}-\d{2}-\d{2}T\S+)\s+(?<stream>stdout|stderr)\s+[FP]\s+(?<message>[\s\S]*)$/i) : null;
    if (docker?.groups) {
      const level = inferLevel(docker.groups.message);
      return createEntry({ raw: line, source, index, message: docker.groups.message, level, timestamp: docker.groups.time, service: docker.groups.stream, correlations, traceMeta });
    }

    const apache = (profile === "auto" || profile === "access") ? line.match(/^(?<host>\S+)\s+\S+\s+\S+\s+\[(?<time>[^\]]+)\]\s+"(?<method>[A-Z]+)\s+(?<path>[^\s"]+)[^"]*"\s+(?<status>\d{3})\s+(?<bytes>\S+)(?:\s+"(?<ref>[^"]*)"\s+"(?<agent>[^"]*)")?/) : null;
    if (apache?.groups) {
      const message = `${apache.groups.method} ${apache.groups.path} ${apache.groups.status}`;
      return createEntry({ raw: line, source, index, message, level: inferLevel(message, apache.groups.status), timestamp: apache.groups.time, service: "http", correlations, traceMeta });
    }

    const syslog = (profile === "auto" || profile === "syslog") ? line.match(/^(?<time>[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(?<host>\S+)\s+(?<service>[\w.@/-]+?)(?:\[\d+\])?:\s+(?<message>[\s\S]*)$/) : null;
    if (syslog?.groups) {
      return createEntry({ raw: line, source, index, message: syslog.groups.message, level: inferLevel(syslog.groups.message), timestamp: syslog.groups.time, service: syslog.groups.service, correlations, traceMeta });
    }

    const patterns = [
      /^(?<time>\d{4}-\d{2}-\d{2}[T ][0-9:.+\-Z]+)\s+[|\[]?(?<level>TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRIT(?:ICAL)?)[\]|:]?\s+(?:\[(?<service>[^\]]+)\]\s*)?(?<message>[\s\S]*)$/i,
      /^\[?(?<time>\d{4}-\d{2}-\d{2}[T ][0-9:.+\-Z]+)\]?\s+[|\[]?(?<level>TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRIT(?:ICAL)?)[\]|:]?\s+(?<message>[\s\S]*)$/i,
      /^\[?(?<level>TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRIT(?:ICAL)?)\]?\s*[:|\-]\s*(?<message>[\s\S]*)$/i
    ];

    if (profile === "auto" || profile === "nlog") for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.groups) {
        return createEntry({
          raw: line,
          source,
          index,
          message: match.groups.message || line,
          level: normalizeLevel(match.groups.level),
          timestamp: normalizeTime(match.groups.time || ""),
          service: normalizeService(match.groups.service || ""),
          correlations,
          traceMeta
        });
      }
    }

    const logfmt = (profile === "auto" || profile === "logfmt") ? parseLogfmt(line) : null;
    if (logfmt) return fromObject(logfmt, source, index);

    return createEntry({ raw: line, source, index, message: line, level: inferLevel(line), timestamp: "", service: "—", correlations, traceMeta });
  }

  function isContinuation(line) {
    return /^\s+/.test(line) || /^(at\s+|Caused by:|Suppressed:|\.\.\.\s+\d+\s+more|---\s+)/.test(line);
  }

  function groupMultiline(lines) {
    const groups = [];
    let current = "";
    for (const line of lines) {
      if (current && isContinuation(line)) current += `\n${line}`;
      else {
        if (current) groups.push(current);
        current = line;
      }
    }
    if (current) groups.push(current);
    return groups;
  }

  function parseCandidate(candidate, source, index, profile = "auto", customProfile = null) {
    const trimmed = candidate.trim();
    if ((profile === "auto" || profile === "json") && ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return fromObject(parsed, source, index);
      } catch { /* mixed/plain text is valid */ }
    }
    return parsePlainLine(candidate, source, index, profile, customProfile);
  }

  function parseText(text, source, profile = "auto", customProfile = null) {
    const normalizedCustom = profile === "custom" ? normalizeCustomProfile(customProfile) : customProfile;
    if (profile === "custom" && !normalizedCustom) throw new Error("Custom parser regex is empty.");
    const trimmed = text.replace(/^\uFEFF/, "").trim();
    if (!trimmed) return [];

    if (profile === "auto" || profile === "json") try {
      const parsed = JSON.parse(trimmed);
      const topLevel = Array.isArray(parsed) ? parsed : [parsed];
      const expanded = [];
      for (const item of topLevel) {
        const otlp = window.SignalDockSpanEvents?.flattenOtlp?.(item) || [];
        if (otlp.length) expanded.push(...otlp); else expanded.push(item);
      }
      return expanded.map((item, index) => typeof item === "object" && item !== null
        ? fromObject(item, source, index)
        : createEntry({ raw: item, source, index, message: item, level: "UNKNOWN", timestamp: "", service: "—" }));
    } catch { /* continue with line-oriented parsing */ }

    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
    return groupMultiline(lines).map((line, index) => parseCandidate(line, source, index, profile, normalizedCustom));
  }

  async function parseStreamedTextFile(file, progress, profile = "auto", customProfile = null) {
    const normalizedCustom = profile === "custom" ? normalizeCustomProfile(customProfile) : customProfile;
    if (profile === "custom" && !normalizedCustom) throw new Error("Custom parser regex is empty.");
    const reader = file.stream().getReader();
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    const entries = [];
    let carry = "";
    let pending = "";
    let readBytes = 0;
    let entryIndex = 0;

    function flushPending() {
      if (!pending.trim()) return;
      entries.push(parseCandidate(pending, file.name, entryIndex, profile, normalizedCustom));
      entryIndex += 1;
      pending = "";
    }

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      readBytes += value.byteLength;
      carry += textDecoder.decode(value, { stream: true });
      const lines = carry.split(/\r?\n/);
      carry = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        if (pending && isContinuation(line)) pending += `\n${line}`;
        else {
          flushPending();
          pending = line;
        }
      }
      if (progress) progress(Math.min(0.98, readBytes / Math.max(file.size, 1)));
      if (entries.length && entries.length % 5000 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    carry += textDecoder.decode();
    if (carry.trim()) {
      if (pending && isContinuation(carry)) pending += `\n${carry}`;
      else { flushPending(); pending = carry; }
    }
    flushPending();
    if (progress) progress(1);
    return entries;
  }

  async function parseFile(file, progress, options = {}) {
    const lower = file.name.toLowerCase();
    const profile = ["auto", "nlog", "json", "access", "syslog", "logfmt", "custom"].includes(options.profile) ? options.profile : "auto";
    const customProfile = options.customProfile && typeof options.customProfile === "object" ? options.customProfile : null;
    const normalizedCustom = profile === "custom" ? normalizeCustomProfile(customProfile) : customProfile;
    if (profile === "custom" && !normalizedCustom) throw new Error("Custom parser regex is empty.");
    if (file.size > MAX_PLAIN_FILE && !lower.endsWith(".zip")) throw new Error(`${file.name} is larger than the 750 MB safety limit.`);

    if (lower.endsWith(".zip")) {
      const extracted = await window.SignalDockZip.extract(await file.arrayBuffer());
      const entries = [];
      for (let i = 0; i < extracted.length; i += 1) {
        const item = extracted[i];
        if (!SUPPORTED_TEXT.test(item.name)) continue;
        entries.push(...parseText(decoder.decode(item.data), `${file.name} / ${item.name}`, profile, normalizedCustom));
        if (progress) progress((i + 1) / Math.max(extracted.length, 1));
        if (entries.length && entries.length % 5000 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!entries.length) throw new Error(`${file.name} contains no supported log files.`);
      return entries;
    }

    if (!SUPPORTED_TEXT.test(lower)) throw new Error(`Unsupported file type: ${file.name}`);
    if (file.size >= STREAM_THRESHOLD && STREAMABLE_TEXT.test(lower) && file.stream) return parseStreamedTextFile(file, progress, profile, normalizedCustom);
    const entries = parseText(await file.text(), file.name, profile, normalizedCustom);
    if (progress) progress(1);
    return entries;
  }

  window.SignalDockParser = { parseFile, parseText, parsePlainLine, normalizeLevel, extractCorrelationsFromObject, extractCorrelationsFromText, extractTraceMetaFromObject, extractTraceMetaFromText, extractDimensions, normalizeCustomProfile };
}());
