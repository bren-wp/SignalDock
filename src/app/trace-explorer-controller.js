(function (root) {
  "use strict";

  const VERSION = 1;
  const MAX_ROWS = 1000;

  function cleanTraceId(value) {
    return String(value || "").trim();
  }

  function create(options = {}) {
    const {
      state,
      el,
      formatDuration,
      toast,
      selectEntry,
      renderInspector,
      entryRowIntoView,
      filterByCorrelation,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    } = options;

    if (!state || !el) throw new TypeError("Trace Explorer controller requires state and element registries.");
    for (const [name, value] of Object.entries({
      formatDuration,
      toast,
      selectEntry,
      renderInspector,
      entryRowIntoView,
      filterByCorrelation,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    })) {
      if (typeof value !== "function") throw new TypeError(`Trace Explorer controller requires ${name}().`);
    }
    if (!root.SignalDockTraceExplorer) throw new Error("SignalDock Trace Explorer domain module is unavailable.");
    if (!root.SignalDockTraceCompare) throw new Error("SignalDock Trace Compare domain module is unavailable.");

    const doc = el.traceExplorerBody?.ownerDocument || el.traceExplorerDialog?.ownerDocument || root.document;
    if (!doc) throw new Error("Trace Explorer controller requires a document.");

    let bound = false;
    const listeners = [];

    function listen(node, type, handler) {
      if (!node) return;
      node.addEventListener(type, handler);
      listeners.push([node, type, handler]);
    }

    function selectedTraceIds() {
      if (!Array.isArray(state.traceCompareSelection)) state.traceCompareSelection = [];
      return state.traceCompareSelection;
    }

    function syncCompareButton() {
      const selection = selectedTraceIds();
      if (!el.traceCompareButton) return;
      el.traceCompareButton.disabled = selection.length !== 2;
      el.traceCompareButton.textContent = `Compare selected (${selection.length}/2)`;
    }

    function reconcileSelection(data = state.traceExplorerData) {
      const traceIds = new Set((data?.rows || []).map((row) => cleanTraceId(row?.traceId)).filter(Boolean));
      state.traceCompareSelection = selectedTraceIds().filter((id) => traceIds.has(cleanTraceId(id))).slice(-2);
      syncCompareButton();
      return state.traceCompareSelection.slice();
    }

    function scopedIndexes() {
      if (!state.traceExplorerScopeFiltered) return null;
      if (!Array.isArray(state.filteredIndexes) || !state.filteredIndexes.length) return null;
      if (state.filteredIndexes.length >= (state.entries?.length || 0)) return null;
      return state.filteredIndexes;
    }

    function buildData() {
      const indexes = scopedIndexes();
      if (indexes) return root.SignalDockTraceExplorer.buildWindow(state.entries, indexes, { limit: MAX_ROWS });
      return state.traceExplorerData || root.SignalDockTraceExplorer.buildWindow(state.entries, null, { limit: MAX_ROWS });
    }

    function open() {
      if (!el.traceExplorerDialog) return;
      if (!state.entries?.length) {
        toast("Load trace/span data before opening Trace Explorer.");
        return;
      }
      state.traceExplorerScopeFiltered = true;
      render(true);
      closeCompetingDialogs("traceExplorerDialog");
      showDialogSafely(el.traceExplorerDialog);
    }

    function close() {
      if (!el.traceExplorerDialog) return;
      if (typeof el.traceExplorerDialog.close === "function" && el.traceExplorerDialog.open) el.traceExplorerDialog.close();
      else el.traceExplorerDialog.removeAttribute("open");
      setActiveNav("logs");
    }

    function resetScope() {
      state.traceExplorerScopeFiltered = false;
      render(false);
    }

    function renderSummary(data) {
      if (!el.traceExplorerSummary) return;
      el.traceExplorerSummary.replaceChildren();
      [["Traces", data.summary.traces], ["With errors", data.summary.errors], ["Incomplete", data.summary.incomplete], ["Services", data.summary.services]].forEach(([label, value]) => {
        const item = doc.createElement("div");
        const strong = doc.createElement("strong");
        strong.textContent = Number(value).toLocaleString();
        const span = doc.createElement("span");
        span.textContent = label;
        item.append(strong, span);
        el.traceExplorerSummary.appendChild(item);
      });
    }

    function renderRow(row) {
      const tr = doc.createElement("tr");
      const id = doc.createElement("td");
      const code = doc.createElement("code");
      code.textContent = row.traceId;
      code.title = row.traceId;
      id.appendChild(code);

      const services = doc.createElement("td");
      services.textContent = row.services.slice(0, 4).join(", ") + (row.services.length > 4 ? ` +${row.services.length - 4}` : "");
      const spans = doc.createElement("td");
      spans.textContent = Number(row.spans || 0).toLocaleString();
      const errors = doc.createElement("td");
      errors.textContent = Number(row.errors || 0).toLocaleString();
      if (row.errors) errors.className = "matrix-error";
      const events = doc.createElement("td");
      events.textContent = Number(row.events || 0).toLocaleString();
      const duration = doc.createElement("td");
      duration.textContent = row.durationMs === null ? "—" : formatDuration(row.durationMs);
      const coverage = doc.createElement("td");
      coverage.textContent = `${Math.round(Number(row.parentCoverage || 0) * 100)}%`;
      coverage.className = row.parentCoverage < 1 ? "trace-coverage-partial" : "";

      const action = doc.createElement("td");
      const openButton = doc.createElement("button");
      openButton.type = "button";
      openButton.className = "button button--ghost button--small";
      openButton.dataset.traceExplorerId = row.traceId;
      openButton.dataset.traceSampleIndex = String(row.sampleIndex);
      const sample = state.entries?.[row.sampleIndex];
      if (sample?.id) openButton.dataset.traceSampleId = sample.id;
      openButton.textContent = "Open";
      openButton.setAttribute("aria-label", `Open trace ${row.traceId}`);

      const compare = doc.createElement("button");
      compare.type = "button";
      compare.className = "button button--ghost button--small trace-compare-select";
      compare.dataset.traceCompareId = row.traceId;
      const selected = selectedTraceIds().includes(row.traceId);
      compare.textContent = selected ? "Selected" : "Compare";
      compare.classList.toggle("is-selected", selected);
      compare.setAttribute("aria-pressed", selected ? "true" : "false");
      compare.setAttribute("aria-label", `${selected ? "Remove" : "Add"} trace ${row.traceId} ${selected ? "from" : "to"} comparison`);

      action.append(openButton, compare);
      tr.append(id, services, spans, errors, events, duration, coverage, action);
      return tr;
    }

    function render(useFiltered = state.traceExplorerScopeFiltered) {
      if (!el.traceExplorerBody) return;
      state.traceExplorerScopeFiltered = Boolean(useFiltered);
      const indexes = scopedIndexes();
      const data = buildData();
      reconcileSelection(data);

      if (el.traceExplorerMeta) {
        el.traceExplorerMeta.textContent = `${state.traceExplorerScopeFiltered && indexes ? "Current filtered result" : "All loaded logs"} · explicit trace IDs only${data.summary.truncated ? ` · showing ${data.summary.returned.toLocaleString()} of ${data.summary.traces.toLocaleString()} ranked traces` : ""}.`;
      }
      renderSummary(data);
      el.traceExplorerBody.replaceChildren();

      if (!data.rows.length) {
        const tr = doc.createElement("tr");
        const td = doc.createElement("td");
        td.colSpan = 8;
        td.className = "investigation-empty";
        td.textContent = "No explicit trace IDs were found in this scope.";
        tr.appendChild(td);
        el.traceExplorerBody.appendChild(tr);
        return;
      }

      data.rows.slice(0, MAX_ROWS).forEach((row) => el.traceExplorerBody.appendChild(renderRow(row)));
    }

    function toggleComparison(traceId) {
      const id = cleanTraceId(traceId);
      if (!id) return;
      const selection = selectedTraceIds();
      const existing = selection.indexOf(id);
      if (existing >= 0) selection.splice(existing, 1);
      else {
        if (selection.length >= 2) selection.shift();
        selection.push(id);
      }
      syncCompareButton();
      render(state.traceExplorerScopeFiltered);
    }

    function resolveSampleEntry({ sampleId = "", sampleIndex = NaN, traceId = "" } = {}) {
      const id = String(sampleId || "").trim();
      if (id) {
        const byId = state.entries?.find?.((entry) => entry?.id === id);
        if (byId) return byId;
      }
      if (Number.isInteger(sampleIndex)) {
        const byIndex = state.entries?.[sampleIndex];
        if (byIndex) return byIndex;
      }
      const trace = cleanTraceId(traceId);
      if (!trace) return null;
      return state.entries?.find?.((entry) => cleanTraceId(entry?.correlations?.trace) === trace) || null;
    }

    function openSample(button) {
      const traceId = cleanTraceId(button?.dataset?.traceExplorerId);
      const sampleIndex = Number(button?.dataset?.traceSampleIndex);
      const entry = resolveSampleEntry({ sampleId: button?.dataset?.traceSampleId, sampleIndex, traceId });
      close();
      if (!entry) {
        if (traceId) filterByCorrelation("trace", traceId);
        else toast("No trace sample is available.", "error");
        return;
      }
      selectEntry(entry.id);
      state.inspectorTab = "trace";
      renderInspector();
      entryRowIntoView(entry.globalIndex);
    }

    function onExplorerClick(event) {
      const compareButton = event.target?.closest?.("[data-trace-compare-id]");
      if (compareButton) {
        toggleComparison(compareButton.dataset.traceCompareId);
        return;
      }
      const openButton = event.target?.closest?.("[data-trace-explorer-id]");
      if (openButton) openSample(openButton);
    }

    function closeComparison() {
      if (!el.traceCompareDialog) return;
      if (typeof el.traceCompareDialog.close === "function" && el.traceCompareDialog.open) el.traceCompareDialog.close();
      else el.traceCompareDialog.removeAttribute("open");
    }

    function formatMetric(key, value) {
      if (key === "durationMs" || key === "avgSpanMs") return value === null ? "—" : formatDuration(value);
      if (key === "parentCoverage") return `${Math.round((value || 0) * 100)}%`;
      return Number(value || 0).toLocaleString();
    }

    function formatDelta(key, value) {
      if (value === null) return "—";
      if (key === "parentCoverage") return `${value >= 0 ? "+" : ""}${Math.round(value * 100)}pp`;
      if (key === "durationMs" || key === "avgSpanMs") return `${value >= 0 ? "+" : "-"}${formatDuration(Math.abs(value))}${value < 0 ? " faster" : ""}`;
      return `${value >= 0 ? "+" : ""}${Number(value).toLocaleString()}`;
    }

    function renderComparison(result) {
      if (!el.traceCompareBody) return;
      el.traceCompareBody.replaceChildren();
      const metrics = [["Entries", "entries"], ["Spans", "spans"], ["Services", "serviceCount"], ["Errors", "errors"], ["Warnings", "warnings"], ["Span events", "events"], ["Trace duration", "durationMs"], ["Avg span", "avgSpanMs"], ["Parent coverage", "parentCoverage"]];

      const header = doc.createElement("div");
      header.className = "trace-compare-summary";
      [result.left, result.right].forEach((side, index) => {
        const card = doc.createElement("article");
        const title = doc.createElement("strong");
        title.textContent = index ? "Trace B" : "Trace A";
        const code = doc.createElement("code");
        code.textContent = side.traceId;
        const small = doc.createElement("small");
        small.textContent = side.services.join(", ") || "No service labels";
        card.append(title, code, small);
        header.appendChild(card);
      });
      el.traceCompareBody.appendChild(header);

      const table = doc.createElement("div");
      table.className = "trace-compare-metrics";
      metrics.forEach(([label, key]) => {
        const row = doc.createElement("div");
        const metricLabel = doc.createElement("strong");
        metricLabel.textContent = label;
        const left = doc.createElement("span");
        left.textContent = formatMetric(key, result.left[key]);
        const right = doc.createElement("span");
        right.textContent = formatMetric(key, result.right[key]);
        const delta = doc.createElement("span");
        delta.textContent = formatDelta(key, result.delta[key]);
        const deltaValue = result.delta[key];
        delta.className = deltaValue > 0 ? "delta-positive" : deltaValue < 0 ? "delta-negative" : "";
        row.append(metricLabel, left, right, delta);
        table.appendChild(row);
      });
      el.traceCompareBody.appendChild(table);

      const services = doc.createElement("section");
      services.className = "trace-compare-services";
      const title = doc.createElement("strong");
      title.textContent = "Service set difference";
      const copy = doc.createElement("p");
      copy.textContent = `Shared: ${result.services.shared.join(", ") || "—"} · Only A: ${result.services.leftOnly.join(", ") || "—"} · Only B: ${result.services.rightOnly.join(", ") || "—"}`;
      services.append(title, copy);
      el.traceCompareBody.appendChild(services);
    }

    function openComparison() {
      if (!el.traceCompareDialog || selectedTraceIds().length !== 2) return;
      try {
        const [left, right] = selectedTraceIds();
        const result = root.SignalDockTraceCompare.compare(state.entries, left, right);
        renderComparison(result);
        closeCompetingDialogs("traceCompareDialog");
        showDialogSafely(el.traceCompareDialog);
      } catch (error) {
        toast(error.message || String(error), "error", 6500);
      }
    }

    function refresh() {
      reconcileSelection(state.traceExplorerData);
      if (el.traceExplorerDialog?.open) render(state.traceExplorerScopeFiltered);
      if (el.traceCompareDialog?.open && selectedTraceIds().length === 2) openComparison();
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(el.closeTraceExplorerButton, "click", close);
      listen(el.traceExplorerResetButton, "click", resetScope);
      listen(el.traceExplorerBody, "click", onExplorerClick);
      listen(el.traceCompareButton, "click", openComparison);
      listen(el.closeTraceCompareButton, "click", closeComparison);
      syncCompareButton();
    }

    function destroy() {
      listeners.splice(0).forEach(([node, type, handler]) => node.removeEventListener(type, handler));
      bound = false;
    }

    return {
      open,
      close,
      render,
      refresh,
      resetScope,
      reconcileSelection,
      resolveSampleEntry,
      toggleComparison,
      openComparison,
      closeComparison,
      renderComparison,
      bind,
      destroy
    };
  }

  root.SignalDockTraceExplorerController = Object.freeze({ VERSION, create, cleanTraceId });
}(typeof self !== "undefined" ? self : window));
