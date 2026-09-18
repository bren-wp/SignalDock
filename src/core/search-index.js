(function (root) {
  "use strict";

  const MIN_TOKEN_LENGTH = 3;
  const MAX_TOKEN_LENGTH = 72;
  const MAX_TOKENS_PER_ENTRY = 320;
  const MAX_UNIQUE_TOKENS = 220000;
  const MAX_POSTINGS = 3000000;
  const INDEX_MIN_ENTRIES = 20000;

  function tokensFromText(text) {
    const source = String(text || "").toLowerCase();
    const matches = source.match(/[\p{L}\p{N}_@.-]{3,72}/gu) || [];
    const out = [];
    const seen = new Set();
    for (const raw of matches) {
      const token = raw.replace(/^[._-]+|[._-]+$/g, "");
      if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH || seen.has(token)) continue;
      seen.add(token);
      out.push(token);
      if (out.length >= MAX_TOKENS_PER_ENTRY) break;
    }
    return out;
  }

  function gramsForToken(token) {
    const text = String(token || "").toLowerCase();
    if (text.length < 3) return [];
    const grams = [];
    const seen = new Set();
    for (let i = 0; i <= text.length - 3; i += 1) {
      const gram = text.slice(i, i + 3);
      if (!seen.has(gram)) { seen.add(gram); grams.push(gram); }
    }
    return grams;
  }

  function gramsForTerm(term) {
    const raw = String(term || "").toLowerCase();
    const tokens = tokensFromText(raw);
    if (tokens.length !== 1 || tokens[0] !== raw || raw.length < 3) return null;
    return gramsForToken(raw);
  }

  function addPosting(map, key, index, stats) {
    if (!key || stats.truncated) return;
    if (stats.postings >= MAX_POSTINGS) { stats.truncated = true; stats.truncateReason = "posting-cap"; return; }
    let posting = map.get(key);
    if (!posting) {
      if (map.size >= MAX_UNIQUE_TOKENS) {
        stats.truncated = true;
        return;
      }
      posting = [];
      map.set(key, posting);
    }
    posting.push(index);
    stats.postings += 1;
  }

  function build(entries) {
    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    const tokenMap = new Map();
    const levelMap = new Map();
    const serviceMap = new Map();
    const sourceMap = new Map();
    const environmentMap = new Map();
    const namespaceMap = new Map();
    const exceptionMap = new Map();
    const correlationMaps = new Map();
    const stats = { entries: entries.length, tokens: 0, postings: 0, truncated: false, elapsedMs: 0, enabled: entries.length >= INDEX_MIN_ENTRIES };

    if (!stats.enabled) return { tokenMap, levelMap, serviceMap, sourceMap, environmentMap, namespaceMap, exceptionMap, correlationMaps, stats };

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i] || {};
      const entryGrams = new Set();
      for (const token of tokensFromText(entry.searchText || entry.message || "")) {
        for (const gram of gramsForToken(token)) entryGrams.add(gram);
        if (entryGrams.size >= MAX_TOKENS_PER_ENTRY * 12) break;
      }
      for (const gram of entryGrams) addPosting(tokenMap, gram, i, stats);
      if (stats.truncated) break;
      addPosting(levelMap, String(entry.level || "").toLowerCase(), i, stats);
      addPosting(serviceMap, String(entry.service || "").toLowerCase(), i, stats);
      addPosting(sourceMap, String(entry.source || "").toLowerCase(), i, stats);
      addPosting(environmentMap, String(entry.dimensions?.environment || "").toLowerCase(), i, stats);
      addPosting(namespaceMap, String(entry.dimensions?.namespace || "").toLowerCase(), i, stats);
      addPosting(exceptionMap, String(entry.exceptionFingerprint || "").toLowerCase(), i, stats);
      for (const [kind, value] of Object.entries(entry.correlations || {})) {
        const normalized = String(value || "").toLowerCase();
        if (!normalized) continue;
        if (!correlationMaps.has(kind)) correlationMaps.set(kind, new Map());
        addPosting(correlationMaps.get(kind), normalized, i, stats);
      }
    }
    stats.tokens = tokenMap.size;
    stats.grams = tokenMap.size;
    const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
    stats.elapsedMs = Math.round((ended - started) * 10) / 10;
    return { tokenMap, levelMap, serviceMap, sourceMap, environmentMap, namespaceMap, exceptionMap, correlationMaps, stats };
  }

  function intersectSorted(a, b) {
    if (!a) return b ? b.slice() : null;
    if (!b) return a.slice();
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { out.push(a[i]); i += 1; j += 1; }
      else if (a[i] < b[j]) i += 1;
      else j += 1;
    }
    return out;
  }

  function mergeSortedUnique(a, b) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    const out = [];
    let i = 0;
    let j = 0;
    let last = null;
    let hasLast = false;
    while (i < left.length || j < right.length) {
      let value;
      if (j >= right.length || (i < left.length && left[i] <= right[j])) value = left[i++];
      else value = right[j++];
      if (!hasLast || value !== last) {
        out.push(value);
        last = value;
        hasLast = true;
      }
      while (i < left.length && left[i] === last) i += 1;
      while (j < right.length && right[j] === last) j += 1;
    }
    return out;
  }

  function unionSorted(arrays) {
    let current = [];
    for (const array of arrays) current = mergeSortedUnique(current, array);
    return current;
  }

  function exactPosting(map, value) {
    return map.get(String(value || "").toLowerCase()) || null;
  }

  function termPosting(index, term) {
    const grams = gramsForTerm(term);
    if (!grams?.length) return null;
    let current = null;
    for (const gram of grams) {
      const posting = index.tokenMap.get(gram);
      if (!posting) return [];
      current = intersectSorted(current, posting);
      if (!current.length) return [];
    }
    return current || [];
  }

  function candidates(index, parsed, request) {
    if (!index?.stats?.enabled || index.stats.truncated) return { indexes: null, reason: index?.stats?.truncated ? "index-truncated" : "index-disabled" };
    if (!parsed || parsed.invalid?.length || parsed.regexes?.length || parsed.excludes?.length || parsed.before !== null || parsed.after !== null || parsed.has?.length) {
      return { indexes: null, reason: "query-requires-linear" };
    }

    let current = null;
    let constrained = false;
    const intersect = (posting) => {
      if (!posting) return false;
      current = intersectSorted(current, posting);
      constrained = true;
      return true;
    };

    for (const term of parsed.terms || []) {
      const posting = termPosting(index, term);
      if (!posting) return { indexes: null, reason: "substring-term" };
      intersect(posting);
      if (!current.length) return { indexes: [], reason: "indexed" };
    }

    if ((parsed.any || []).length) {
      const postings = [];
      for (const term of parsed.any) {
        const posting = termPosting(index, term);
        if (!posting) return { indexes: null, reason: "substring-any" };
        postings.push(posting);
      }
      intersect(unionSorted(postings));
    }

    if ((parsed.levels || []).length === 1) intersect(exactPosting(index.levelMap, parsed.levels[0]));
    else if ((parsed.levels || []).length > 1) intersect(unionSorted(parsed.levels.map((value) => exactPosting(index.levelMap, value))));

    const exactSingle = (values, map) => {
      if (!values?.length) return true;
      // Existing query semantics allow substring matches. Only exact values can safely use this index.
      if (values.length !== 1 || !map.has(String(values[0]).toLowerCase())) return false;
      intersect(exactPosting(map, values[0]));
      return true;
    };
    if (!exactSingle(parsed.services, index.serviceMap)) return { indexes: null, reason: "substring-service" };
    if (!exactSingle(parsed.sources, index.sourceMap)) return { indexes: null, reason: "substring-source" };
    if (!exactSingle(parsed.environments, index.environmentMap)) return { indexes: null, reason: "substring-environment" };
    if (!exactSingle(parsed.namespaces, index.namespaceMap)) return { indexes: null, reason: "substring-namespace" };
    if (!exactSingle(parsed.exceptions, index.exceptionMap || new Map())) return { indexes: null, reason: "substring-exception" };

    for (const [kind, values] of Object.entries(parsed.correlations || {})) {
      const map = index.correlationMaps.get(kind);
      if (!map || values.length !== 1 || !map.has(String(values[0]).toLowerCase())) return { indexes: null, reason: "substring-correlation" };
      intersect(exactPosting(map, values[0]));
    }

    if (request?.level) intersect(exactPosting(index.levelMap, request.level));
    if (request?.source) {
      const posting = exactPosting(index.sourceMap, request.source);
      if (!posting) return { indexes: [], reason: "indexed" };
      intersect(posting);
    }

    if (!constrained) return { indexes: null, reason: "no-indexable-constraints" };
    return { indexes: current || [], reason: "indexed" };
  }

  root.SignalDockSearchIndex = { INDEX_MIN_ENTRIES, MAX_POSTINGS, build, candidates, tokensFromText, gramsForTerm };
}(typeof self !== "undefined" ? self : window));
