(function (root) {
  "use strict";

  const VERSION = 1;
  const OPERATORS = Object.freeze({
    service: "service",
    environment: "env",
    env: "env",
    namespace: "namespace",
    ns: "namespace"
  });

  const PATTERNS = Object.freeze({
    service: /(?:^|\s)service:(?:"[^"]+"|[^\s]+)/gi,
    env: /(?:^|\s)(?:env|environment):(?:"[^"]+"|[^\s]+)/gi,
    namespace: /(?:^|\s)(?:ns|namespace):(?:"[^"]+"|[^\s]+)/gi
  });

  function create(options = {}) {
    const { el, applyFilters, toast } = options;
    if (!el?.queryInput) throw new Error("Query Navigation controller requires the query input.");
    if (typeof applyFilters !== "function") throw new Error("Query Navigation controller requires applyFilters().");
    if (typeof toast !== "function") throw new Error("Query Navigation controller requires toast().");

    function operatorFor(kind) {
      return OPERATORS[String(kind || "").toLowerCase()] || "";
    }

    function quoteIfNeeded(value) {
      const text = String(value ?? "").trim().replace(/"/g, "");
      if (!text) return "";
      return /\s/.test(text) ? `"${text}"` : text;
    }

    function replaceOperator(query, operator, value) {
      const pattern = PATTERNS[operator];
      const quoted = quoteIfNeeded(value);
      if (!pattern || !quoted) return String(query || "").trim();
      const clean = String(query || "").replace(pattern, " ").replace(/\s+/g, " ").trim();
      return `${clean}${clean ? " " : ""}${operator}:${quoted}`;
    }

    function applyQuery(query, message) {
      const next = String(query || "").trim();
      if (!next) return false;
      el.queryInput.value = next;
      applyFilters(true);
      toast(message);
      return true;
    }

    function filterByServiceValue(service) {
      const value = String(service ?? "").trim();
      if (!value) return false;
      const query = replaceOperator(el.queryInput.value, "service", value);
      return applyQuery(query, `Filtered to service ${value}.`);
    }

    function filterByDimension(kind, value) {
      const operator = operatorFor(kind);
      const cleanValue = String(value ?? "").trim();
      if (!operator || !cleanValue) return false;
      const query = replaceOperator(el.queryInput.value, operator, cleanValue);
      const label = operator === "env" ? "environment" : operator;
      return applyQuery(query, `Filtered to ${label} ${cleanValue}.`);
    }

    function applyTopologyFilter(input = {}) {
      const kind = String(input.kind || "service").toLowerCase();
      const operator = operatorFor(kind);
      const value = String(input.value ?? "").trim();
      if (!operator || !value) return false;

      let query = replaceOperator(el.queryInput.value, operator, value);
      const scopeOperator = operatorFor(input.scopeKind);
      const scopeValue = String(input.scopeValue ?? "").trim();

      if (scopeOperator && scopeOperator !== "service" && scopeValue) {
        query = replaceOperator(query, scopeOperator, scopeValue);
      }

      return applyQuery(query, `Applied topology filter: ${query}.`);
    }

    return Object.freeze({
      VERSION,
      operatorFor,
      quoteIfNeeded,
      filterByServiceValue,
      filterByDimension,
      applyTopologyFilter
    });
  }

  root.SignalDockQueryNavigationController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
