(function (root) {
  "use strict";

  const MAX_EVENTS_PER_SPAN = 256;
  const MAX_ATTRIBUTES = 64;

  function valueAt(obj, path) {
    let current = obj;
    for (const part of String(path).split('.')) {
      if (!current || typeof current !== 'object') return undefined;
      const key = Object.keys(current).find((candidate) => candidate.toLowerCase() === part.toLowerCase());
      if (key === undefined) return undefined;
      current = current[key];
    }
    return current;
  }

  function timestampMs(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' || /^\d{10,20}$/.test(String(value))) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return null;
      if (numeric >= 1e17) return numeric / 1e6; // nanoseconds
      if (numeric >= 1e14) return numeric / 1e3; // microseconds
      if (numeric >= 1e12) return numeric; // milliseconds
      if (numeric >= 1e9) return numeric * 1000; // seconds
    }
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? null : parsed;
  }

  function unwrapAttributeValue(input) {
    const value = input?.stringValue ?? input?.string_value ?? input?.intValue ?? input?.int_value ?? input?.doubleValue ?? input?.double_value ?? input?.boolValue ?? input?.bool_value ?? input;
    if (value && typeof value === "object" && (value.arrayValue || value.array_value)) {
      const values = value.arrayValue?.values || value.array_value?.values || [];
      return values.map(unwrapAttributeValue);
    }
    if (value && typeof value === "object" && (value.kvlistValue || value.kvlist_value)) {
      return normalizeAttributes(value.kvlistValue?.values || value.kvlist_value?.values || []);
    }
    return value;
  }

  function normalizeAttributes(input) {
    if (!input) return {};
    const out = {};
    if (Array.isArray(input)) {
      for (const item of input.slice(0, MAX_ATTRIBUTES)) {
        const key = String(item?.key ?? item?.name ?? '').trim();
        if (!key) continue;
        const value = unwrapAttributeValue(item?.value ?? item?.val ?? '');
        out[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
      return out;
    }
    if (typeof input === 'object') {
      for (const [key, rawValue] of Object.entries(input).slice(0, MAX_ATTRIBUTES)) {
        const value = unwrapAttributeValue(rawValue);
        out[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    }
    return out;
  }

  function normalizeEvent(event, index = 0) {
    if (!event || typeof event !== 'object') return null;
    const name = String(event.name ?? event.event?.name ?? event.message ?? `event-${index + 1}`).slice(0, 240);
    const rawTime = event.timeUnixNano ?? event.time_unix_nano ?? event.timestamp ?? event.time ?? event.observedTimeUnixNano ?? event.observed_time_unix_nano;
    const ms = timestampMs(rawTime);
    return {
      name,
      timestampMs: Number.isFinite(ms) ? ms : null,
      timestamp: Number.isFinite(ms) ? new Date(ms).toISOString() : (rawTime ? String(rawTime).slice(0, 96) : ''),
      attributes: normalizeAttributes(event.attributes ?? event.attrs ?? event.fields),
      droppedAttributesCount: Number(event.droppedAttributesCount ?? event.dropped_attributes_count ?? 0) || 0
    };
  }

  function extract(raw) {
    if (!raw || typeof raw !== 'object') return [];
    const candidates = [
      valueAt(raw, 'events'),
      valueAt(raw, 'span.events'),
      valueAt(raw, 'otel.events'),
      valueAt(raw, 'otel.span.events')
    ];
    const list = candidates.find(Array.isArray) || [];
    return list.slice(0, MAX_EVENTS_PER_SPAN).map(normalizeEvent).filter(Boolean);
  }

  function attrValue(attributes, key) {
    const map = normalizeAttributes(attributes);
    return map[key] || "";
  }

  function otlpTime(value) {
    const ms = timestampMs(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
  }

  function flattenOtlp(raw) {
    if (!raw || typeof raw !== "object") return [];
    const resourceSpans = raw.resourceSpans || raw.resource_spans;
    if (!Array.isArray(resourceSpans)) return [];
    const out = [];
    for (const resourceSpan of resourceSpans) {
      const resourceAttrs = normalizeAttributes(resourceSpan?.resource?.attributes);
      const service = resourceAttrs["service.name"] || resourceAttrs.service || "otel";
      const environment = resourceAttrs["deployment.environment.name"] || resourceAttrs["deployment.environment"] || "";
      const namespace = resourceAttrs["service.namespace"] || resourceAttrs["k8s.namespace.name"] || "";
      const scopeSpans = resourceSpan?.scopeSpans || resourceSpan?.scope_spans || resourceSpan?.instrumentationLibrarySpans || [];
      const resourceSchemaUrl = resourceSpan?.schemaUrl || resourceSpan?.schema_url || "";
      for (const scopeSpan of scopeSpans) {
        const scopeObject = scopeSpan?.scope || scopeSpan?.instrumentationLibrary || {};
        const scopeName = scopeObject?.name || "";
        const scopeVersion = scopeObject?.version || "";
        const scopeSchemaUrl = scopeSpan?.schemaUrl || scopeSpan?.schema_url || "";
        const spans = scopeSpan?.spans || [];
        for (const span of spans) {
          const startRaw = span.startTimeUnixNano ?? span.start_time_unix_nano ?? span.startTime ?? span.start_time;
          const endRaw = span.endTimeUnixNano ?? span.end_time_unix_nano ?? span.endTime ?? span.end_time;
          const start = timestampMs(startRaw);
          const end = timestampMs(endRaw);
          const durationMs = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
          const statusCode = span?.status?.code ?? span?.status?.statusCode ?? span?.status?.status_code;
          const isError = statusCode === 2 || String(statusCode || "").toUpperCase().includes("ERROR");
          const attributes = normalizeAttributes(span.attributes);
          const eventList = Array.isArray(span.events) ? span.events : [];
          out.push({
            timestamp: Number.isFinite(start) ? new Date(start).toISOString() : otlpTime(startRaw),
            level: isError ? "ERROR" : "INFO",
            service,
            message: span?.status?.message || span.name || "OpenTelemetry span",
            name: span.name || "span",
            trace_id: span.traceId ?? span.trace_id ?? "",
            span_id: span.spanId ?? span.span_id ?? "",
            parent_span_id: span.parentSpanId ?? span.parent_span_id ?? "",
            duration_ms: durationMs,
            environment,
            namespace,
            scope: scopeName,
            attributes,
            events: eventList,
            otel: {
              kind: span.kind ?? "",
              status: span.status || {},
              resource: resourceAttrs,
              resourceSchemaUrl,
              scope: { name: scopeName, version: scopeVersion, schemaUrl: scopeSchemaUrl }
            }
          });
        }
      }
    }
    return out;
  }

  function collect(entries, options = {}) {
    const maxEvents = Math.max(50, Math.min(5000, Number(options.maxEvents) || 1000));
    const events = [];
    for (const entry of entries || []) {
      const spanEvents = Array.isArray(entry?.traceMeta?.events) ? entry.traceMeta.events : [];
      for (const event of spanEvents) {
        events.push({
          entryId: entry.id,
          globalIndex: Number.isInteger(entry.globalIndex) ? entry.globalIndex : null,
          span: entry?.correlations?.span || '',
          trace: entry?.correlations?.trace || '',
          service: entry.service || '—',
          level: entry.level || 'UNKNOWN',
          name: event.name || 'event',
          timestampMs: Number.isFinite(event.timestampMs) ? event.timestampMs : null,
          timestamp: event.timestamp || '',
          attributes: event.attributes || {},
          droppedAttributesCount: Number(event.droppedAttributesCount) || 0
        });
        if (events.length >= maxEvents) break;
      }
      if (events.length >= maxEvents) break;
    }
    events.sort((a, b) => {
      if (a.timestampMs === null && b.timestampMs === null) return 0;
      if (a.timestampMs === null) return 1;
      if (b.timestampMs === null) return -1;
      return a.timestampMs - b.timestampMs;
    });
    return events;
  }

  root.SignalDockSpanEvents = { MAX_EVENTS_PER_SPAN, extract, collect, normalizeEvent, timestampMs, normalizeAttributes, flattenOtlp };
}(typeof self !== 'undefined' ? self : window));
