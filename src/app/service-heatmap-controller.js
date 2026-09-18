(function (root) {
  "use strict";

  const VERSION = 1;
  const DEFAULT_BUCKET_COUNT = 12;
  const MAX_RENDER_ROWS = 250;

  function selectScope(entries, filteredIndexes, useFiltered) {
    const source = Array.isArray(entries) ? entries : [];
    const indexes = Array.isArray(filteredIndexes) ? filteredIndexes : [];
    const filtered = Boolean(useFiltered) && indexes.length < source.length;
    return { filtered, indexes: filtered ? indexes : null };
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

    if (!state || !Array.isArray(state.entries)) throw new Error("Service Heatmap controller requires application state.");

    function close() {
      const dialog = el.serviceHeatmapDialog;
      if (!dialog) return;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute?.("open");
      setActiveNav("logs");
    }

    function render(useFiltered = state.serviceHeatmapScopeFiltered) {
      if (!root.SignalDockServiceHeatmap || !el.serviceHeatmapBody) return null;
      state.serviceHeatmapScopeFiltered = Boolean(useFiltered);
      const scope = selectScope(state.entries, state.filteredIndexes, state.serviceHeatmapScopeFiltered);
      const data = scope.filtered
        ? root.SignalDockServiceHeatmap.build(state.entries, scope.indexes, { bucketCount: DEFAULT_BUCKET_COUNT })
        : (state.serviceHeatmapData || root.SignalDockServiceHeatmap.build(state.entries, null, { bucketCount: DEFAULT_BUCKET_COUNT }));
      const document = el.serviceHeatmapBody.ownerDocument;

      if (el.serviceHeatmapMeta) {
        el.serviceHeatmapMeta.textContent = `${scope.filtered ? "Current filtered result" : "All loaded logs"} · ${data.buckets.length} real-time buckets · explicit parent-span edges only.`;
      }
      if (el.serviceHeatmapSummary) {
        el.serviceHeatmapSummary.replaceChildren();
        [["Edges", data.summary.edges], ["Calls", data.summary.calls], ["Errors", data.summary.errors], ["Timed calls", data.summary.timedCalls], ["Buckets", data.buckets.length]].forEach(([label, value]) => {
          const item = document.createElement("div");
          const strong = document.createElement("strong");
          strong.textContent = Number(value).toLocaleString();
          const span = document.createElement("span");
          span.textContent = label;
          item.append(strong, span);
          el.serviceHeatmapSummary.appendChild(item);
        });
      }

      el.serviceHeatmapBody.replaceChildren();
      if (!data.rows.length) {
        const empty = document.createElement("div");
        empty.className = "investigation-empty";
        empty.textContent = scope.filtered && !scope.indexes.length
          ? "No log entries match the current filters."
          : "No timestamped cross-service parent-span edges were found in this scope.";
        el.serviceHeatmapBody.appendChild(empty);
        return data;
      }

      const scale = document.createElement("div");
      scale.className = "dependency-heatmap-scale";
      const scaleLabel = document.createElement("span");
      scaleLabel.textContent = "Time window";
      const scaleRange = document.createElement("strong");
      scaleRange.textContent = `${new Date(data.summary.startMs).toLocaleString()} → ${new Date(data.summary.endMs).toLocaleString()} · ${data.buckets.length} buckets`;
      scale.append(scaleLabel, scaleRange);
      el.serviceHeatmapBody.appendChild(scale);

      const maxCalls = Math.max(1, ...data.rows.flatMap((row) => row.buckets.map((bucket) => bucket.calls)));
      data.rows.slice(0, MAX_RENDER_ROWS).forEach((row) => {
        const line = document.createElement("div");
        line.className = "dependency-heatmap-row";

        const label = document.createElement("button");
        label.type = "button";
        label.className = "dependency-heatmap-label";
        label.dataset.heatmapService = row.target;
        label.setAttribute("aria-label", `Filter to target service ${row.target} from ${row.source}`);
        const strong = document.createElement("strong");
        strong.textContent = `${row.source} → ${row.target}`;
        const small = document.createElement("small");
        small.textContent = `${row.calls.toLocaleString()} calls · ${row.errors.toLocaleString()} errors`;
        label.append(strong, small);

        const cells = document.createElement("div");
        cells.className = "dependency-heatmap-cells";
        row.buckets.forEach((bucket, index) => {
          const bucketMeta = data.buckets[index];
          const bucketStart = new Date(bucketMeta.startMs).toLocaleString();
          const cell = document.createElement("button");
          cell.type = "button";
          cell.className = "dependency-heatmap-cell";
          const intensity = bucket.calls ? Math.max(0.12, bucket.calls / maxCalls) : 0;
          const heatLevel = bucket.calls ? Math.max(1, Math.min(5, Math.ceil(intensity * 5))) : 0;
          if (heatLevel) cell.classList.add(`heat-${heatLevel}`);
          cell.classList.toggle("has-error", bucket.errors > 0);
          cell.title = `${bucketStart} · ${bucket.calls} calls · ${bucket.errors} errors${bucket.p95Ms === null ? "" : ` · p95 ${formatDuration(bucket.p95Ms)}`}`;
          cell.dataset.heatmapService = row.target;
          cell.setAttribute("aria-label", `Filter to target service ${row.target} at ${bucketStart}; ${bucket.calls} calls, ${bucket.errors} errors${bucket.p95Ms === null ? "" : `, p95 ${formatDuration(bucket.p95Ms)}`}`);
          cells.appendChild(cell);
        });
        line.append(label, cells);
        el.serviceHeatmapBody.appendChild(line);
      });

      if (data.rows.length > MAX_RENDER_ROWS) {
        const note = document.createElement("p");
        note.className = "correlation-meta";
        note.textContent = `Showing ${MAX_RENDER_ROWS.toLocaleString()} of ${data.rows.length.toLocaleString()} dependency edges.`;
        el.serviceHeatmapBody.appendChild(note);
      }
      return data;
    }

    function open() {
      if (!root.SignalDockServiceHeatmap || !el.serviceHeatmapDialog) return false;
      if (!state.entries.length) {
        toast("Load trace/span data before opening the dependency heatmap.");
        return false;
      }
      state.serviceHeatmapScopeFiltered = true;
      render(true);
      closeCompetingDialogs("serviceHeatmapDialog");
      showDialogSafely(el.serviceHeatmapDialog);
      return true;
    }

    function onBodyClick(event) {
      const button = event.target.closest?.("[data-heatmap-service]");
      if (!button) return;
      const service = String(button.dataset.heatmapService || "").trim();
      close();
      if (service) filterByServiceValue(service);
    }

    function onReset() {
      state.serviceHeatmapScopeFiltered = false;
      render(false);
    }

    function bind() {
      if (bound) return;
      bound = true;
      el.closeServiceHeatmapButton?.addEventListener("click", close);
      el.serviceHeatmapResetButton?.addEventListener("click", onReset);
      el.serviceHeatmapBody?.addEventListener("click", onBodyClick);
    }

    function destroy() {
      if (!bound) return;
      bound = false;
      el.closeServiceHeatmapButton?.removeEventListener("click", close);
      el.serviceHeatmapResetButton?.removeEventListener("click", onReset);
      el.serviceHeatmapBody?.removeEventListener("click", onBodyClick);
    }

    return Object.freeze({ open, close, render, bind, destroy });
  }

  root.SignalDockServiceHeatmapController = Object.freeze({ VERSION, DEFAULT_BUCKET_COUNT, MAX_RENDER_ROWS, selectScope, create });
}(typeof self !== "undefined" ? self : window));
