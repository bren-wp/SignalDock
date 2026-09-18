(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      loadJson,
      savedViewKeys = [],
      settingsKeys = [],
      activeProjectKey = "",
      createInvestigation,
      createCase,
      loadQueryLibrary,
      loadBaselineHistory,
      loadProjects,
      normalizeCheckpoints
    } = options;

    if (!state || typeof state !== "object") throw new Error("Startup State controller requires state.");
    if (typeof loadJson !== "function") throw new Error("Startup State controller requires loadJson().");
    for (const [name, value] of Object.entries({
      createInvestigation,
      createCase,
      loadQueryLibrary,
      loadBaselineHistory,
      loadProjects,
      normalizeCheckpoints
    })) {
      if (typeof value !== "function") throw new Error(`Startup State controller requires ${name}().`);
    }

    const completed = new Set();

    function once(name, callback) {
      if (completed.has(name)) return false;
      callback();
      completed.add(name);
      return true;
    }

    function hydratePreferences() {
      return once("preferences", () => {
        let savedViews = null;
        for (const key of savedViewKeys) {
          const fallback = key === savedViewKeys[savedViewKeys.length - 1] ? [] : null;
          savedViews = loadJson(key, fallback);
          if (savedViews) break;
        }
        state.savedViews = savedViews || [];

        const settingsSources = settingsKeys.map((key) => loadJson(key, {}));
        state.settings = Object.assign(state.settings, ...settingsSources);
      });
    }

    function hydrateInvestigation() {
      return once("investigation", () => {
        state.investigation = createInvestigation() || { title: "Investigation", summary: "", items: [] };
        state.caseFile = createCase("Investigation") || { title: "Investigation", status: "open", severity: "none", findings: [] };
        state.queryLibrary = loadQueryLibrary() || [];
      });
    }

    function hydrateBaselineHistory() {
      return once("baselineHistory", () => {
        state.baselineHistory = loadBaselineHistory() || [];
      });
    }

    function hydrateProjects() {
      return once("projects", () => {
        state.projects = loadProjects() || [];
        state.activeProjectId = String(loadJson(activeProjectKey, "") || "");
      });
    }

    function hydrateCaseCheckpoints() {
      return once("caseCheckpoints", () => {
        state.caseCheckpoints = normalizeCheckpoints([]) || [];
      });
    }

    return Object.freeze({
      VERSION,
      hydratePreferences,
      hydrateInvestigation,
      hydrateBaselineHistory,
      hydrateProjects,
      hydrateCaseCheckpoints
    });
  }

  root.SignalDockStartupStateController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
