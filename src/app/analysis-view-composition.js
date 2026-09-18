(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      el,
      modules = {},
      actions = {}
    } = options;

    if (!state || !el) throw new Error("Analysis View composition requires state and elements.");

    const requiredModules = [
      "traceExplorer",
      "traceOutlier",
      "serviceMap",
      "serviceMatrix",
      "serviceHeatmap",
      "serviceTrends",
      "health"
    ];
    for (const name of requiredModules) {
      if (typeof modules[name]?.create !== "function") {
        throw new Error(`Analysis View composition requires modules.${name}.create().`);
      }
    }

    const requiredActions = [
      "formatDuration",
      "toast",
      "selectEntry",
      "renderInspector",
      "entryRowIntoView",
      "filterByCorrelation",
      "applyTraceFilter",
      "applyTopologyFilter",
      "filterByServiceValue",
      "closeCompetingDialogs",
      "showDialogSafely",
      "setActiveNav",
      "recordPerformance"
    ];
    for (const name of requiredActions) {
      if (typeof actions[name] !== "function") {
        throw new Error(`Analysis View composition requires actions.${name}().`);
      }
    }

    const instances = {
      traceExplorer: null,
      traceOutlier: null,
      serviceMap: null,
      serviceMatrix: null,
      serviceHeatmap: null,
      serviceTrends: null,
      health: null
    };

    function memo(name, factory) {
      if (!instances[name]) instances[name] = factory();
      return instances[name];
    }

    function createTraceExplorer() {
      return memo("traceExplorer", () => modules.traceExplorer.create({
        state,
        el,
        formatDuration: actions.formatDuration,
        toast: actions.toast,
        selectEntry: actions.selectEntry,
        renderInspector: actions.renderInspector,
        entryRowIntoView: actions.entryRowIntoView,
        filterByCorrelation: actions.filterByCorrelation,
        closeCompetingDialogs: actions.closeCompetingDialogs,
        showDialogSafely: actions.showDialogSafely,
        setActiveNav: actions.setActiveNav
      }));
    }

    function createTraceOutlier() {
      return memo("traceOutlier", () => modules.traceOutlier.create({
        state,
        el,
        formatDuration: actions.formatDuration,
        toast: actions.toast,
        applyTraceFilter: actions.applyTraceFilter,
        selectEntry: actions.selectEntry,
        renderInspector: actions.renderInspector,
        closeCompetingDialogs: actions.closeCompetingDialogs,
        showDialogSafely: actions.showDialogSafely,
        setActiveNav: actions.setActiveNav
      }));
    }

    function createServiceMap() {
      return memo("serviceMap", () => modules.serviceMap.create({
        state,
        el,
        formatDuration: actions.formatDuration,
        toast: actions.toast,
        applyMapNodeFilter: actions.applyTopologyFilter,
        closeCompetingDialogs: actions.closeCompetingDialogs,
        showDialogSafely: actions.showDialogSafely,
        setActiveNav: actions.setActiveNav,
        recordPerformance: actions.recordPerformance
      }));
    }

    function serviceOptions() {
      return {
        state,
        el,
        formatDuration: actions.formatDuration,
        toast: actions.toast,
        filterByServiceValue: actions.filterByServiceValue,
        closeCompetingDialogs: actions.closeCompetingDialogs,
        showDialogSafely: actions.showDialogSafely,
        setActiveNav: actions.setActiveNav
      };
    }

    function createServiceMatrix() {
      return memo("serviceMatrix", () => modules.serviceMatrix.create(serviceOptions()));
    }

    function createServiceHeatmap() {
      return memo("serviceHeatmap", () => modules.serviceHeatmap.create(serviceOptions()));
    }

    function createServiceTrends() {
      return memo("serviceTrends", () => modules.serviceTrends.create(serviceOptions()));
    }

    function createHealth() {
      return memo("health", () => modules.health.create(serviceOptions()));
    }

    return Object.freeze({
      VERSION,
      createTraceExplorer,
      createTraceOutlier,
      createServiceMap,
      createServiceMatrix,
      createServiceHeatmap,
      createServiceTrends,
      createHealth
    });
  }

  root.SignalDockAnalysisViewComposition = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
