(function (root) {
  "use strict";

  const VERSION = 1;
  const MAX_RENDER_ROWS = 500;

  function selectScope(entries, filteredIndexes, useFiltered) {
    const source = Array.isArray(entries) ? entries : [];
    const indexes = Array.isArray(filteredIndexes) ? filteredIndexes : [];
    const filtered = Boolean(useFiltered) && indexes.length < source.length;
    return { filtered, indexes: filtered ? [...indexes] : null };
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

    if (!state || !Array.isArray(state.entries)) throw new Error("Observed Health controller requires application state.");

    function close() {
      const dialog = el.healthDialog;
      if (!dialog) return;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute?.("open");
      setActiveNav("logs");
    }

    function render(useFiltered = state.healthScopeFiltered) {
      if (!root.SignalDockServiceHealth || !el.healthTableBody) return null;
      state.healthScopeFiltered = Boolean(useFiltered);
      const scope = selectScope(state.entries, state.filteredIndexes, state.healthScopeFiltered);
      const health = scope.filtered
        ? root.SignalDockServiceHealth.analyze(state.entries, { indexes: scope.indexes })
        : (state.healthData || root.SignalDockServiceHealth.analyze(state.entries));
      const document = el.healthTableBody.ownerDocument;

      if (el.healthSummary) {
        el.healthSummary.replaceChildren();
        [["Critical", health.summary.critical], ["Degraded", health.summary.degraded], ["Watch", health.summary.watch], ["Quiet", health.summary.quiet]].forEach(([label, value]) => {
          const item = document.createElement("div");
          const strong = document.createElement("strong");
          strong.textContent = Number(value || 0).toLocaleString();
          const span = document.createElement("span");
          span.textContent = label;
          item.append(strong, span);
          el.healthSummary.appendChild(item);
        });
      }

      el.healthTableBody.replaceChildren();
      if (!health.rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 9;
        td.className = "investigation-empty";
        td.textContent = scope.filtered && !scope.indexes.length
          ? "No log entries match the current filters."
          : "No named services were observed in this dataset.";
        tr.appendChild(td);
        el.healthTableBody.appendChild(tr);
        return health;
      }

      health.rows.slice(0, MAX_RENDER_ROWS).forEach((row) => {
        const tr = document.createElement("tr");
        const service = document.createElement("td");
        service.textContent = row.service;
        const status = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = `health-status health-status--${row.status}`;
        badge.textContent = row.status;
        status.appendChild(badge);
        const entries = document.createElement("td");
        entries.textContent = row.total.toLocaleString();
        const errorRate = document.createElement("td");
        errorRate.textContent = `${(row.errorRate * 100).toFixed(row.errorRate < 0.01 ? 2 : 1)}%`;
        const warnings = document.createElement("td");
        warnings.textContent = `${row.warnings.toLocaleString()} · ${(row.warningRate * 100).toFixed(1)}%`;
        const exceptions = document.createElement("td");
        exceptions.textContent = row.exceptionGroups.toLocaleString();
        const p95 = document.createElement("td");
        p95.textContent = row.p95DurationMs === null ? "—" : formatDuration(row.p95DurationMs);
        const delta = document.createElement("td");
        const diff = row.recentErrors - row.previousErrors;
        delta.textContent = diff > 0 ? `+${diff}` : String(diff);
        delta.title = `${row.recentErrors} recent errors vs ${row.previousErrors} previous-window errors`;
        const action = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button--ghost button--small";
        button.dataset.healthService = row.service;
        button.textContent = "Filter";
        button.setAttribute("aria-label", `Filter logs to observed service ${row.service}`);
        action.appendChild(button);
        tr.append(service, status, entries, errorRate, warnings, exceptions, p95, delta, action);
        el.healthTableBody.appendChild(tr);
      });

      if (health.rows.length > MAX_RENDER_ROWS) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 9;
        td.className = "correlation-meta";
        td.textContent = `Showing ${MAX_RENDER_ROWS.toLocaleString()} of ${health.rows.length.toLocaleString()} observed services.`;
        tr.appendChild(td);
        el.healthTableBody.appendChild(tr);
      }
      return health;
    }

    function open() {
      if (!root.SignalDockServiceHealth || !el.healthDialog) return false;
      if (!state.entries.length) {
        toast("Load logs before opening observed health.");
        return false;
      }
      state.healthScopeFiltered = true;
      render(true);
      closeCompetingDialogs("healthDialog");
      showDialogSafely(el.healthDialog);
      return true;
    }

    function onBodyClick(event) {
      const button = event.target.closest?.("[data-health-service]");
      if (!button) return;
      const service = String(button.dataset.healthService || "").trim();
      if (!service) return;
      close();
      filterByServiceValue(service);
    }

    function onReset() {
      state.healthScopeFiltered = false;
      render(false);
    }

    function bind() {
      if (bound) return;
      bound = true;
      el.closeHealthButton?.addEventListener("click", close);
      el.healthResetButton?.addEventListener("click", onReset);
      el.healthTableBody?.addEventListener("click", onBodyClick);
    }

    function destroy() {
      if (!bound) return;
      bound = false;
      el.closeHealthButton?.removeEventListener("click", close);
      el.healthResetButton?.removeEventListener("click", onReset);
      el.healthTableBody?.removeEventListener("click", onBodyClick);
    }

    return Object.freeze({ open, close, render, bind, destroy });
  }

  root.SignalDockHealthController = Object.freeze({ VERSION, MAX_RENDER_ROWS, selectScope, create });
}(typeof self !== "undefined" ? self : window));
