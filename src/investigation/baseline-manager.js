(function (root) {
  "use strict";

  const SCHEMA = "signaldock.baseline";
  const VERSION = 1;
  const MAX_ROWS = 5000;
  const HISTORY_SCHEMA = "signaldock.baseline-history";
  const HISTORY_VERSION = 1;
  const HISTORY_KEY = "signaldock-baselines-v1";
  const MAX_BASELINES = 24;

  function clean(value, max = 240) { return String(value ?? "").trim().slice(0, max); }
  function cleanTags(value) {
    const input = Array.isArray(value) ? value : String(value || "").split(/[;,]/);
    const out = [];
    const seen = new Set();
    for (const value of input) {
      const tag = clean(value, 48).toLowerCase().replace(/\s+/g, "-");
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
      if (out.length >= 20) break;
    }
    return out;
  }

  function cleanSources(value) {
    const input = Array.isArray(value) ? value : [];
    const out = [];
    for (const source of input) {
      const normalized = clean(source, 240);
      if (!normalized) continue;
      out.push(normalized);
      if (out.length >= 500) break;
    }
    return out;
  }
  function percentileSorted(sorted, p) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * p; const lo = Math.floor(pos); const hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function finiteNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function nullableNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function normalizeServiceRow(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    return {
      service: clean(row.service || "—", 160) || "—",
      entries: Math.max(0, finiteNumber(row.entries)),
      errors: Math.max(0, finiteNumber(row.errors)),
      warnings: Math.max(0, finiteNumber(row.warnings)),
      errorRate: Math.max(0, Math.min(1, finiteNumber(row.errorRate))),
      p95Ms: nullableNumber(row.p95Ms)
    };
  }
  function normalizeDependencyRow(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    return {
      from: clean(row.from, 160),
      to: clean(row.to, 160),
      calls: Math.max(0, finiteNumber(row.calls)),
      errors: Math.max(0, finiteNumber(row.errors)),
      errorRate: Math.max(0, Math.min(1, finiteNumber(row.errorRate))),
      p95Ms: nullableNumber(row.p95Ms)
    };
  }
  function normalizeTraceSetRow(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const services = [];
    const seen = new Set();
    for (const value of Array.isArray(row.services) ? row.services : []) {
      const service = clean(value, 160);
      if (!service || seen.has(service)) continue;
      seen.add(service);
      services.push(service);
      if (services.length >= 256) break;
    }
    return {
      signature: clean(row.signature || services.join("→") || "(unknown)", 16384),
      services,
      traces: Math.max(0, finiteNumber(row.traces)),
      errorRate: Math.max(0, Math.min(1, finiteNumber(row.errorRate))),
      medianDurationMs: nullableNumber(row.medianDurationMs),
      p95DurationMs: nullableNumber(row.p95DurationMs),
      medianSpans: nullableNumber(row.medianSpans)
    };
  }
  function normalizeRows(value, normalizer) {
    const out = [];
    for (const row of Array.isArray(value) ? value : []) {
      const normalized = normalizer(row);
      if (normalized) out.push(normalized);
      if (out.length >= MAX_ROWS) break;
    }
    return out;
  }
  function eachSelected(entries, indexes, callback) {
    const source = Array.isArray(entries) ? entries : [];
    if (Array.isArray(indexes)) {
      for (const index of indexes) {
        const entry = source[index];
        if (entry) callback(entry, index);
      }
      return;
    }
    for (let index = 0; index < source.length; index += 1) callback(source[index], index);
  }
  function selectTop(values, limit, compare) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));
    if (!count) return [];
    const heap = [];
    const swap = (a, b) => { const value = heap[a]; heap[a] = heap[b]; heap[b] = value; };
    const siftUp = (index) => {
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (compare(heap[parent], heap[index]) >= 0) break;
        swap(parent, index);
        index = parent;
      }
    };
    const siftDown = (index) => {
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let worst = index;
        if (left < heap.length && compare(heap[left], heap[worst]) > 0) worst = left;
        if (right < heap.length && compare(heap[right], heap[worst]) > 0) worst = right;
        if (worst === index) break;
        swap(index, worst);
        index = worst;
      }
    };
    for (const value of values) {
      if (heap.length < count) {
        heap.push(value);
        siftUp(heap.length - 1);
        continue;
      }
      if (compare(value, heap[0]) >= 0) continue;
      heap[0] = value;
      siftDown(0);
    }
    return heap.sort(compare);
  }
  function selectedCount(entries, indexes) {
    const source = Array.isArray(entries) ? entries : [];
    if (!Array.isArray(indexes)) return source.length;
    let count = 0;
    for (const index of indexes) if (source[index]) count += 1;
    return count;
  }
  function serviceRows(entries, indexes) {
    const map = new Map();
    eachSelected(entries, indexes, (entry) => {
      const service = clean(entry?.service || "—", 160) || "—";
      const row = map.get(service) || { service, entries: 0, errors: 0, warnings: 0, durations: [] };
      row.entries += 1;
      if (entry?.level === "ERROR" || entry?.level === "FATAL") row.errors += 1;
      else if (entry?.level === "WARN") row.warnings += 1;
      const duration = Number(entry?.traceMeta?.durationMs);
      if (Number.isFinite(duration) && duration >= 0) row.durations.push(duration);
      map.set(service, row);
    });
    const retained = selectTop(map.values(), MAX_ROWS, (a, b) => b.entries - a.entries || a.service.localeCompare(b.service));
    return retained.map((row) => {
      row.durations.sort((a, b) => a - b);
      return {
        service: row.service, entries: row.entries, errors: row.errors, warnings: row.warnings,
        errorRate: row.entries ? row.errors / row.entries : 0, p95Ms: percentileSorted(row.durations, .95)
      };
    });
  }
  function dependencyRows(entries, indexes) {
    if (!root.SignalDockServiceMatrix?.build) return [];
    const result = root.SignalDockServiceMatrix.build(entries, indexes);
    return (result?.rows || []).slice(0, MAX_ROWS).map((row) => ({
      from: clean(row.source, 160), to: clean(row.target, 160), calls: Number(row.calls) || 0,
      errors: Number(row.errors) || 0, errorRate: Number(row.errorRate) || 0,
      p95Ms: Number.isFinite(row.p95Ms) ? row.p95Ms : null
    }));
  }
  function traceSets(entries, indexes) {
    if (!root.SignalDockTraceExplorer?.build) return [];
    const traces = root.SignalDockTraceExplorer.build(entries, indexes)?.rows || [];
    const map = new Map();
    for (const trace of traces) {
      const services = [...(trace.services || [])].sort();
      const signature = services.join("→") || "(unknown)";
      const row = map.get(signature) || { signature, services, traces: 0, errors: 0, durations: [], spans: [] };
      row.traces += 1; row.errors += trace.errors > 0 ? 1 : 0;
      if (Number.isFinite(trace.durationMs)) row.durations.push(trace.durationMs);
      if (Number.isFinite(trace.spans)) row.spans.push(trace.spans);
      map.set(signature, row);
    }
    const retained = selectTop(map.values(), MAX_ROWS, (a, b) => b.traces - a.traces || a.signature.localeCompare(b.signature));
    return retained.map((row) => {
      row.durations.sort((a, b) => a - b);
      row.spans.sort((a, b) => a - b);
      return {
        signature: row.signature, services: row.services, traces: row.traces,
        errorRate: row.traces ? row.errors / row.traces : 0,
        medianDurationMs: percentileSorted(row.durations, .5), p95DurationMs: percentileSorted(row.durations, .95),
        medianSpans: percentileSorted(row.spans, .5)
      };
    });
  }
  function snapshot(entries, indexes = null, options = {}) {
    const source = Array.isArray(entries) ? entries : [];
    let min = null; let max = null;
    const sourceNames = new Set();
    eachSelected(source, indexes, (entry) => {
      const timestamp = Number(entry?.timestampMs);
      if (Number.isFinite(timestamp)) {
        min = min === null ? timestamp : Math.min(min, timestamp);
        max = max === null ? timestamp : Math.max(max, timestamp);
      }
      const sourceName = clean(entry?.source, 240);
      if (sourceName) sourceNames.add(sourceName);
    });
    const sources = [...sourceNames].sort().slice(0, 500);
    return {
      schema: SCHEMA, version: VERSION, appVersion: clean(options.appVersion, 32),
      id: clean(options.id, 96) || `baseline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: clean(options.name || "SignalDock baseline", 120), capturedAt: new Date().toISOString(),
      scope: options.scope === "filtered" ? "filtered" : "all", entries: selectedCount(source, indexes), sources,
      timeRange: { startMs: min, endMs: max }, services: serviceRows(source, indexes), dependencies: dependencyRows(source, indexes), traceSets: traceSets(source, indexes)
    };
  }
  function normalize(input) {
    if (!input || typeof input !== "object" || input.schema !== SCHEMA || input.version !== VERSION) throw new Error("Unsupported or invalid SignalDock baseline.");
    return {
      schema: SCHEMA, version: VERSION, appVersion: clean(input.appVersion, 32), id: clean(input.id, 96),
      name: clean(input.name || "SignalDock baseline", 120), capturedAt: clean(input.capturedAt, 64),
      scope: input.scope === "filtered" ? "filtered" : "all", entries: Math.max(0, Number(input.entries) || 0),
      sources: cleanSources(input.sources),
      timeRange: {
        startMs: input.timeRange?.startMs !== null && input.timeRange?.startMs !== undefined && input.timeRange?.startMs !== "" && Number.isFinite(Number(input.timeRange.startMs))
          ? Number(input.timeRange.startMs)
          : null,
        endMs: input.timeRange?.endMs !== null && input.timeRange?.endMs !== undefined && input.timeRange?.endMs !== "" && Number.isFinite(Number(input.timeRange.endMs))
          ? Number(input.timeRange.endMs)
          : null
      },
      services: normalizeRows(input.services, normalizeServiceRow),
      dependencies: normalizeRows(input.dependencies, normalizeDependencyRow),
      traceSets: normalizeRows(input.traceSets, normalizeTraceSetRow)
    };
  }
  function exportJson(value) { return JSON.stringify(normalize(value), null, 2); }
  function parse(text) { return normalize(JSON.parse(String(text || ""))); }
  function compare(current, baseline) {
    const cur = normalize(current); const base = normalize(baseline);
    const join = (a, b, keyFn, mapper) => {
      const am = new Map(a.map((row) => [keyFn(row), row]));
      const bm = new Map(b.map((row) => [keyFn(row), row]));
      const rows = [];
      for (const [key, row] of am) rows.push(mapper(row, bm.get(key), key));
      for (const [key, row] of bm) if (!am.has(key)) rows.push(mapper(undefined, row, key));
      return rows;
    };
    const services = join(cur.services, base.services, (row) => row.service, (c, b, key) => ({
      service: key, currentEntries: c?.entries || 0, baselineEntries: b?.entries || 0,
      entryDelta: (c?.entries || 0) - (b?.entries || 0), currentErrorRate: c?.errorRate || 0,
      baselineErrorRate: b?.errorRate || 0, errorRateDelta: (c?.errorRate || 0) - (b?.errorRate || 0),
      currentP95: c?.p95Ms ?? null, baselineP95: b?.p95Ms ?? null,
      p95Delta: Number.isFinite(c?.p95Ms) && Number.isFinite(b?.p95Ms) ? c.p95Ms - b.p95Ms : null
    })).sort((a, b) => Math.abs(b.errorRateDelta) - Math.abs(a.errorRateDelta) || Math.abs(b.entryDelta) - Math.abs(a.entryDelta));
    const dependencies = join(cur.dependencies, base.dependencies, (row) => `${row.from}\u0000${row.to}`, (c, b, key) => {
      const [from, to] = key.split("\u0000");
      return {
        from, to, currentCalls: c?.calls || 0, baselineCalls: b?.calls || 0,
        callDelta: (c?.calls || 0) - (b?.calls || 0), currentErrorRate: c?.errorRate || 0,
        baselineErrorRate: b?.errorRate || 0, errorRateDelta: (c?.errorRate || 0) - (b?.errorRate || 0),
        currentP95: c?.p95Ms ?? null, baselineP95: b?.p95Ms ?? null,
        p95Delta: Number.isFinite(c?.p95Ms) && Number.isFinite(b?.p95Ms) ? c.p95Ms - b.p95Ms : null
      };
    }).sort((a, b) => Math.abs(b.errorRateDelta) - Math.abs(a.errorRateDelta) || Math.abs(b.callDelta) - Math.abs(a.callDelta));
    let serviceChanges = 0;
    for (const row of services) if (row.entryDelta || row.errorRateDelta || row.p95Delta) serviceChanges += 1;
    let dependencyChanges = 0;
    for (const row of dependencies) if (row.callDelta || row.errorRateDelta || row.p95Delta) dependencyChanges += 1;
    return {
      current: cur, baseline: base, services, dependencies,
      summary: {
        currentEntries: cur.entries, baselineEntries: base.entries,
        serviceChanges,
        dependencyChanges
      }
    };
  }
  function normalizeHistoryEntry(value = {}, index = 0) {
    const baseline = normalize(value.baseline || value);
    return {
      id: clean(value.id || baseline.id || `history-${index + 1}`, 96), projectId: clean(value.projectId, 96),
      description: clean(value.description, 1000), tags: cleanTags(value.tags), savedAt: clean(value.savedAt || baseline.capturedAt || new Date().toISOString(), 64),
      baseline
    };
  }
  function normalizeHistory(input) {
    const source = Array.isArray(input) ? input : (Array.isArray(input?.items) ? input.items : []);
    return source.slice(-MAX_BASELINES).map(normalizeHistoryEntry).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
  function loadHistory() {
    try { return normalizeHistory(JSON.parse(root.localStorage?.getItem(HISTORY_KEY) || "[]")); } catch { return []; }
  }
  function saveHistory(input) {
    const items = normalizeHistory(input); root.localStorage?.setItem(HISTORY_KEY, JSON.stringify(items)); return items;
  }
  function addToHistory(list, baseline, meta = {}) {
    const items = normalizeHistory(list).filter((item) => item.id !== baseline?.id);
    items.push(normalizeHistoryEntry({ id: baseline?.id, baseline, ...meta, savedAt: meta.savedAt || new Date().toISOString() }, items.length));
    return saveHistory(items.slice(-MAX_BASELINES));
  }
  function removeFromHistory(list, id) { return saveHistory(normalizeHistory(list).filter((item) => item.id !== clean(id, 96))); }
  function renameInHistory(list, id, name) {
    const wanted = clean(id, 96); const items = normalizeHistory(list);
    const item = items.find((candidate) => candidate.id === wanted); if (!item) return saveHistory(items);
    item.baseline = normalize({ ...item.baseline, name: clean(name, 120) || item.baseline.name }); return saveHistory(items);
  }
  function historyForProject(list, projectId = "") {
    const wanted = clean(projectId, 96); return normalizeHistory(list).filter((item) => item.projectId === wanted);
  }
  function compareById(list, currentId, baselineId) {
    const items = normalizeHistory(list); const current = items.find((item) => item.id === clean(currentId, 96)); const baseline = items.find((item) => item.id === clean(baselineId, 96));
    if (!current || !baseline) throw new Error("Both baselines must exist in local baseline history.");
    return compare(current.baseline, baseline.baseline);
  }
  function exportHistory(list) { return JSON.stringify({ schema: HISTORY_SCHEMA, version: HISTORY_VERSION, exportedAt: new Date().toISOString(), items: normalizeHistory(list) }, null, 2); }
  function importHistory(text, mergeWith = []) {
    const parsed = JSON.parse(String(text || ""));
    if (parsed?.schema !== HISTORY_SCHEMA || parsed.version !== HISTORY_VERSION || !Array.isArray(parsed.items)) throw new Error("Unsupported or invalid SignalDock baseline history.");
    const byId = new Map(normalizeHistory(mergeWith).map((item) => [item.id, item]));
    normalizeHistory(parsed.items).forEach((item) => byId.set(item.id, item)); return saveHistory([...byId.values()].slice(-MAX_BASELINES));
  }

  root.SignalDockBaselineManager = {
    SCHEMA, VERSION, MAX_ROWS, HISTORY_SCHEMA, HISTORY_VERSION, HISTORY_KEY, MAX_BASELINES,
    snapshot, normalize, exportJson, parse, compare, normalizeHistory, loadHistory, saveHistory,
    addToHistory, removeFromHistory, renameInHistory, historyForProject, compareById, exportHistory, importHistory
  };
}(typeof self !== "undefined" ? self : window));
