(function (root) {
  "use strict";

  const VERSION = 1;
  const DEFAULT_SPLIT = 0.5;
  const MIN_SPLIT = 0.1;
  const MAX_SPLIT = 0.9;
  const MAX_RENDER_ROWS = 500;

  function normalizeSplit(value) {
    if (value === null || value === undefined || value === "") return DEFAULT_SPLIT;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_SPLIT;
    return Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, numeric));
  }

  function selectScope(entries, filteredIndexes, useFiltered) {
    const source = Array.isArray(entries) ? entries : [];
    const indexes = Array.isArray(filteredIndexes) ? filteredIndexes : [];
    const filtered = Boolean(useFiltered) && indexes.length < source.length;
    return { filtered, indexes: filtered ? indexes : null };
  }

  function splitTimestamp(entries, indexes, fraction = DEFAULT_SPLIT) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes : null;
    const scan = selected || source.keys();
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    for (const index of scan) {
      const value = Number(source[index]?.timestampMs);
      if (!Number.isFinite(value)) continue;
      count += 1;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (count < 2 || min === max) return null;
    return min + ((max - min) * normalizeSplit(fraction));
  }

  function create(options = {}) {
    const state = options.state;
    const el = options.el || {};
    const formatDuration = options.formatDuration || ((value) => String(value ?? "—"));
    const toast = options.toast || (() => {});
    const filterByServiceValue = options.filterByServiceValue || (() => {});
    const closeCompetingDialogs = options.closeCompetingDialogs || (() => {});
    const showDialogSafely = options.showDialogSafely || (() => false);
    const setActiveNav = options.setActiveNav || (() => {});
    let bound = false;

    if (!state || !Array.isArray(state.entries)) throw new Error("Service Trends controller requires application state.");

    function close() {
      const dialog = el.serviceTrendsDialog;
      if (!dialog) return;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute?.("open");
      setActiveNav("logs");
    }

    function render(useFiltered = state.serviceTrendsScopeFiltered) {
      if (!root.SignalDockServiceTrends || !el.serviceTrendsBody) return null;
      state.serviceTrendsScopeFiltered = Boolean(useFiltered);
      state.serviceTrendsSplit = normalizeSplit(state.serviceTrendsSplit);
      const scope = selectScope(state.entries, state.filteredIndexes, state.serviceTrendsScopeFiltered);
      const splitMs = splitTimestamp(state.entries, scope.indexes, state.serviceTrendsSplit);
      const data = root.SignalDockServiceTrends.compare(state.entries, scope.indexes, { splitMs });
      if (!scope.filtered && state.serviceTrendsSplit === DEFAULT_SPLIT) state.serviceTrendsData = data;
      const document = el.serviceTrendsBody.ownerDocument;

      if (el.serviceTrendsMeta) {
        el.serviceTrendsMeta.textContent = `${scope.filtered ? "Current filtered result" : "All loaded logs"} · explicit parent-span edges only.`;
      }
      if (el.serviceTrendsWindow) {
        el.serviceTrendsWindow.textContent = data.windows
          ? `${new Date(data.windows.before.startMs).toLocaleString()} → ${new Date(data.windows.before.endMs).toLocaleString()}  vs  ${new Date(data.windows.after.startMs).toLocaleString()} → ${new Date(data.windows.after.endMs).toLocaleString()}`
          : "Not enough timestamped dependency data for two periods.";
      }
      if (el.serviceTrendsSummary) {
        el.serviceTrendsSummary.replaceChildren();
        [["Edges", data.summary.edges], ["Changed", data.summary.changed], ["New", data.summary.newEdges], ["Disappeared", data.summary.disappearedEdges], ["Degrading", data.summary.degrading]].forEach(([label, value]) => {
          const item = document.createElement("div");
          const strong = document.createElement("strong");
          strong.textContent = Number(value || 0).toLocaleString();
          const span = document.createElement("span");
          span.textContent = label;
          item.append(strong, span);
          el.serviceTrendsSummary.appendChild(item);
        });
      }

      el.serviceTrendsBody.replaceChildren();
      if (!data.rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 8;
        td.className = "investigation-empty";
        td.textContent = scope.filtered && !scope.indexes.length
          ? "No log entries match the current filters."
          : "No timestamped cross-service dependency edges were found across both comparison periods.";
        tr.appendChild(td);
        el.serviceTrendsBody.appendChild(tr);
        return data;
      }

      data.rows.slice(0, MAX_RENDER_ROWS).forEach((row) => {
        const tr = document.createElement("tr");
        const dependency = document.createElement("td");
        dependency.textContent = `${row.source} → ${row.target}`;
        const trend = document.createElement("td");
        const pill = document.createElement("span");
        pill.className = `trend-pill trend-pill--${row.trend}`;
        pill.textContent = row.trend;
        trend.appendChild(pill);
        const before = document.createElement("td");
        before.textContent = `${row.before.calls} calls · ${row.before.errors} err`;
        const after = document.createElement("td");
        after.textContent = `${row.after.calls} calls · ${row.after.errors} err`;
        const calls = document.createElement("td");
        calls.textContent = `${row.deltaCalls >= 0 ? "+" : ""}${row.deltaCalls}`;
        const errors = document.createElement("td");
        errors.textContent = `${row.deltaErrors >= 0 ? "+" : ""}${row.deltaErrors}`;
        const p95 = document.createElement("td");
        p95.textContent = row.deltaP95Ms === null ? "—" : `${row.deltaP95Ms >= 0 ? "+" : "-"}${formatDuration(Math.abs(row.deltaP95Ms))}`;
        const action = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button--ghost button--small";
        button.dataset.trendService = row.target;
        button.textContent = "Filter target";
        button.setAttribute("aria-label", `Filter to target service ${row.target} for dependency ${row.source} to ${row.target}`);
        action.appendChild(button);
        tr.append(dependency, trend, before, after, calls, errors, p95, action);
        el.serviceTrendsBody.appendChild(tr);
      });
      return data;
    }

    function open() {
      if (!root.SignalDockServiceTrends || !el.serviceTrendsDialog) return false;
      if (!state.entries.length) {
        toast("Load timestamped trace/span data before comparing dependency periods.");
        return false;
      }
      state.serviceTrendsScopeFiltered = true;
      state.serviceTrendsSplit = normalizeSplit(state.serviceTrendsSplit);
      if (el.serviceTrendsSplit) el.serviceTrendsSplit.value = String(state.serviceTrendsSplit);
      render(true);
      closeCompetingDialogs("serviceTrendsDialog");
      showDialogSafely(el.serviceTrendsDialog);
      return true;
    }

    function onBodyClick(event) {
      const button = event.target.closest?.("[data-trend-service]");
      if (!button) return;
      const service = String(button.dataset.trendService || "").trim();
      close();
      if (service) filterByServiceValue(service);
    }

    function onReset() {
      state.serviceTrendsScopeFiltered = false;
      render(false);
    }

    function onSplitChange() {
      state.serviceTrendsSplit = normalizeSplit(el.serviceTrendsSplit?.value);
      if (el.serviceTrendsSplit) el.serviceTrendsSplit.value = String(state.serviceTrendsSplit);
      render();
    }

    function bind() {
      if (bound) return;
      bound = true;
      el.closeServiceTrendsButton?.addEventListener("click", close);
      el.serviceTrendsResetButton?.addEventListener("click", onReset);
      el.serviceTrendsSplit?.addEventListener("change", onSplitChange);
      el.serviceTrendsBody?.addEventListener("click", onBodyClick);
    }

    function destroy() {
      if (!bound) return;
      bound = false;
      el.closeServiceTrendsButton?.removeEventListener("click", close);
      el.serviceTrendsResetButton?.removeEventListener("click", onReset);
      el.serviceTrendsSplit?.removeEventListener("change", onSplitChange);
      el.serviceTrendsBody?.removeEventListener("click", onBodyClick);
    }

    return Object.freeze({ open, close, render, bind, destroy });
  }

  root.SignalDockServiceTrendsController = Object.freeze({ VERSION, DEFAULT_SPLIT, MIN_SPLIT, MAX_SPLIT, MAX_RENDER_ROWS, normalizeSplit, selectScope, splitTimestamp, create });
}(typeof self !== "undefined" ? self : window));
