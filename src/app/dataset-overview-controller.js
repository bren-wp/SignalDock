(function (root) {
  "use strict";

  const VERSION = 1;
  const TIMELINE_BUCKETS = 36;
  const TIMELINE_SEGMENTS = 8;

  function create(options = {}) {
    const {
      state,
      el,
      ownerDocument = el?.timelineBars?.ownerDocument || root.document,
      getSources,
      formatBytes,
      shortSource,
      formatTimelineTime
    } = options;

    if (!state || !el || !ownerDocument) throw new Error("Dataset Overview controller requires state, elements and document.");
    const required = { getSources, formatBytes, shortSource, formatTimelineTime };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== "function") throw new Error(`Dataset Overview controller requires ${name}().`);
    }

    let bound = false;

    function setText(node, value) {
      if (node) node.textContent = String(value);
    }

    function updateStats() {
      const summary = state.summary || {};
      const total = Number(summary.total) || 0;
      const errors = Number(summary.errors) || 0;
      const warnings = Number(summary.warnings) || 0;
      const sources = Array.isArray(summary.sources) ? summary.sources : [];

      setText(el.metricEntries, total.toLocaleString());
      setText(el.metricErrors, errors.toLocaleString());
      setText(el.metricWarnings, warnings.toLocaleString());
      setText(el.metricSources, sources.length.toLocaleString());
      setText(el.chipErrors, errors.toLocaleString());
      setText(el.chipWarnings, warnings.toLocaleString());
      setText(el.navLogCount, total ? total.toLocaleString() : "0");
      setText(el.serviceMapCount, (summary.services || []).length.toLocaleString());
      setText(el.serviceMatrixCount, (state.serviceMatrixData?.rows?.length || 0).toLocaleString());
      setText(el.serviceHeatmapCount, (state.serviceHeatmapData?.rows?.length || 0).toLocaleString());
      setText(el.serviceTrendsCount, (state.serviceTrendsData?.summary?.changed || 0).toLocaleString());
      setText(el.traceExplorerCount, (state.traceExplorerData?.summary?.traces || state.traceExplorerData?.rows?.length || 0).toLocaleString());
      setText(el.traceOutlierCount, (state.traceOutlierData?.rows?.length || 0).toLocaleString());
      setText(el.investigationCount, (state.investigation?.items?.length || 0).toLocaleString());
      setText(el.exceptionGroupCount, (state.exceptionGroups?.length || 0).toLocaleString());

      const health = state.healthData?.summary || {};
      setText(el.healthIssueCount, ((health.critical || 0) + (health.degraded || 0)).toLocaleString());

      if (el.loadedMeta) {
        el.loadedMeta.textContent = total
          ? `${state.inputFileCount} file${state.inputFileCount === 1 ? "" : "s"} · ${formatBytes(state.loadedBytes)}`
          : "No files loaded";
      }
    }

    function createSourceButton(source, count) {
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.className = "source-button";
      button.dataset.source = source;
      button.setAttribute("aria-pressed", "false");

      const dot = ownerDocument.createElement("span");
      dot.className = "source-dot";
      dot.setAttribute("aria-hidden", "true");

      const name = ownerDocument.createElement("span");
      name.textContent = shortSource(source);
      name.title = source;

      const countNode = ownerDocument.createElement("em");
      countNode.textContent = Math.max(0, Number(count) || 0).toLocaleString();

      button.append(dot, name, countNode);
      return button;
    }

    function createSourceTab(source, label) {
      const tab = ownerDocument.createElement("button");
      tab.type = "button";
      tab.className = "file-tab";
      tab.dataset.source = source;
      tab.textContent = label;
      tab.setAttribute("aria-pressed", "false");
      if (source) tab.title = source;
      return tab;
    }

    function renderSourceNavigation() {
      const sources = Array.from(getSources() || []);
      el.sourceList?.replaceChildren();
      el.fileTabs?.replaceChildren();

      if (el.fileTabs) el.fileTabs.appendChild(createSourceTab("", "All logs"));

      if (!sources.length) {
        if (el.sourceList) {
          const empty = ownerDocument.createElement("div");
          empty.className = "sidebar-empty";
          empty.textContent = "No files loaded";
          el.sourceList.appendChild(empty);
        }
        updateActiveSourceUI();
        return;
      }

      const counts = state.summary?.sourceCounts || new Map();
      const sourceFragment = ownerDocument.createDocumentFragment();
      const tabFragment = ownerDocument.createDocumentFragment();

      for (const source of sources) {
        sourceFragment.appendChild(createSourceButton(source, counts.get(source)));
        tabFragment.appendChild(createSourceTab(source, shortSource(source)));
      }

      el.sourceList?.appendChild(sourceFragment);
      el.fileTabs?.appendChild(tabFragment);
      updateActiveSourceUI();
    }

    function updateActiveSourceUI() {
      const source = el.sourceFilter?.value || "";
      const nodes = ownerDocument.querySelectorAll?.(".source-button[data-source], .file-tab[data-source]") || [];
      for (const button of nodes) {
        const active = button.dataset.source === source;
        button.classList?.toggle?.("is-active", active);
        button.setAttribute?.("aria-pressed", active ? "true" : "false");
      }
    }

    function renderTimeline() {
      if (!el.timelineBars) return;
      el.timelineBars.replaceChildren();

      const filteredIndexes = state.filteredIndexes || [];
      let timestampedCount = 0;
      let min = null;
      let max = null;

      for (const index of filteredIndexes) {
        const entry = state.entries?.[index];
        if (!entry || !Number.isFinite(entry.timestampMs)) continue;
        timestampedCount += 1;
        min = min === null ? entry.timestampMs : Math.min(min, entry.timestampMs);
        max = max === null ? entry.timestampMs : Math.max(max, entry.timestampMs);
      }

      if (!timestampedCount || min === null || max === null) {
        const empty = ownerDocument.createElement("div");
        empty.className = "timeline-empty";
        empty.textContent = state.entries?.length
          ? "No timestamps detected in the current result set."
          : "Load timestamped logs to see activity over time.";
        el.timelineBars.appendChild(empty);
        setText(el.timelineStart, "—");
        setText(el.timelineEnd, "—");
        setText(el.timelineTitle, filteredIndexes.length === (state.entries || []).length ? "All activity" : "Filtered activity");
        setText(el.timelineMeta, `${filteredIndexes.length.toLocaleString()} results · ${state.lastEngine || "idle"}`);
        return;
      }

      const span = Math.max(1, max - min);
      const buckets = Array.from({ length: TIMELINE_BUCKETS }, () => ({ count: 0, errors: 0, warnings: 0 }));
      for (const index of filteredIndexes) {
        const entry = state.entries?.[index];
        if (!entry || !Number.isFinite(entry.timestampMs)) continue;
        const bucketIndex = Math.min(
          TIMELINE_BUCKETS - 1,
          Math.floor(((entry.timestampMs - min) / span) * TIMELINE_BUCKETS)
        );
        const bucket = buckets[bucketIndex];
        bucket.count += 1;
        if (entry.level === "ERROR" || entry.level === "FATAL") bucket.errors += 1;
        else if (entry.level === "WARN") bucket.warnings += 1;
      }

      const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
      const fragment = ownerDocument.createDocumentFragment();

      buckets.forEach((bucket, index) => {
        const bar = ownerDocument.createElement("div");
        bar.className = `timeline-bar${bucket.errors ? " has-error" : bucket.warnings ? " has-warn" : ""}`;
        bar.title = `${bucket.count.toLocaleString()} entries${bucket.errors ? ` · ${bucket.errors} errors` : ""}${bucket.warnings ? ` · ${bucket.warnings} warnings` : ""}`;
        bar.setAttribute("aria-label", bar.title);

        const activeSegments = bucket.count
          ? Math.max(1, Math.round((bucket.count / maxCount) * TIMELINE_SEGMENTS))
          : 0;

        for (let segment = 0; segment < TIMELINE_SEGMENTS; segment += 1) {
          const cell = ownerDocument.createElement("i");
          cell.className = `timeline-segment${segment < activeSegments ? " is-on" : ""}`;
          cell.setAttribute("aria-hidden", "true");
          bar.appendChild(cell);
        }

        if (index === TIMELINE_BUCKETS - 1) bar.classList.add("is-last");
        fragment.appendChild(bar);
      });

      el.timelineBars.appendChild(fragment);
      setText(el.timelineStart, formatTimelineTime(min));
      setText(el.timelineEnd, formatTimelineTime(max));
      setText(el.timelineTitle, filteredIndexes.length === (state.entries || []).length ? "All activity" : "Filtered activity");
      setText(el.timelineMeta, `${timestampedCount.toLocaleString()} timestamped · ${filteredIndexes.length.toLocaleString()} results · ${state.lastEngine || "idle"}`);
    }

    function bind() {
      if (bound) return;
      bound = true;
    }

    function destroy() {
      bound = false;
    }

    return Object.freeze({
      VERSION,
      bind,
      destroy,
      updateStats,
      renderSourceNavigation,
      updateActiveSourceUI,
      renderTimeline
    });
  }

  root.SignalDockDatasetOverviewController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
