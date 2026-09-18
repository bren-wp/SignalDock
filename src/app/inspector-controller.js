(function (root) {
  "use strict";

  const VERSION = 1;
  const INSPECTOR_TABS = Object.freeze(["details", "context", "correlations", "trace", "raw", "json"]);

  function create(options = {}) {
    const state = options.state;
    const el = options.el || {};
    const getUtils = options.getUtils || (() => root.SignalDockUtils);
    const getTraceAnalyzer = options.getTraceAnalyzer || (() => root.SignalDockTraceAnalysis);
    const toast = options.toast || (() => {});
    const renderTable = options.renderTable || (() => {});
    const requestCorrelations = options.requestCorrelations || (() => {});
    const requestTrace = options.requestTrace || (() => {});
    const applyFilters = options.applyFilters || (() => {});
    const filterByServiceValue = options.filterByServiceValue || (() => {});
    const quoteIfNeeded = options.quoteIfNeeded || ((value) => String(value || ""));
    const scheduleViewAutosave = options.scheduleViewAutosave || (() => {});
    const document = el.inspector?.ownerDocument || root.document;
    let bound = false;
    let tabButtons = [];

    if (!state || !Array.isArray(state.entries)) throw new Error("Inspector controller requires application state.");
    if (!document) throw new Error("Inspector controller requires a document context.");

  function selectedEntry() {
      if (!state.selectedId) return null;
      const match = /^sd-(\d+)$/.exec(state.selectedId);
      if (match) return state.entries[Number(match[1])] || null;
      return state.entries.find((entry) => entry.id === state.selectedId) || null;
    }

    function selectEntry(id) {
      state.selectedId = id;
      state.correlatedIndexes = [];
      state.correlationEngine = "loading";
      state.traceIndexes = [];
      state.traceEngine = "loading";
      renderTable();
      renderInspector();
      const entry = selectedEntry();
      requestCorrelations(entry);
      requestTrace(entry);
      scheduleViewAutosave();
    }

    function closeInspector() {
      state.selectedId = null;
      state.correlatedIndexes = [];
      state.correlationEngine = "idle";
      state.traceIndexes = [];
      state.traceEngine = "idle";
      renderTable();
      renderInspector();
      scheduleViewAutosave();
    }

    function renderInspector() {
      const entry = selectedEntry();
      el.inspector.classList.toggle("has-selection", Boolean(entry));
      el.inspectorEmpty.hidden = Boolean(entry);
      el.inspectorContent.hidden = !entry;
      if (!entry) return;

      el.inspectorLevel.className = `level-badge level-${entry.level}`;
      el.inspectorLevel.textContent = entry.level;
      el.inspectorTime.textContent = getUtils().formatTime(entry.timestamp);
      el.inspectorMessage.textContent = entry.message || "(empty message)";
      const metaPills = [
        metaPill("source", getUtils().shortSource(entry.source)),
        metaPill("service", entry.service),
        metaPill("entry", String(entry.index + 1))
      ];
      if (entry.exceptionFingerprint) metaPills.push(metaPill("exception", entry.exceptionFingerprint));
      el.inspectorMeta.replaceChildren(...metaPills);

      renderDetailsPane(entry);
      renderContextPane(entry);
      renderCorrelationsPane(entry);
      renderTracePane(entry);
      el.rawPane.textContent = getUtils().safeStringify(entry.raw);
      el.jsonPane.textContent = getUtils().safeStringify({
        timestamp: entry.timestamp,
        level: entry.level,
        service: entry.service,
        source: entry.source,
        message: entry.message,
        correlations: entry.correlations || {},
        traceMeta: entry.traceMeta || {},
        dimensions: entry.dimensions || {},
        exceptionFingerprint: entry.exceptionFingerprint || "",
        raw: entry.raw
      });
      el.filterByServiceButton.disabled = !entry.service || entry.service === "—";
      if (el.addEvidenceButton) el.addEvidenceButton.disabled = Boolean(state.investigation?.items?.some((item) => item.entryId === entry.id));
      renderInspectorTab();
    }

    function metaPill(label, value) {
      const pill = document.createElement("span");
      pill.className = "meta-pill";
      const b = document.createElement("b"); b.textContent = `${label}:`;
      pill.append(b, document.createTextNode(` ${value || "—"}`));
      return pill;
    }

    function renderDetailsPane(entry) {
      const dl = document.createElement("dl");
      dl.className = "detail-list";
      const normalized = [
        ["Timestamp", entry.timestamp || "—"],
        ["Level", entry.level],
        ["Service", entry.service],
        ["Source", entry.source],
        ["Index", entry.index + 1],
        ...(entry.dimensions?.environment ? [["Environment", entry.dimensions.environment]] : []),
        ...(entry.dimensions?.namespace ? [["Namespace", entry.dimensions.namespace]] : []),
        ...Object.entries(entry.correlations || {}).map(([kind, value]) => [`${kind} ID`, value])
      ];
      normalized.forEach(([key, value]) => dl.appendChild(detailRow(key, value)));

      if (entry.raw && typeof entry.raw === "object" && !Array.isArray(entry.raw)) {
        flattenObject(entry.raw).slice(0, 36).forEach(([key, value]) => {
          if (["message", "msg", "level", "timestamp", "time"].includes(key.toLowerCase())) return;
          dl.appendChild(detailRow(key, compactValue(value)));
        });
      }
      el.detailsPane.replaceChildren(dl);
    }

    function flattenObject(value, prefix = "", depth = 0, output = []) {
      if (!value || typeof value !== "object" || depth > 2) return output;
      for (const [key, item] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (item && typeof item === "object" && !Array.isArray(item)) flattenObject(item, path, depth + 1, output);
        else output.push([path, item]);
        if (output.length >= 60) break;
      }
      return output;
    }

    function renderContextPane(entry) {
      const wrap = document.createElement("div");
      wrap.className = "context-view";
      const nearby = nearbySourceEntries(entry, 3);

      const nearbyTitle = document.createElement("div");
      nearbyTitle.className = "context-title";
      nearbyTitle.textContent = "Nearby entries";
      wrap.appendChild(nearbyTitle);
      if (!nearby.length) {
        const empty = document.createElement("p"); empty.className = "context-empty"; empty.textContent = "No nearby entries available."; wrap.appendChild(empty);
      } else {
        nearby.forEach((item) => wrap.appendChild(contextRow(item, item.id === entry.id)));
      }

      const related = nearbyServiceEntries(entry, 5);
      const relatedTitle = document.createElement("div");
      relatedTitle.className = "context-title context-title--spaced";
      relatedTitle.textContent = `Related service · ${entry.service}`;
      wrap.appendChild(relatedTitle);
      if (!related.length) {
        const empty = document.createElement("p"); empty.className = "context-empty"; empty.textContent = "No related service entries found."; wrap.appendChild(empty);
      } else related.forEach((item) => wrap.appendChild(contextRow(item, false)));

      el.contextPane.replaceChildren(wrap);
    }

    function nearbySourceEntries(entry, radius) {
      const index = Number.isFinite(entry.globalIndex) ? entry.globalIndex : state.entries.indexOf(entry);
      if (index < 0) return [entry];
      const before = [];
      const after = [];
      for (let i = index - 1; i >= 0 && before.length < radius; i -= 1) {
        const candidate = state.entries[i];
        if (candidate.source !== entry.source) break;
        before.push(candidate);
      }
      for (let i = index + 1; i < state.entries.length && after.length < radius; i += 1) {
        const candidate = state.entries[i];
        if (candidate.source !== entry.source) break;
        after.push(candidate);
      }
      return before.reverse().concat(entry, after);
    }

    function nearbyServiceEntries(entry, limit) {
      if (!entry.service || entry.service === "—") return [];
      const origin = Number.isFinite(entry.globalIndex) ? entry.globalIndex : state.entries.indexOf(entry);
      if (origin < 0) return [];
      const matches = [];
      const maxDistance = Math.min(state.entries.length, 50000);
      for (let distance = 1; distance < maxDistance && matches.length < limit; distance += 1) {
        const left = origin - distance;
        const right = origin + distance;
        if (left >= 0 && state.entries[left].service === entry.service) matches.push(state.entries[left]);
        if (matches.length >= limit) break;
        if (right < state.entries.length && state.entries[right].service === entry.service) matches.push(state.entries[right]);
        if (left < 0 && right >= state.entries.length) break;
      }
      return matches.sort((a, b) => timeDistance(a, entry) - timeDistance(b, entry));
    }

    function renderCorrelationsPane(entry) {
      if (!el.correlationsPane) return;
      const wrap = document.createElement("div");
      wrap.className = "correlation-view";
      if (!entry) { el.correlationsPane.replaceChildren(wrap); return; }

      const correlations = Object.entries(entry.correlations || {});
      const title = document.createElement("div");
      title.className = "context-title";
      title.textContent = "Detected identifiers";
      wrap.appendChild(title);

      if (!correlations.length) {
        const empty = document.createElement("p");
        empty.className = "context-empty";
        empty.textContent = "No trace, request, job, session or user identifiers were detected in this entry.";
        wrap.appendChild(empty);
        el.correlationsPane.replaceChildren(wrap);
        return;
      }

      const chips = document.createElement("div");
      chips.className = "correlation-chips";
      correlations.forEach(([kind, value]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "correlation-chip";
        button.dataset.correlationFilter = kind;
        button.dataset.correlationValue = value;
        const strong = document.createElement("strong"); strong.textContent = kind;
        const span = document.createElement("span"); span.textContent = value; span.title = value;
        button.append(strong, span);
        chips.appendChild(button);
      });
      wrap.appendChild(chips);

      const relatedTitle = document.createElement("div");
      relatedTitle.className = "context-title context-title--spaced";
      const related = state.correlatedIndexes.map((index) => state.entries[index]).filter((item) => item && item.id !== entry.id);
      relatedTitle.textContent = `Correlated entries · ${related.length}${state.correlatedIndexes.length >= 200 ? "+" : ""}`;
      wrap.appendChild(relatedTitle);

      if (related.length) {
        const matchSummary = document.createElement("div");
        matchSummary.className = "correlation-match-summary";
        correlations.forEach(([kind, value]) => {
          const count = related.reduce((sum, item) => sum + (item.correlations?.[kind] === value ? 1 : 0), 0);
          if (!count) return;
          const badge = document.createElement("span");
          const strong = document.createElement("strong"); strong.textContent = kind;
          const amount = document.createElement("em"); amount.textContent = `${count} match${count === 1 ? "" : "es"}`;
          badge.append(strong, amount);
          matchSummary.appendChild(badge);
        });
        if (matchSummary.childElementCount) wrap.appendChild(matchSummary);
      }

      if (state.correlationEngine.includes("searching")) {
        const pending = document.createElement("p"); pending.className = "context-empty"; pending.textContent = "Searching correlations in the background…"; wrap.appendChild(pending);
      } else if (!related.length) {
        const empty = document.createElement("p"); empty.className = "context-empty"; empty.textContent = "No other entries share these identifiers."; wrap.appendChild(empty);
      } else {
        related.slice(0, 60).forEach((item) => wrap.appendChild(contextRow(item, false)));
      }

      const meta = document.createElement("p");
      meta.className = "correlation-meta";
      meta.textContent = `Correlation engine: ${state.correlationEngine}`;
      wrap.appendChild(meta);
      el.correlationsPane.replaceChildren(wrap);
    }

    function renderTracePane(entry) {
      if (!el.tracePane) return;
      const wrap = document.createElement("div");
      wrap.className = "trace-view";
      const traceId = entry?.correlations?.trace;
      if (!entry || !traceId) {
        const empty = document.createElement("div");
        empty.className = "trace-empty";
        const strong = document.createElement("strong"); strong.textContent = "No trace detected";
        const text = document.createElement("p"); text.textContent = "Trace visualization appears when entries contain a trace ID. Span and parent-span IDs improve the waterfall hierarchy.";
        empty.append(strong, text);
        wrap.appendChild(empty);
        el.tracePane.replaceChildren(wrap);
        return;
      }

      const indexes = Array.from(new Set([entry.globalIndex, ...state.traceIndexes])).filter((index) => Number.isInteger(index));
      const traceEntries = indexes.map((index) => state.entries[index]).filter((item) => item && item.correlations?.trace === traceId);
      traceEntries.sort((a, b) => {
        const at = Number.isFinite(a.timestampMs) ? a.timestampMs : Number.MAX_SAFE_INTEGER;
        const bt = Number.isFinite(b.timestampMs) ? b.timestampMs : Number.MAX_SAFE_INTEGER;
        return at - bt || a.globalIndex - b.globalIndex;
      });

      const header = document.createElement("div");
      header.className = "trace-summary";
      const title = document.createElement("div");
      const eyebrow = document.createElement("span"); eyebrow.textContent = "TRACE";
      const code = document.createElement("code"); code.textContent = traceId; code.title = traceId;
      title.append(eyebrow, code);
      const stats = document.createElement("div");
      const services = new Set(traceEntries.map((item) => item.service).filter((value) => value && value !== "—"));
      const errors = traceEntries.filter((item) => item.level === "ERROR" || item.level === "FATAL").length;
      stats.textContent = `${traceEntries.length.toLocaleString()} entries · ${services.size} services · ${errors} errors`;
      header.append(title, stats);
      wrap.appendChild(header);

      const traceInsights = root.SignalDockTraceInsights?.analyze?.(traceEntries) || null;
      if (traceInsights?.spans) {
        const insightCard = document.createElement("section"); insightCard.className = "trace-insights-card";
        const insightHead = document.createElement("div"); const insightTitle = document.createElement("strong"); insightTitle.textContent = "TRACE QUALITY"; const insightMeta = document.createElement("span"); insightMeta.textContent = `${traceInsights.spans} spans · ${traceInsights.events} log events`; insightHead.append(insightTitle, insightMeta);
        const insightGrid = document.createElement("div"); insightGrid.className = "trace-insights-grid";
        [["Parent coverage", `${Math.round(traceInsights.parentCoverage * 100)}%`], ["Root spans", traceInsights.roots], ["Orphan spans", traceInsights.orphans], ["Error spans", traceInsights.errorSpans], ["Timed spans", traceInsights.timedSpans], ["Span events", traceInsights.spanEvents], ["Instrumentation scopes", traceInsights.scopes.length], ["Resource sets", traceInsights.resourceSets]].forEach(([label, value]) => { const item = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = String(value); const span = document.createElement("span"); span.textContent = label; item.append(strong, span); insightGrid.appendChild(item); });
        const insightNote = document.createElement("p"); insightNote.textContent = traceInsights.orphans ? `${traceInsights.orphans} span${traceInsights.orphans === 1 ? " has" : "s have"} a parent ID that is not present in the loaded trace context.` : "All parent references visible in this trace resolve to loaded spans.";
        insightCard.append(insightHead, insightGrid, insightNote); wrap.appendChild(insightCard);
      }

      const otel = entry.traceMeta?.otel;
      if (otel && (Object.keys(otel.resource || {}).length || Object.keys(otel.scope || {}).length || Object.keys(otel.attributes || {}).length || otel.kind || Object.keys(otel.status || {}).length)) {
        const card = document.createElement("section"); card.className = "otel-context-card";
        const head = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = "OTEL RESOURCE & SCOPE"; const meta = document.createElement("span"); meta.textContent = [otel.scope?.name, otel.scope?.version].filter(Boolean).join(" · ") || "OpenTelemetry context"; head.append(strong, meta); card.appendChild(head);
        const grid = document.createElement("div"); grid.className = "otel-context-grid";
        const rows = [];
        if (otel.kind !== "" && otel.kind !== undefined) rows.push(["Span kind", String(otel.kind)]);
        if (otel.resourceSchemaUrl) rows.push(["Resource schema", otel.resourceSchemaUrl]);
        if (otel.scope?.name) rows.push(["Scope", otel.scope.name]);
        if (otel.scope?.version) rows.push(["Scope version", otel.scope.version]);
        if (otel.scope?.schemaUrl) rows.push(["Scope schema", otel.scope.schemaUrl]);
        Object.entries(otel.resource || {}).slice(0, 10).forEach(([key, value]) => rows.push([`resource.${key}`, String(value)]));
        Object.entries(otel.attributes || {}).slice(0, 10).forEach(([key, value]) => rows.push([`span.${key}`, String(value)]));
        rows.slice(0, 20).forEach(([label, value]) => { const item = document.createElement("div"); const name = document.createElement("span"); name.textContent = label; const code = document.createElement("code"); code.textContent = value; code.title = value; item.append(name, code); grid.appendChild(item); });
        card.appendChild(grid); wrap.appendChild(card);
      }

      if (traceEntries.length) {
        const serviceSummary = document.createElement("div");
        serviceSummary.className = "trace-services";
        const serviceStats = new Map();
        traceEntries.forEach((item) => {
          const key = item.service && item.service !== "—" ? item.service : getUtils().shortSource(item.source);
          const current = serviceStats.get(key) || { count: 0, errors: 0, duration: 0 };
          current.count += 1;
          if (item.level === "ERROR" || item.level === "FATAL") current.errors += 1;
          if (Number.isFinite(item.traceMeta?.durationMs)) current.duration += item.traceMeta.durationMs;
          serviceStats.set(key, current);
        });
        [...serviceStats.entries()]
          .sort((a, b) => b[1].count - a[1].count || b[1].errors - a[1].errors)
          .slice(0, 8)
          .forEach(([service, summary]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `trace-service${summary.errors ? " has-errors" : ""}`;
            button.dataset.traceService = service;
            const name = document.createElement("strong"); name.textContent = service; name.title = service;
            const meta = document.createElement("span");
            meta.textContent = `${summary.count} entries${summary.errors ? ` · ${summary.errors} errors` : ""}${summary.duration ? ` · ${formatDuration(summary.duration)}` : ""}`;
            button.append(name, meta);
            serviceSummary.appendChild(button);
          });
        if (serviceSummary.childElementCount) wrap.appendChild(serviceSummary);
      }

      if (state.traceEngine.includes("searching")) {
        const pending = document.createElement("p"); pending.className = "context-empty"; pending.textContent = "Building trace view in the background…"; wrap.appendChild(pending);
        el.tracePane.replaceChildren(wrap);
        return;
      }

      if (!traceEntries.length) {
        const empty = document.createElement("p"); empty.className = "context-empty"; empty.textContent = "No matching entries were found for this trace."; wrap.appendChild(empty);
        el.tracePane.replaceChildren(wrap);
        return;
      }

      const critical = getTraceAnalyzer()?.analyze?.(traceEntries) || null;
      const criticalIds = new Set((critical?.chain || []).map((item) => item.id));
      if (critical?.available) {
        const card = document.createElement("section");
        card.className = "critical-path-card";
        const head = document.createElement("div");
        const label = document.createElement("span"); label.textContent = "CRITICAL CHAIN";
        const method = document.createElement("em"); method.textContent = critical.completeParents ? "explicit span tree" : "partial span tree";
        head.append(label, method);
        const metrics = document.createElement("div"); metrics.className = "critical-path-metrics";
        [["Trace latency", formatDuration(critical.latencyMs)], ["Chain", `${critical.chain.length} span${critical.chain.length === 1 ? "" : "s"}`], ["Parent coverage", `${Math.round(critical.coverage * 100)}%`], ["Bottleneck", critical.bottleneck ? `${critical.bottleneck.service || "—"} · ${formatDuration(critical.bottleneck.traceMeta?.durationMs)}` : "—"]].forEach(([name, value]) => {
          const item = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = value; const span = document.createElement("span"); span.textContent = name; item.append(strong, span); metrics.appendChild(item);
        });
        const note = document.createElement("p"); note.textContent = critical.note;
        card.append(head, metrics, note);
        wrap.appendChild(card);
      }

      const flame = root.SignalDockTraceFlame?.layout?.(traceEntries, { maxBars: 420 });
      if (flame?.available) {
        const flameCard = document.createElement("section");
        flameCard.className = "trace-flame-card";
        const flameHead = document.createElement("div");
        const flameTitle = document.createElement("strong"); flameTitle.textContent = "SPAN FLAME";
        const flameMeta = document.createElement("span"); flameMeta.textContent = `${flame.bars.length} timed spans · ${formatDuration(flame.totalMs)}${flame.omitted ? ` · ${flame.omitted} omitted` : ""}`;
        flameHead.append(flameTitle, flameMeta);
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "trace-flame");
        const laneHeight = 15;
        const chartHeight = Math.max(24, (flame.maxDepth + 1) * laneHeight + 8);
        svg.setAttribute("viewBox", `0 0 1000 ${chartHeight}`);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "Span flame chart derived from explicit trace timing metadata");
        flame.bars.forEach((bar) => {
          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x", String(bar.startPct * 10));
          rect.setAttribute("y", String(4 + bar.depth * laneHeight));
          rect.setAttribute("width", String(Math.max(2, bar.widthPct * 10)));
          rect.setAttribute("height", "11");
          rect.setAttribute("rx", "2");
          rect.setAttribute("class", `trace-flame-bar trace-flame-bar--${String(bar.level || "unknown").toLowerCase()}`);
          rect.dataset.traceEntryId = bar.id;
          const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
          title.textContent = `${bar.service} · ${bar.name} · ${formatDuration(bar.durationMs)}`;
          rect.appendChild(title);
          svg.appendChild(rect);
        });
        const flameNote = document.createElement("p"); flameNote.textContent = "Uses only spans with explicit timestamps and durations; events without duration are excluded.";
        flameCard.append(flameHead, svg, flameNote);
        wrap.appendChild(flameCard);
      }

      const spanEvents = root.SignalDockSpanEvents?.collect?.(traceEntries, { maxEvents: 500 }) || [];
      if (spanEvents.length) {
        const eventsCard = document.createElement("section"); eventsCard.className = "trace-events-card";
        const eventsHead = document.createElement("div"); const eventsTitle = document.createElement("strong"); eventsTitle.textContent = "SPAN EVENTS"; const eventsMeta = document.createElement("span"); eventsMeta.textContent = `${spanEvents.length.toLocaleString()} event${spanEvents.length === 1 ? "" : "s"} with OpenTelemetry-style metadata`; eventsHead.append(eventsTitle, eventsMeta); eventsCard.appendChild(eventsHead);
        const eventsList = document.createElement("div"); eventsList.className = "trace-events-list";
        spanEvents.slice(0, 120).forEach((spanEvent) => {
          const button = document.createElement("button"); button.type = "button"; button.className = "trace-event"; if (spanEvent.entryId) button.dataset.traceEntryId = spanEvent.entryId;
          const time = document.createElement("time"); time.textContent = spanEvent.timestamp ? getUtils().formatTime(spanEvent.timestamp) : "event";
          const copy = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = spanEvent.name; const meta = document.createElement("span"); const attrCount = Object.keys(spanEvent.attributes || {}).length; meta.textContent = `${spanEvent.service || "—"}${spanEvent.span ? ` · span ${String(spanEvent.span).slice(0, 12)}` : ""}${attrCount ? ` · ${attrCount} attrs` : ""}`; copy.append(strong, meta);
          if (attrCount) { const attrs = document.createElement("code"); attrs.textContent = Object.entries(spanEvent.attributes).slice(0, 4).map(([key, value]) => `${key}=${value}`).join("  "); copy.appendChild(attrs); }
          button.append(time, copy); eventsList.appendChild(button);
        });
        eventsCard.appendChild(eventsList);
        if (spanEvents.length > 120) { const note = document.createElement("p"); note.textContent = `Showing 120 of ${spanEvents.length.toLocaleString()} span events.`; eventsCard.appendChild(note); }
        wrap.appendChild(eventsCard);
      }

      const timed = traceEntries.filter((item) => Number.isFinite(item.timestampMs));
      const minStart = timed.length ? Math.min(...timed.map((item) => item.timestampMs)) : 0;
      const maxEnd = timed.length ? Math.max(...timed.map((item) => item.timestampMs + (Number.isFinite(item.traceMeta?.durationMs) ? item.traceMeta.durationMs : 0))) : 1;
      const totalSpan = Math.max(1, maxEnd - minStart);
      const bySpan = new Map(traceEntries.filter((item) => item.correlations?.span).map((item) => [item.correlations.span, item]));

      const list = document.createElement("div");
      list.className = "trace-list";
      traceEntries.slice(0, 250).forEach((item) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = `trace-row${item.id === entry.id ? " is-current" : ""}${criticalIds.has(item.id) ? " is-critical" : ""}`;
        row.dataset.traceEntryId = item.id;
        const depth = traceDepth(item, bySpan);
        row.classList.add(`trace-depth-${Math.min(depth, 4)}`);

        const label = document.createElement("div");
        label.className = "trace-row__label";
        const service = document.createElement("strong"); service.textContent = item.service || "—";
        const name = document.createElement("span"); name.textContent = item.traceMeta?.name || item.message || "span"; name.title = name.textContent;
        label.append(service, name);

        const meta = document.createElement("div");
        meta.className = "trace-row__meta";
        const level = document.createElement("span"); level.className = `context-level level-${item.level}`; level.textContent = item.level;
        const duration = document.createElement("span"); duration.textContent = Number.isFinite(item.traceMeta?.durationMs) ? `${formatDuration(item.traceMeta.durationMs)}` : "event";
        meta.append(level, duration);

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "trace-waterfall");
        svg.setAttribute("viewBox", "0 0 1000 16");
        svg.setAttribute("preserveAspectRatio", "none");
        const track = document.createElementNS("http://www.w3.org/2000/svg", "line");
        track.setAttribute("x1", "0"); track.setAttribute("x2", "1000"); track.setAttribute("y1", "8"); track.setAttribute("y2", "8"); track.setAttribute("class", "trace-track");
        svg.appendChild(track);
        if (Number.isFinite(item.timestampMs)) {
          const start = ((item.timestampMs - minStart) / totalSpan) * 1000;
          const durationMs = Number.isFinite(item.traceMeta?.durationMs) ? item.traceMeta.durationMs : Math.max(totalSpan / 500, 1);
          const width = Math.max(3, Math.min(1000 - start, (durationMs / totalSpan) * 1000));
          const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          bar.setAttribute("x", String(Math.max(0, start)));
          bar.setAttribute("y", "4");
          bar.setAttribute("width", String(width));
          bar.setAttribute("height", "8");
          bar.setAttribute("rx", "3");
          bar.setAttribute("class", `trace-bar trace-bar--${item.level.toLowerCase()}`);
          svg.appendChild(bar);
        }
        row.append(label, meta, svg);
        list.appendChild(row);
      });
      wrap.appendChild(list);
      if (traceEntries.length > 250) {
        const note = document.createElement("p"); note.className = "trace-note"; note.textContent = `Showing the first 250 of ${traceEntries.length.toLocaleString()} trace entries.`; wrap.appendChild(note);
      }
      const engineMeta = document.createElement("p"); engineMeta.className = "correlation-meta"; engineMeta.textContent = `Trace engine: ${state.traceEngine}`; wrap.appendChild(engineMeta);
      el.tracePane.replaceChildren(wrap);
    }

    function traceDepth(entry, bySpan) {
      let depth = 0;
      let parent = entry.traceMeta?.parentSpan;
      const seen = new Set();
      while (parent && bySpan.has(parent) && depth < 8 && !seen.has(parent)) {
        seen.add(parent);
        depth += 1;
        parent = bySpan.get(parent)?.traceMeta?.parentSpan;
      }
      return depth;
    }

    function formatDuration(value) {
      if (value === null || value === undefined || value === "") return "—";
      const ms = Number(value);
      if (!Number.isFinite(ms)) return "—";
      if (ms < 1) return `${Math.round(ms * 1000)} µs`;
      if (ms < 1000) return `${ms < 10 ? ms.toFixed(2) : ms.toFixed(1)} ms`;
      return `${(ms / 1000).toFixed(2)} s`;
    }

    function filterByCorrelation(kind, value) {
      if (!kind || !value) return;
      const token = `${kind}:${quoteIfNeeded(value)}`;
      const query = el.queryInput.value.trim();
      el.queryInput.value = `${query}${query ? " " : ""}${token}`;
      applyFilters(true);
      toast(`Filtering by ${kind} identifier.`);
    }

    function timeDistance(a, b) {
      if (!Number.isFinite(a.timestampMs) || !Number.isFinite(b.timestampMs)) return Math.abs(a.index - b.index);
      return Math.abs(a.timestampMs - b.timestampMs);
    }

    function contextRow(entry, current) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `context-row${current ? " is-current" : ""}`;
      button.dataset.contextEntryId = entry.id;
      const time = document.createElement("time"); time.textContent = getUtils().formatTime(entry.timestamp).replace(/^\d{4}-\d{2}-\d{2}\s/, "");
      const level = document.createElement("span"); level.className = `context-level level-${entry.level}`; level.textContent = entry.level;
      const message = document.createElement("span"); message.textContent = entry.message || "(empty message)";
      button.append(time, level, message);
      return button;
    }

    function detailRow(key, value) {
      const wrap = document.createElement("div"); wrap.className = "detail-row";
      const dt = document.createElement("dt"); dt.textContent = key;
      const dd = document.createElement("dd"); dd.textContent = String(value ?? "—");
      wrap.append(dt, dd);
      return wrap;
    }

    function compactValue(value) {
      if (value === null || value === undefined) return "—";
      if (typeof value === "object") return getUtils().safeStringify(value, false).slice(0, 500);
      return String(value).slice(0, 500);
    }

    function selectInspectorTab(tab, focus = false) {
      const available = ["details", "context", "correlations", "trace", "raw", "json"];
      if (!available.includes(tab)) return;
      state.inspectorTab = tab;
      renderInspectorTab();
      scheduleViewAutosave();
      if (focus) document.querySelector(`[data-inspector-tab="${tab}"]`)?.focus();
    }

    function onInspectorTabKeydown(event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = [...document.querySelectorAll("[data-inspector-tab]")];
      if (!tabs.length) return;
      const current = Math.max(0, tabs.indexOf(event.currentTarget));
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      selectInspectorTab(tabs[next].dataset.inspectorTab, true);
    }

    function renderInspectorTab() {
      document.querySelectorAll("[data-inspector-tab]").forEach((button) => {
        const active = button.dataset.inspectorTab === state.inspectorTab;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
        button.tabIndex = active ? 0 : -1;
      });
      el.detailsPane.hidden = state.inspectorTab !== "details";
      el.contextPane.hidden = state.inspectorTab !== "context";
      el.correlationsPane.hidden = state.inspectorTab !== "correlations";
      el.tracePane.hidden = state.inspectorTab !== "trace";
      el.rawPane.hidden = state.inspectorTab !== "raw";
      el.jsonPane.hidden = state.inspectorTab !== "json";
    }

    async function copySelectedRaw() {
      const entry = selectedEntry();
      if (!entry) return;
      try {
        await getUtils().copyText(getUtils().safeStringify(entry.raw));
        toast("Raw log entry copied.");
      } catch { toast("Could not copy this entry.", "error"); }
    }

    function filterBySelectedSource() {
      const entry = selectedEntry();
      if (!entry) return;
      el.sourceFilter.value = entry.source;
      applyFilters(true);
      toast(`Filtered to ${getUtils().shortSource(entry.source)}.`);
    }

    function filterBySelectedService() {
      const entry = selectedEntry();
      if (!entry || !entry.service || entry.service === "—") return;
      filterByServiceValue(entry.service);
    }

    function onContextClick(event) {
      const row = event.target.closest?.("[data-context-entry-id]");
      if (row) selectEntry(row.dataset.contextEntryId);
    }

    function onCorrelationsClick(event) {
      const row = event.target.closest?.("[data-context-entry-id]");
      if (row) selectEntry(row.dataset.contextEntryId);
      const filter = event.target.closest?.("[data-correlation-filter]");
      if (filter) filterByCorrelation(filter.dataset.correlationFilter, filter.dataset.correlationValue);
    }

    function onTraceClick(event) {
      const service = event.target.closest?.("[data-trace-service]");
      if (service) {
        filterByServiceValue(service.dataset.traceService);
        return;
      }
      const row = event.target.closest?.("[data-trace-entry-id]");
      if (row) selectEntry(row.dataset.traceEntryId);
    }

    function onTabClick(event) {
      selectInspectorTab(event.currentTarget?.dataset?.inspectorTab);
    }

    function bind() {
      if (bound) return;
      bound = true;
      tabButtons = [...document.querySelectorAll("[data-inspector-tab]")];
      tabButtons.forEach((button) => {
        button.addEventListener("click", onTabClick);
        button.addEventListener("keydown", onInspectorTabKeydown);
      });
      el.contextPane?.addEventListener("click", onContextClick);
      el.correlationsPane?.addEventListener("click", onCorrelationsClick);
      el.tracePane?.addEventListener("click", onTraceClick);
      el.closeInspector?.addEventListener("click", closeInspector);
      el.copyButton?.addEventListener("click", copySelectedRaw);
      el.filterBySourceButton?.addEventListener("click", filterBySelectedSource);
      el.filterByServiceButton?.addEventListener("click", filterBySelectedService);
    }

    function destroy() {
      if (!bound) return;
      bound = false;
      tabButtons.forEach((button) => {
        button.removeEventListener("click", onTabClick);
        button.removeEventListener("keydown", onInspectorTabKeydown);
      });
      tabButtons = [];
      el.contextPane?.removeEventListener("click", onContextClick);
      el.correlationsPane?.removeEventListener("click", onCorrelationsClick);
      el.tracePane?.removeEventListener("click", onTraceClick);
      el.closeInspector?.removeEventListener("click", closeInspector);
      el.copyButton?.removeEventListener("click", copySelectedRaw);
      el.filterBySourceButton?.removeEventListener("click", filterBySelectedSource);
      el.filterByServiceButton?.removeEventListener("click", filterBySelectedService);
    }

    return Object.freeze({
      selectedEntry,
      selectEntry,
      close: closeInspector,
      render: renderInspector,
      renderCorrelations: renderCorrelationsPane,
      renderTrace: renderTracePane,
      formatDuration,
      filterByCorrelation,
      selectTab: selectInspectorTab,
      bind,
      destroy
    });
  }

  root.SignalDockInspectorController = Object.freeze({ VERSION, INSPECTOR_TABS, create });
}(typeof self !== "undefined" ? self : window));
