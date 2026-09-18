(function (root) {
  "use strict";

  const MAX_NODES = 24;
  const GROUP_MODES = ["service", "environment", "namespace", "environment-service", "namespace-service"];

  function serviceName(entry) {
    const service = String(entry?.service || "").trim();
    return service && service !== "—" ? service : "";
  }

  function dimension(entry, key) {
    return String(entry?.dimensions?.[key] || "").trim();
  }

  function nodeIdentity(entry, groupBy) {
    const service = serviceName(entry);
    const environment = dimension(entry, "environment");
    const namespace = dimension(entry, "namespace");
    if (groupBy === "environment") return environment ? { id: environment, label: environment, kind: "environment", value: environment } : null;
    if (groupBy === "namespace") return namespace ? { id: namespace, label: namespace, kind: "namespace", value: namespace } : null;
    if (groupBy === "environment-service") {
      if (!service) return null;
      const env = environment || "unscoped";
      return { id: `${env}/${service}`, label: `${env} / ${service}`, kind: "service", value: service, scopeKind: environment ? "environment" : "", scopeValue: environment };
    }
    if (groupBy === "namespace-service") {
      if (!service) return null;
      const ns = namespace || "unscoped";
      return { id: `${ns}/${service}`, label: `${ns} / ${service}`, kind: "service", value: service, scopeKind: namespace ? "namespace" : "", scopeValue: namespace };
    }
    return service ? { id: service, label: service, kind: "service", value: service } : null;
  }

  function compareNodeRank(a, b) {
    return b.entries - a.entries || b.errors - a.errors || a.id.localeCompare(b.id);
  }

  function selectTopNodes(values, limit = MAX_NODES) {
    const count = Math.max(0, Math.floor(Number(limit) || 0));
    if (!count) return [];
    const heap = [];

    function swap(left, right) {
      const value = heap[left];
      heap[left] = heap[right];
      heap[right] = value;
    }

    function siftUp(index) {
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (compareNodeRank(heap[parent], heap[index]) >= 0) break;
        swap(parent, index);
        index = parent;
      }
    }

    function siftDown(index) {
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let worst = index;
        if (left < heap.length && compareNodeRank(heap[left], heap[worst]) > 0) worst = left;
        if (right < heap.length && compareNodeRank(heap[right], heap[worst]) > 0) worst = right;
        if (worst === index) break;
        swap(index, worst);
        index = worst;
      }
    }

    for (const node of values) {
      if (heap.length < count) {
        heap.push(node);
        siftUp(heap.length - 1);
        continue;
      }
      if (compareNodeRank(node, heap[0]) >= 0) continue;
      heap[0] = node;
      siftDown(0);
    }
    return heap.sort(compareNodeRank);
  }

  function build(entries, indexes = null, options = {}) {
    const source = Array.isArray(entries) ? entries : [];
    const selectedIndexes = Array.isArray(indexes) ? indexes : null;
    const selectedCount = selectedIndexes ? selectedIndexes.length : source.length;
    const groupBy = GROUP_MODES.includes(options.groupBy) ? options.groupBy : "service";
    const eachEntry = (callback) => {
      if (selectedIndexes) {
        for (const index of selectedIndexes) {
          const entry = source[index];
          if (entry) callback(entry);
        }
        return;
      }
      for (const entry of source) if (entry) callback(entry);
    };

    const nodes = new Map();
    const spanMap = new Map();
    const traceIds = new Set();
    const services = new Set();
    const environments = new Set();
    const namespaces = new Set();

    eachEntry((entry) => {
      const identity = nodeIdentity(entry, groupBy);
      if (!identity) return;
      const current = nodes.get(identity.id) || { ...identity, entries: 0, errors: 0, warnings: 0, traces: new Set(), durationMs: 0, services: new Set() };
      current.entries += 1;
      if (entry.level === "ERROR" || entry.level === "FATAL") current.errors += 1;
      else if (entry.level === "WARN") current.warnings += 1;
      if (entry.correlations?.trace) {
        current.traces.add(entry.correlations.trace);
        traceIds.add(entry.correlations.trace);
      }
      const service = serviceName(entry);
      if (service) {
        current.services.add(service);
        services.add(service);
      }
      const environment = dimension(entry, "environment");
      const namespace = dimension(entry, "namespace");
      if (environment) environments.add(environment);
      if (namespace) namespaces.add(namespace);
      if (Number.isFinite(entry.traceMeta?.durationMs)) current.durationMs += entry.traceMeta.durationMs;
      nodes.set(identity.id, current);
      if (entry.correlations?.span) spanMap.set(entry.correlations.span, entry);
    });

    const edges = new Map();
    eachEntry((entry) => {
      const toIdentity = nodeIdentity(entry, groupBy);
      const parentSpan = entry.traceMeta?.parentSpan;
      if (!toIdentity || !parentSpan) return;
      const parent = spanMap.get(parentSpan);
      const fromIdentity = nodeIdentity(parent, groupBy);
      if (!fromIdentity || fromIdentity.id === toIdentity.id) return;
      const key = `${fromIdentity.id}\u0000${toIdentity.id}`;
      const current = edges.get(key) || { from: fromIdentity.id, to: toIdentity.id, count: 0, errors: 0, traces: new Set(), durationMs: 0 };
      current.count += 1;
      if (entry.level === "ERROR" || entry.level === "FATAL") current.errors += 1;
      if (entry.correlations?.trace) current.traces.add(entry.correlations.trace);
      if (Number.isFinite(entry.traceMeta?.durationMs)) current.durationMs += entry.traceMeta.durationMs;
      edges.set(key, current);
    });

    const normalizedNodes = selectTopNodes(nodes.values(), MAX_NODES)
      .map((node) => ({ ...node, traces: node.traces.size, services: node.services.size }));

    const retained = new Set(normalizedNodes.map((node) => node.id));
    const normalizedEdges = [...edges.values()]
      .filter((edge) => retained.has(edge.from) && retained.has(edge.to))
      .map((edge) => ({ ...edge, traces: edge.traces.size }))
      .sort((a, b) => b.count - a.count || b.errors - a.errors || a.from.localeCompare(b.from));

    return {
      groupBy,
      nodes: normalizedNodes,
      edges: normalizedEdges,
      stats: {
        services: services.size,
        groups: nodes.size,
        visibleServices: normalizedNodes.length,
        hiddenServices: Math.max(0, nodes.size - normalizedNodes.length),
        edges: normalizedEdges.length,
        traces: traceIds.size,
        environments: environments.size,
        namespaces: namespaces.size,
        entries: selectedCount
      }
    };
  }

  function layout(graph, width = 920, height = 500) {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    if (!nodes.length) return { nodes: [], edges: [], width, height };
    const cx = width / 2;
    const cy = height / 2;
    const rx = Math.max(120, width * 0.36);
    const ry = Math.max(90, height * 0.34);
    const positioned = nodes.map((node, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / nodes.length;
      const weight = Math.min(1, Math.log10(Math.max(1, node.entries)) / 5);
      return { ...node, x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry, radius: 16 + weight * 14 };
    });
    const byId = new Map(positioned.map((node) => [node.id, node]));
    const positionedEdges = (graph.edges || []).map((edge) => ({ ...edge, source: byId.get(edge.from), target: byId.get(edge.to) })).filter((edge) => edge.source && edge.target);
    return { nodes: positioned, edges: positionedEdges, width, height };
  }

  root.SignalDockServiceMap = { MAX_NODES, GROUP_MODES, build, layout, nodeIdentity };
}(typeof self !== "undefined" ? self : window));
