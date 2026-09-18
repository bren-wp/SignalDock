(function (root) {
  "use strict";

  const VERSION = 1;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const WIDTH = 920;
  const HEIGHT = 500;

  function normalizeGroupBy(value) {
    const modes = root.SignalDockServiceMap?.GROUP_MODES || ["service"];
    return modes.includes(value) ? value : "service";
  }

  function create(options = {}) {
    const state = options.state;
    const el = options.el || {};
    const formatDuration = options.formatDuration || ((value) => String(value ?? "—"));
    const toast = options.toast || (() => {});
    const applyMapNodeFilter = options.applyMapNodeFilter || (() => {});
    const closeCompetingDialogs = options.closeCompetingDialogs || (() => {});
    const showDialogSafely = options.showDialogSafely || (() => false);
    const setActiveNav = options.setActiveNav || (() => {});
    const recordPerformance = options.recordPerformance || (() => {});
    let bound = false;
    let scopeFiltered = true;

    if (!state || !Array.isArray(state.entries)) throw new Error("Service Map controller requires application state.");

    function close() {
      const dialog = el.serviceMapDialog;
      if (!dialog) return;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute?.("open");
      setActiveNav("logs");
    }

    function scopeIndexes() {
      if (!scopeFiltered) return null;
      return Array.isArray(state.filteredIndexes) ? state.filteredIndexes : [];
    }

    function appendSummary(document, graph) {
      const items = [
        [state.serviceMapGroupBy === "service" ? "Services" : "Groups", state.serviceMapGroupBy === "service" ? graph.stats.services : graph.stats.groups],
        ["Explicit edges", graph.stats.edges],
        ["Traces", graph.stats.traces],
        ["Result entries", graph.stats.entries]
      ];
      items.forEach(([label, value]) => {
        const item = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = Number(value || 0).toLocaleString();
        const span = document.createElement("span");
        span.textContent = label;
        item.append(strong, span);
        el.serviceMapSummary.appendChild(item);
      });
    }

    function appendSvg(document, graph, layout) {
      const defs = document.createElementNS(SVG_NS, "defs");
      const marker = document.createElementNS(SVG_NS, "marker");
      marker.setAttribute("id", "serviceArrow");
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "8");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", "auto-start-reverse");
      const arrow = document.createElementNS(SVG_NS, "path");
      arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      arrow.setAttribute("class", "service-map-arrow");
      marker.appendChild(arrow);
      defs.appendChild(marker);
      el.serviceMapCanvas.appendChild(defs);

      layout.edges.forEach((edge) => {
        const line = document.createElementNS(SVG_NS, "line");
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / distance;
        const uy = dy / distance;
        line.setAttribute("x1", String(edge.source.x + ux * (edge.source.radius + 4)));
        line.setAttribute("y1", String(edge.source.y + uy * (edge.source.radius + 4)));
        line.setAttribute("x2", String(edge.target.x - ux * (edge.target.radius + 8)));
        line.setAttribute("y2", String(edge.target.y - uy * (edge.target.radius + 8)));
        line.setAttribute("class", `service-map-edge${edge.errors ? " has-errors" : ""}`);
        line.setAttribute("marker-end", "url(#serviceArrow)");
        line.setAttribute("stroke-width", String(Math.min(5, 1.2 + Math.log2(edge.count + 1))));
        const title = document.createElementNS(SVG_NS, "title");
        title.textContent = `${edge.from} → ${edge.to} · ${edge.count} span${edge.count === 1 ? "" : "s"}${edge.errors ? ` · ${edge.errors} errors` : ""}`;
        line.appendChild(title);
        el.serviceMapCanvas.appendChild(line);
      });

      layout.nodes.forEach((node) => {
        const group = document.createElementNS(SVG_NS, "g");
        group.setAttribute("class", `service-map-node${node.errors ? " has-errors" : ""}`);
        group.dataset.mapService = node.value || node.id;
        group.dataset.mapKind = node.kind || "service";
        group.dataset.mapScopeKind = node.scopeKind || "";
        group.dataset.mapScopeValue = node.scopeValue || "";
        group.setAttribute("role", "button");
        group.setAttribute("tabindex", "0");
        const accessible = `${node.label} · ${node.entries} entries · ${node.traces} traces${node.errors ? ` · ${node.errors} errors` : ""}`;
        group.setAttribute("aria-label", `Filter topology to ${accessible}`);
        const circle = document.createElementNS(SVG_NS, "circle");
        circle.setAttribute("cx", String(node.x));
        circle.setAttribute("cy", String(node.y));
        circle.setAttribute("r", String(node.radius));
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", String(node.x));
        text.setAttribute("y", String(node.y + node.radius + 17));
        text.setAttribute("text-anchor", "middle");
        text.textContent = node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label;
        const count = document.createElementNS(SVG_NS, "text");
        count.setAttribute("x", String(node.x));
        count.setAttribute("y", String(node.y + 4));
        count.setAttribute("text-anchor", "middle");
        count.setAttribute("class", "service-map-node-count");
        count.textContent = node.entries.toLocaleString();
        const title = document.createElementNS(SVG_NS, "title");
        title.textContent = accessible;
        group.append(circle, count, text, title);
        el.serviceMapCanvas.appendChild(group);
      });
    }

    function appendList(document, graph) {
      if (!graph.nodes.length) {
        const empty = document.createElement("div");
        empty.className = "investigation-empty";
        empty.textContent = scopeFiltered && !state.filteredIndexes.length
          ? "No log entries match the current filters."
          : "No service topology nodes were found in this scope.";
        el.serviceMapList.appendChild(empty);
        return;
      }
      graph.nodes.forEach((node) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `service-map-item${node.errors ? " has-errors" : ""}`;
        button.dataset.mapService = node.value || node.id;
        button.dataset.mapKind = node.kind || "service";
        button.dataset.mapScopeKind = node.scopeKind || "";
        button.dataset.mapScopeValue = node.scopeValue || "";
        button.setAttribute("aria-label", `Filter topology to ${node.label}`);
        const name = document.createElement("strong");
        name.textContent = node.label;
        name.title = node.label;
        const meta = document.createElement("span");
        meta.textContent = `${node.entries.toLocaleString()} entries · ${node.traces.toLocaleString()} traces${node.errors ? ` · ${node.errors} errors` : ""}${node.durationMs ? ` · ${formatDuration(node.durationMs)}` : ""}`;
        button.append(name, meta);
        el.serviceMapList.appendChild(button);
      });
    }

    function render(useFiltered = scopeFiltered) {
      if (!root.SignalDockServiceMap || !el.serviceMapCanvas || !el.serviceMapSummary || !el.serviceMapList) return null;
      scopeFiltered = Boolean(useFiltered);
      state.serviceMapGroupBy = normalizeGroupBy(state.serviceMapGroupBy);
      const indexes = scopeIndexes();
      const started = root.performance?.now?.() ?? Date.now();
      const graph = root.SignalDockServiceMap.build(state.entries, indexes, { groupBy: state.serviceMapGroupBy });
      const layout = root.SignalDockServiceMap.layout(graph, WIDTH, HEIGHT);
      state.serviceGraph = graph;
      const document = el.serviceMapCanvas.ownerDocument;
      el.serviceMapCanvas.replaceChildren();
      el.serviceMapSummary.replaceChildren();
      el.serviceMapList.replaceChildren();

      appendSummary(document, graph);
      const scopeLabel = scopeFiltered ? "Current result set" : "All loaded logs";
      if (el.serviceMapMeta) {
        el.serviceMapMeta.textContent = graph.stats.edges
          ? `${scopeLabel} · grouped by ${state.serviceMapGroupBy.replace(/-/g, " + ")} · ${graph.stats.visibleServices.toLocaleString()} visible group${graph.stats.visibleServices === 1 ? "" : "s"}${graph.stats.hiddenServices ? ` · ${graph.stats.hiddenServices} hidden by display cap` : ""}`
          : `No explicit cross-group parent-span relationships were found in ${scopeLabel.toLowerCase()} for this grouping.`;
      }
      appendSvg(document, graph, layout);
      appendList(document, graph);
      const elapsed = (root.performance?.now?.() ?? Date.now()) - started;
      recordPerformance("service-map", elapsed, { services: graph.stats.services, groups: graph.stats.groups, groupBy: state.serviceMapGroupBy, edges: graph.stats.edges, entries: graph.stats.entries });
      return graph;
    }

    function open() {
      if (!root.SignalDockServiceMap || !el.serviceMapDialog) return false;
      if (!state.entries.length) {
        toast("Load logs with service and trace/span metadata to build a service map.");
        return false;
      }
      scopeFiltered = true;
      state.serviceMapGroupBy = normalizeGroupBy(state.serviceMapGroupBy);
      if (el.serviceMapGroupBy) el.serviceMapGroupBy.value = state.serviceMapGroupBy;
      closeCompetingDialogs("serviceMapDialog");
      render(true);
      showDialogSafely(el.serviceMapDialog);
      return true;
    }

    function activateNode(node) {
      const dataset = node?.dataset || {};
      const value = String(dataset.mapService || "").trim();
      if (!value) return;
      close();
      applyMapNodeFilter({
        kind: String(dataset.mapKind || "service"),
        value,
        scopeKind: String(dataset.mapScopeKind || ""),
        scopeValue: String(dataset.mapScopeValue || "")
      });
    }

    function onNodeClick(event) {
      const node = event.target.closest?.("[data-map-service]");
      if (node) activateNode(node);
    }

    function onCanvasKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const node = event.target.closest?.("[data-map-service]");
      if (!node) return;
      event.preventDefault();
      activateNode(node);
    }

    function onReset() {
      scopeFiltered = false;
      render(false);
    }

    function onGroupByChange() {
      state.serviceMapGroupBy = normalizeGroupBy(el.serviceMapGroupBy?.value);
      if (el.serviceMapGroupBy) el.serviceMapGroupBy.value = state.serviceMapGroupBy;
      render(scopeFiltered);
    }

    function bind() {
      if (bound) return;
      bound = true;
      el.closeServiceMapButton?.addEventListener("click", close);
      el.serviceMapResetButton?.addEventListener("click", onReset);
      el.serviceMapGroupBy?.addEventListener("change", onGroupByChange);
      el.serviceMapList?.addEventListener("click", onNodeClick);
      el.serviceMapCanvas?.addEventListener("click", onNodeClick);
      el.serviceMapCanvas?.addEventListener("keydown", onCanvasKeydown);
    }

    function destroy() {
      if (!bound) return;
      bound = false;
      el.closeServiceMapButton?.removeEventListener("click", close);
      el.serviceMapResetButton?.removeEventListener("click", onReset);
      el.serviceMapGroupBy?.removeEventListener("change", onGroupByChange);
      el.serviceMapList?.removeEventListener("click", onNodeClick);
      el.serviceMapCanvas?.removeEventListener("click", onNodeClick);
      el.serviceMapCanvas?.removeEventListener("keydown", onCanvasKeydown);
    }

    return Object.freeze({ open, close, render, bind, destroy });
  }

  root.SignalDockServiceMapController = Object.freeze({ VERSION, WIDTH, HEIGHT, normalizeGroupBy, create });
}(typeof self !== "undefined" ? self : window));
