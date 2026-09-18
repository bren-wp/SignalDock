(function (root) {
  "use strict";

  const VERSION = 1;

  function selectScope(entries, filteredIndexes, useFiltered) {
    const source = Array.isArray(entries) ? entries : [];
    const indexes = Array.isArray(filteredIndexes) ? filteredIndexes : [];
    const filtered = Boolean(useFiltered) && indexes.length < source.length;
    return { indexes: filtered ? indexes : null, filtered };
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

    if (!state || !Array.isArray(state.entries)) throw new Error("Service Matrix controller requires application state.");

    function close() {
      const dialog = el.serviceMatrixDialog;
      if (!dialog) return;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute?.("open");
      setActiveNav("logs");
    }

    function render(useFiltered = state.serviceMatrixScopeFiltered) {
      if (!root.SignalDockServiceMatrix || !el.serviceMatrixBody) return null;
      state.serviceMatrixScopeFiltered = Boolean(useFiltered);
      const scope = selectScope(state.entries, state.filteredIndexes, state.serviceMatrixScopeFiltered);
      const matrix = scope.filtered
        ? root.SignalDockServiceMatrix.build(state.entries, scope.indexes)
        : (state.serviceMatrixData || root.SignalDockServiceMatrix.build(state.entries));

      if (el.serviceMatrixMeta) {
        el.serviceMatrixMeta.textContent = `${scope.filtered ? "Current filtered result" : "All loaded logs"} · explicit parent-span relationships only.`;
      }

      if (el.serviceMatrixSummary) {
        el.serviceMatrixSummary.replaceChildren();
        [["Services", matrix.summary.services], ["Edges", matrix.summary.edges], ["Calls", matrix.summary.calls], ["Errors", matrix.summary.errors], ["Timed spans", matrix.summary.timed]].forEach(([label, value]) => {
          const item = el.serviceMatrixSummary.ownerDocument.createElement("div");
          const strong = el.serviceMatrixSummary.ownerDocument.createElement("strong");
          strong.textContent = Number(value).toLocaleString();
          const span = el.serviceMatrixSummary.ownerDocument.createElement("span");
          span.textContent = label;
          item.append(strong, span);
          el.serviceMatrixSummary.appendChild(item);
        });
      }

      const document = el.serviceMatrixBody.ownerDocument;
      el.serviceMatrixBody.replaceChildren();
      if (!matrix.rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 9;
        td.className = "investigation-empty";
        td.textContent = scope.filtered && !scope.indexes.length
          ? "No log entries match the current filters."
          : "No cross-service parent-span edges were found in this scope.";
        tr.appendChild(td);
        el.serviceMatrixBody.appendChild(tr);
        return matrix;
      }

      matrix.rows.slice(0, 750).forEach((row) => {
        const tr = document.createElement("tr");
        const source = document.createElement("td");
        source.textContent = row.source;
        const target = document.createElement("td");
        target.textContent = row.target;
        const calls = document.createElement("td");
        calls.textContent = row.calls.toLocaleString();
        const rate = document.createElement("td");
        rate.textContent = `${(row.errorRate * 100).toFixed(row.errorRate < 0.01 ? 2 : 1)}%`;
        if (row.errors) rate.className = "matrix-error";
        const median = document.createElement("td");
        median.textContent = row.medianMs === null ? "—" : formatDuration(row.medianMs);
        const p95 = document.createElement("td");
        p95.textContent = row.p95Ms === null ? "—" : formatDuration(row.p95Ms);
        const max = document.createElement("td");
        max.textContent = row.maxMs === null ? "—" : formatDuration(row.maxMs);
        const traces = document.createElement("td");
        traces.textContent = row.traces.toLocaleString();
        const action = document.createElement("td");
        const from = document.createElement("button");
        from.type = "button";
        from.className = "button button--ghost button--small";
        from.dataset.matrixService = row.source;
        from.textContent = "From";
        from.setAttribute("aria-label", `Filter to source service ${row.source}`);
        const to = document.createElement("button");
        to.type = "button";
        to.className = "button button--ghost button--small";
        to.dataset.matrixService = row.target;
        to.textContent = "To";
        to.setAttribute("aria-label", `Filter to target service ${row.target}`);
        action.append(from, to);
        tr.append(source, target, calls, rate, median, p95, max, traces, action);
        el.serviceMatrixBody.appendChild(tr);
      });
      return matrix;
    }

    function open() {
      if (!root.SignalDockServiceMatrix || !el.serviceMatrixDialog) return false;
      if (!state.entries.length) {
        toast("Load logs before opening the service matrix.");
        return false;
      }
      state.serviceMatrixScopeFiltered = true;
      render(true);
      closeCompetingDialogs("serviceMatrixDialog");
      showDialogSafely(el.serviceMatrixDialog);
      return true;
    }

    function onBodyClick(event) {
      const button = event.target.closest?.("[data-matrix-service]");
      if (!button) return;
      const service = String(button.dataset.matrixService || "").trim();
      if (!service) return;
      close();
      filterByServiceValue(service);
    }

    function onReset() {
      state.serviceMatrixScopeFiltered = false;
      render(false);
    }

    function bind() {
      if (bound) return;
      bound = true;
      el.closeServiceMatrixButton?.addEventListener("click", close);
      el.serviceMatrixResetButton?.addEventListener("click", onReset);
      el.serviceMatrixBody?.addEventListener("click", onBodyClick);
    }

    function destroy() {
      if (!bound) return;
      bound = false;
      el.closeServiceMatrixButton?.removeEventListener("click", close);
      el.serviceMatrixResetButton?.removeEventListener("click", onReset);
      el.serviceMatrixBody?.removeEventListener("click", onBodyClick);
    }

    return Object.freeze({ open, close, render, bind, destroy });
  }

  root.SignalDockServiceMatrixController = Object.freeze({ VERSION, selectScope, create });
}(typeof self !== "undefined" ? self : window));
