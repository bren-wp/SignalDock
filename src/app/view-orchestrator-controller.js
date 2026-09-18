(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      ownerDocument = root.document,
      rebuildFilterIndex,
      updateStats,
      refreshFilters,
      renderSavedViews,
      setControlsEnabled,
      applyFilters,
      renderTimeline,
      renderTable,
      renderInspector,
      updateActiveSourceUI
    } = options;

    if (!state || !ownerDocument) throw new Error("View Orchestrator requires state and document.");
    const required = {
      rebuildFilterIndex,
      updateStats,
      refreshFilters,
      renderSavedViews,
      setControlsEnabled,
      applyFilters,
      renderTimeline,
      renderTable,
      renderInspector,
      updateActiveSourceUI
    };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== "function") throw new Error(`View Orchestrator requires ${name}().`);
    }

    function renderEverything() {
      if (state.entries.length && !state.filterEntries.length) rebuildFilterIndex();
      updateStats();
      refreshFilters();
      renderSavedViews();
      setControlsEnabled(Boolean(state.entries.length));
      applyFilters(false);
    }

    function renderDataViews() {
      renderTimeline();
      renderTable();
      renderInspector();
      updateActiveSourceUI();
    }

    function syncLevelChips(level) {
      ownerDocument.querySelectorAll("[data-level]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.level === level);
      });
    }

    return Object.freeze({
      VERSION,
      renderEverything,
      renderDataViews,
      syncLevelChips
    });
  }

  root.SignalDockViewOrchestratorController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
