(function (root) {
  "use strict";

  const TIME_WINDOWS = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000
  };
  const CORRELATION_KEYS = ["trace", "span", "request", "correlation", "job", "session", "user"];
  const MAX_REGEX_LENGTH = 256;

  function tokenize(text) {
    const tokens = [];
    const matcher = /(-?[^\s:"']+:(?:"[^"]*"|'[^']*'|\/[^/]*(?:\\\/[^/]*)*\/[gimsuy]*|[^\s]+)|-?"[^"]+"|-?'[^']+'|\S+)/g;
    const source = String(text || "");
    let match;
    while ((match = matcher.exec(source)) !== null) {
      let token = match[1];
      const colon = token.indexOf(":");
      if (colon > 0) {
        const prefix = token.slice(0, colon + 1);
        let value = token.slice(colon + 1);
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        token = prefix + value;
      } else {
        const negative = token.startsWith("-");
        let value = negative ? token.slice(1) : token;
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        token = (negative ? "-" : "") + value;
      }
      tokens.push(token);
    }
    return tokens;
  }

  function parseDateValue(value) {
    if (!value) return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && String(value).trim() !== "") {
      const millis = numeric < 1e12 ? numeric * 1000 : numeric;
      return Number.isFinite(millis) ? millis : null;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function looksPotentiallyExpensiveRegex(pattern) {
    return /(\([^)]*[+*][^)]*\))[+*{]/.test(pattern) || /(\[[^\]]+\][+*])[+*{]/.test(pattern) || /(\.\*){2,}/.test(pattern);
  }

  function parseRegexLiteral(value) {
    const text = String(value || "").trim();
    let pattern = text;
    let flags = "i";
    if (text.startsWith("/")) {
      const lastSlash = text.lastIndexOf("/");
      if (lastSlash <= 0) return null;
      pattern = text.slice(1, lastSlash);
      flags = text.slice(lastSlash + 1) || "";
    }
    if (!pattern || pattern.length > MAX_REGEX_LENGTH || /[^imsu]/.test(flags) || looksPotentiallyExpensiveRegex(pattern)) return null;
    try {
      // Global/sticky regexes are intentionally disallowed because repeated .test() calls mutate state.
      return { pattern, flags, regex: new RegExp(pattern, flags) };
    } catch {
      return null;
    }
  }

  function parseSmartQuery(text) {
    const parsed = {
      terms: [], excludes: [], any: [], levels: [], sources: [], services: [], messages: [], environments: [], namespaces: [], exceptions: [],
      before: null, after: null, has: [], correlations: {}, regexes: [], invalid: []
    };

    tokenize(text).forEach((rawToken) => {
      const negative = rawToken.startsWith("-") && rawToken.length > 1;
      const token = negative ? rawToken.slice(1) : rawToken;
      const colon = token.indexOf(":");
      if (colon <= 0) {
        (negative ? parsed.excludes : parsed.terms).push(token.toLowerCase());
        return;
      }

      const key = token.slice(0, colon).toLowerCase();
      const value = token.slice(colon + 1).trim();
      if (!value) return;
      const values = value.split(",").map((item) => item.trim()).filter(Boolean);

      if (negative) {
        parsed.excludes.push(token.toLowerCase());
        return;
      }

      if (key === "level") parsed.levels.push(...values.map((item) => item.toUpperCase()));
      else if (key === "source" || key === "file") parsed.sources.push(...values.map((item) => item.toLowerCase()));
      else if (key === "service" || key === "app") parsed.services.push(...values.map((item) => item.toLowerCase()));
      else if (key === "message" || key === "msg") parsed.messages.push(...values.map((item) => item.toLowerCase()));
      else if (key === "environment" || key === "env") parsed.environments.push(...values.map((item) => item.toLowerCase()));
      else if (key === "namespace" || key === "ns") parsed.namespaces.push(...values.map((item) => item.toLowerCase()));
      else if (key === "exception" || key === "fingerprint") parsed.exceptions.push(...values.map((item) => item.toLowerCase()));
      else if (key === "any") parsed.any.push(...values.map((item) => item.toLowerCase()));
      else if (key === "before") {
        const time = parseDateValue(value);
        if (time === null) parsed.invalid.push(token); else parsed.before = time;
      } else if (key === "after" || key === "since") {
        const time = parseDateValue(value);
        if (time === null) parsed.invalid.push(token); else parsed.after = time;
      } else if (key === "has") parsed.has.push(...values.map((item) => item.toLowerCase()));
      else if (key === "re" || key === "regex") {
        const compiled = parseRegexLiteral(value);
        if (!compiled) parsed.invalid.push(token); else parsed.regexes.push({ field: "all", pattern: compiled.pattern, flags: compiled.flags });
      } else if (["message~", "msg~", "service~", "source~"].includes(key)) {
        const compiled = parseRegexLiteral(value);
        const field = key.startsWith("message") || key.startsWith("msg") ? "message" : key.slice(0, -1);
        if (!compiled) parsed.invalid.push(token); else parsed.regexes.push({ field, pattern: compiled.pattern, flags: compiled.flags });
      } else if (CORRELATION_KEYS.includes(key)) {
        if (!parsed.correlations[key]) parsed.correlations[key] = [];
        parsed.correlations[key].push(...values.map((item) => item.toLowerCase()));
      } else parsed.terms.push(token.toLowerCase());
    });

    return parsed;
  }

  function timestampMs(entry) {
    if (Number.isFinite(entry.timestampMs)) return entry.timestampMs;
    if (!entry.timestamp) return null;
    const parsed = Date.parse(entry.timestamp);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function containsAny(value, terms) {
    if (!terms.length) return true;
    const haystack = String(value || "").toLowerCase();
    return terms.some((term) => haystack.includes(term));
  }

  function hasField(entry, field) {
    if (field === "timestamp" || field === "time") return timestampMs(entry) !== null;
    if (field === "service") return Boolean(entry.service && entry.service !== "—");
    if (field === "source" || field === "file") return Boolean(entry.source);
    if (field === "message" || field === "msg") return Boolean(entry.message);
    if (field === "level") return Boolean(entry.level && entry.level !== "UNKNOWN");
    if (field === "environment" || field === "env") return Boolean(entry.dimensions?.environment);
    if (field === "namespace" || field === "ns") return Boolean(entry.dimensions?.namespace);
    if (field === "exception" || field === "fingerprint") return Boolean(entry.exceptionFingerprint);
    if (CORRELATION_KEYS.includes(field)) return Boolean(entry.correlations?.[field]);
    return String(entry.searchText || "").includes(field);
  }

  function compileRegexes(parsed) {
    const compiled = [];
    for (const item of parsed.regexes || []) {
      try { compiled.push({ field: item.field, regex: new RegExp(item.pattern, item.flags || "") }); }
      catch { parsed.invalid.push(`${item.field}:${item.pattern}`); }
    }
    return compiled;
  }

  function matchesRegex(entry, item) {
    const value = item.field === "message" ? entry.message
      : item.field === "service" ? entry.service
        : item.field === "source" ? entry.source
          : entry.searchText;
    item.regex.lastIndex = 0;
    return item.regex.test(String(value || ""));
  }

  function matchesCorrelations(entry, correlations) {
    for (const [kind, terms] of Object.entries(correlations || {})) {
      const value = String(entry.correlations?.[kind] || "").toLowerCase();
      if (!value || !terms.some((term) => value.includes(term))) return false;
    }
    return true;
  }

  function matches(entry, parsed, options, compiledRegexes) {
    if (!options.showUnknown && entry.level === "UNKNOWN") return false;
    if (options.level && entry.level !== options.level) return false;
    if (options.source && entry.source !== options.source) return false;
    if (parsed.levels.length && !parsed.levels.includes(entry.level)) return false;
    if (parsed.sources.length && !containsAny(entry.source, parsed.sources)) return false;
    if (parsed.services.length && !containsAny(entry.service, parsed.services)) return false;
    if (parsed.messages.length && !parsed.messages.every((term) => String(entry.message || "").toLowerCase().includes(term))) return false;
    if (parsed.environments.length && !containsAny(entry.dimensions?.environment, parsed.environments)) return false;
    if (parsed.namespaces.length && !containsAny(entry.dimensions?.namespace, parsed.namespaces)) return false;
    if (parsed.exceptions.length && !containsAny(entry.exceptionFingerprint, parsed.exceptions)) return false;

    const searchText = String(entry.searchText || "").toLowerCase();
    if (parsed.terms.length && !parsed.terms.every((term) => searchText.includes(term))) return false;
    if (parsed.excludes.length && parsed.excludes.some((term) => searchText.includes(term))) return false;
    if (parsed.any.length && !parsed.any.some((term) => searchText.includes(term))) return false;
    if (parsed.has.length && !parsed.has.every((field) => hasField(entry, field))) return false;
    if (!matchesCorrelations(entry, parsed.correlations)) return false;
    if (compiledRegexes.length && !compiledRegexes.every((item) => matchesRegex(entry, item))) return false;

    const time = timestampMs(entry);
    if (parsed.before !== null && (time === null || time >= parsed.before)) return false;
    if (parsed.after !== null && (time === null || time <= parsed.after)) return false;
    if (options.timeWindowMs && options.referenceTime) {
      if (time === null || time < options.referenceTime - options.timeWindowMs || time > options.referenceTime) return false;
    }
    return true;
  }

  function compareIndexes(entries, sortMode) {
    if (sortMode === "oldest") return (a, b) => {
      const at = timestampMs(entries[a]);
      const bt = timestampMs(entries[b]);
      if (at === null && bt === null) return a - b;
      if (at === null) return 1;
      if (bt === null) return -1;
      return at - bt || a - b;
    };
    if (sortMode === "newest") return (a, b) => {
      const at = timestampMs(entries[a]);
      const bt = timestampMs(entries[b]);
      if (at === null && bt === null) return a - b;
      if (at === null) return 1;
      if (bt === null) return -1;
      return bt - at || a - b;
    };
    return (a, b) => a - b;
  }

  function filterIndexes(entries, request, candidateIndexes) {
    const parsed = request.parsed || parseSmartQuery(request.query || "");
    const compiledRegexes = compileRegexes(parsed);
    const options = {
      level: request.level || "",
      source: request.source || "",
      showUnknown: request.showUnknown !== false,
      timeWindowMs: TIME_WINDOWS[request.timeRange] || 0,
      referenceTime: request.referenceTime || 0
    };
    const indexes = [];
    const candidates = Array.isArray(candidateIndexes) ? candidateIndexes : null;
    if (candidates) {
      for (const i of candidates) {
        if (i >= 0 && i < entries.length && matches(entries[i], parsed, options, compiledRegexes)) indexes.push(i);
      }
    } else {
      for (let i = 0; i < entries.length; i += 1) {
        if (matches(entries[i], parsed, options, compiledRegexes)) indexes.push(i);
      }
    }
    indexes.sort(compareIndexes(entries, request.sortMode || "original"));
    return { indexes, parsed };
  }

  function relatedIndexes(entries, correlations, limit = 200, origin = null) {
    const needles = Object.entries(correlations || {}).filter(([, value]) => String(value || "").trim());
    if (!needles.length) return [];
    const isRelated = (entry) => {
      const current = entry?.correlations || {};
      return needles.some(([kind, value]) => String(current[kind] || "").toLowerCase() === String(value).toLowerCase());
    };
    const output = [];
    if (Number.isInteger(origin) && origin >= 0 && origin < entries.length) {
      for (let distance = 0; distance < entries.length && output.length < limit; distance += 1) {
        const left = origin - distance;
        const right = origin + distance;
        if (left >= 0 && isRelated(entries[left])) output.push(left);
        if (output.length >= limit) break;
        if (distance && right < entries.length && isRelated(entries[right])) output.push(right);
        if (left < 0 && right >= entries.length) break;
      }
      return output;
    }
    for (let i = 0; i < entries.length; i += 1) {
      if (isRelated(entries[i])) output.push(i);
      if (output.length >= limit) break;
    }
    return output;
  }

  root.SignalDockQueryEngine = { TIME_WINDOWS, CORRELATION_KEYS, parseSmartQuery, filterIndexes, relatedIndexes, timestampMs };
}(typeof self !== "undefined" ? self : window));
