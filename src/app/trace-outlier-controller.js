(function (root) {
  "use strict";

  const VERSION = 1;

  function cleanTraceId(value) {
    return String(value || "").trim();
  }

  function selectScope(entries, filteredIndexes, useFiltered) {
    const source = Array.isArray(entries) ? entries : [];
    const indexes = Array.isArray(filteredIndexes) ? filteredIndexes : [];
    const filtered = Boolean(useFiltered) && indexes.length < source.length;
    if (!filtered) return { entries: source, indexes: null, filtered: false };
    return {
      entries: indexes.map((index) => source[index]).filter(Boolean),
      indexes: [...indexes],
      filtered: true
    };
  }

  function buildSampleLookup(entries, indexes = null) {
    const source = Array.isArray(entries) ? entries : [];
    const selected = Array.isArray(indexes) ? indexes : null;
    const lookup = new Map();
    const capture = (entry, index) => {
      if (!entry) return;
      const traceId = cleanTraceId(entry?.correlations?.trace);
      if (!traceId || lookup.has(traceId)) return;
      lookup.set(traceId, { entryId: String(entry.id || ""), index });
    };
    if (selected) selected.forEach((index) => capture(source[index], index));
    else source.forEach((entry, index) => capture(entry, index));
    return lookup;
  }

  function resolveSampleEntry(entries, sample = {}) {
    const source = Array.isArray(entries) ? entries : [];
    const entryId = String(sample.entryId || "");
    if (entryId) {
      const byId = source.find((entry) => String(entry?.id || "") === entryId);
      if (byId) return byId;
    }
    const index = Number(sample.index);
    if (Number.isInteger(index) && source[index]) return source[index];
    const traceId = cleanTraceId(sample.traceId);
    return traceId ? source.find((entry) => cleanTraceId(entry?.correlations?.trace) === traceId) || null : null;
  }

  function create(options = {}) {
    const state = options.state;
    const el = options.el || {};
    const formatDuration = options.formatDuration || ((value) => String(value ?? "—"));
    const toast = options.toast || (() => {});
    const applyTraceFilter = options.applyTraceFilter || (() => {});
    const selectEntry = options.selectEntry || (() => {});
    const renderInspector = options.renderInspector || (() => {});
    const closeCompetingDialogs = options.closeCompetingDialogs || (() => {});
    const showDialogSafely = options.showDialogSafely || (() => false);
    const setActiveNav = options.setActiveNav || (() => {});
    const defer = options.defer || ((callback) => root.setTimeout ? root.setTimeout(callback, 0) : callback());
    let bound = false;

    if (!state || !Array.isArray(state.entries)) throw new Error("Trace Outliers controller requires application state.");

    function close() {
      const dialog = el.traceOutlierDialog;
      if (!dialog) return;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute?.("open");
      setActiveNav("logs");
    }

    function render(useFiltered = state.traceOutlierScopeFiltered) {
      if (!root.SignalDockTraceOutliers || !el.traceOutlierBody) return null;
      state.traceOutlierScopeFiltered = Boolean(useFiltered);
      const scope = selectScope(state.entries, state.filteredIndexes, state.traceOutlierScopeFiltered);
      const data = scope.filtered
        ? root.SignalDockTraceOutliers.rank(scope.entries, { limit: 250 })
        : (state.traceOutlierData || root.SignalDockTraceOutliers.rank(state.entries, { limit: 250 }));
      const samples = buildSampleLookup(state.entries, scope.indexes);

      if (el.traceOutlierMeta) {
        el.traceOutlierMeta.textContent = `${scope.filtered ? "Current filtered result" : "All loaded logs"} · robust duration baseline + explicit errors/service breadth.`;
      }
      if (el.traceOutlierSummary) {
        el.traceOutlierSummary.replaceChildren();
        [["Traces", data.totalTraces], ["Ranked", data.rows.length], ["Timed", data.baseline.timedTraces], ["Median duration", data.baseline.medianDurationMs === null ? "—" : formatDuration(data.baseline.medianDurationMs)]].forEach(([label, value]) => {
          const item = el.traceOutlierSummary.ownerDocument.createElement("div");
          const strong = el.traceOutlierSummary.ownerDocument.createElement("strong");
          strong.textContent = typeof value === "number" ? value.toLocaleString() : String(value);
          const span = el.traceOutlierSummary.ownerDocument.createElement("span");
          span.textContent = label;
          item.append(strong, span);
          el.traceOutlierSummary.appendChild(item);
        });
      }

      const document = el.traceOutlierBody.ownerDocument;
      el.traceOutlierBody.replaceChildren();
      if (!data.rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 7;
        td.className = "investigation-empty";
        td.textContent = scope.filtered && !scope.entries.length
          ? "No trace entries match the current filters."
          : "No trace has enough measured latency/error signal to rank as an outlier in this scope.";
        tr.appendChild(td);
        el.traceOutlierBody.appendChild(tr);
        return data;
      }

      data.rows.forEach((row) => {
        const tr = document.createElement("tr");
        const id = document.createElement("td");
        const code = document.createElement("code");
        code.textContent = row.traceId;
        code.title = row.traceId;
        id.appendChild(code);
        const score = document.createElement("td");
        score.className = "trace-outlier-score";
        score.textContent = row.score.toFixed(2);
        const duration = document.createElement("td");
        duration.textContent = row.durationMs === null ? "—" : formatDuration(row.durationMs);
        const errors = document.createElement("td");
        errors.textContent = row.errors.toLocaleString();
        if (row.errors) errors.className = "matrix-error";
        const services = document.createElement("td");
        services.textContent = `${row.serviceCount} · ${row.services.slice(0, 3).join(", ")}${row.services.length > 3 ? ` +${row.services.length - 3}` : ""}`;
        const reasons = document.createElement("td");
        reasons.className = "trace-outlier-reasons";
        (row.reasons.length ? row.reasons : ["ranked by measured trace shape"]).forEach((reason) => {
          const tag = document.createElement("span");
          tag.textContent = reason;
          reasons.appendChild(tag);
        });
        const action = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button--primary button--small";
        button.dataset.outlierTrace = row.traceId;
        const sample = samples.get(row.traceId);
        if (sample?.entryId) button.dataset.outlierSampleId = sample.entryId;
        if (Number.isInteger(sample?.index)) button.dataset.outlierSampleIndex = String(sample.index);
        button.textContent = "Open trace";
        button.setAttribute("aria-label", `Open trace ${row.traceId}`);
        action.appendChild(button);
        tr.append(id, score, duration, errors, services, reasons, action);
        el.traceOutlierBody.appendChild(tr);
      });
      return data;
    }

    function open() {
      if (!root.SignalDockTraceOutliers || !el.traceOutlierDialog) return false;
      if (!state.entries.length) {
        toast("Load trace/span data before ranking outliers.");
        return false;
      }
      state.traceOutlierScopeFiltered = true;
      render(true);
      closeCompetingDialogs("traceOutlierDialog");
      showDialogSafely(el.traceOutlierDialog);
      return true;
    }

    function onBodyClick(event) {
      const button = event.target.closest?.("[data-outlier-trace]");
      if (!button) return;
      const traceId = cleanTraceId(button.dataset.outlierTrace);
      const sample = resolveSampleEntry(state.entries, {
        entryId: button.dataset.outlierSampleId,
        index: button.dataset.outlierSampleIndex,
        traceId
      });
      close();
      if (!traceId) return;
      applyTraceFilter(traceId);
      if (!sample) return;
      selectEntry(sample.id);
      defer(() => {
        state.inspectorTab = "trace";
        renderInspector();
      });
    }

    function onReset() {
      state.traceOutlierScopeFiltered = false;
      render(false);
    }

    function bind() {
      if (bound) return;
      bound = true;
      el.closeTraceOutlierButton?.addEventListener("click", close);
      el.traceOutlierResetButton?.addEventListener("click", onReset);
      el.traceOutlierBody?.addEventListener("click", onBodyClick);
    }

    function destroy() {
      if (!bound) return;
      bound = false;
      el.closeTraceOutlierButton?.removeEventListener("click", close);
      el.traceOutlierResetButton?.removeEventListener("click", onReset);
      el.traceOutlierBody?.removeEventListener("click", onBodyClick);
    }

    return Object.freeze({ open, close, render, bind, destroy, resolveSampleEntry: (sample) => resolveSampleEntry(state.entries, sample) });
  }

  root.SignalDockTraceOutlierController = Object.freeze({ VERSION, cleanTraceId, selectScope, buildSampleLookup, resolveSampleEntry, create });
}(typeof self !== "undefined" ? self : window));
