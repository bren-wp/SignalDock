(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      el,
      getPaletteEngine,
      actions = {},
      closeCompetingDialogs,
      showDialogSafely,
      getSelectedEntry,
      navResetDialogs = [],
      traceCompareDialog = null,
      traceExplorerDialog = null
    } = options;

    if (!state || !el) throw new Error("Command/navigation controller requires state and element map.");
    if (typeof getPaletteEngine !== "function") throw new Error("Command/navigation controller requires palette engine accessor.");
    if (typeof closeCompetingDialogs !== "function" || typeof showDialogSafely !== "function") throw new Error("Command/navigation controller requires dialog helpers.");

    const doc = el.commandPaletteDialog?.ownerDocument || root.document;
    const listeners = [];
    let bound = false;

    function listen(target, type, handler, options) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler, options);
      listeners.push(() => target.removeEventListener(type, handler, options));
    }

    function setActiveNav(target) {
      doc.querySelectorAll("[data-nav]").forEach((item) => {
        const active = item.dataset.nav === target;
        item.classList.toggle("is-active", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
    }

    function navigate(target) {
      setActiveNav(target);
      const action = {
        search: actions.focusSearch,
        map: actions.openServiceMap,
        matrix: actions.openServiceMatrix,
        heatmap: actions.openServiceHeatmap,
        trends: actions.openServiceTrends,
        baseline: actions.openBaseline,
        traces: actions.openTraceExplorer,
        outliers: actions.openTraceOutliers,
        health: actions.openHealth,
        investigation: actions.openInvestigation,
        exceptions: actions.openExceptions,
        projects: actions.openProjects,
        settings: actions.openSettings,
        live: actions.toggleLiveTail,
        saved: actions.openQueryLibrary
      }[target];
      action?.();
    }

    function definitions() {
      return [
        { id: "import", title: "Import logs", keywords: "open file json log zip", hint: "⌘O", run: actions.importLogs },
        { id: "search", title: "Focus smart search", keywords: "query filter find", hint: "/", disabled: !state.entries.length, run: actions.focusSearch },
        { id: "service-map", title: "Open service map", keywords: "topology trace dependencies", disabled: !state.entries.length, run: () => navigate("map") },
        { id: "service-matrix", title: "Open service latency matrix", keywords: "latency p95 edge errors dependency calls", disabled: !state.entries.length, run: () => navigate("matrix") },
        { id: "service-heatmap", title: "Open dependency heatmap", keywords: "time heatmap service dependency edge errors", disabled: !state.entries.length, run: () => navigate("heatmap") },
        { id: "service-trends", title: "Compare dependency periods", keywords: "trend service edge period delta calls errors p95", disabled: !state.entries.length, run: () => navigate("trends") },
        { id: "baseline", title: "Open cross-dataset baseline comparison", keywords: "baseline regression compare dataset service dependency", run: () => navigate("baseline") },
        { id: "projects", title: "Open local project manager", keywords: "projects workspace metadata organize", run: () => navigate("projects") },
        { id: "trace-explorer", title: "Open distributed trace explorer", keywords: "trace inventory spans coverage duration", disabled: !state.entries.length, run: () => navigate("traces") },
        { id: "trace-outliers", title: "Rank trace outliers", keywords: "trace latency robust errors anomalies unusual", disabled: !state.entries.length, run: () => navigate("outliers") },
        { id: "query-library", title: "Open query library", keywords: "saved reusable searches filters presets", run: () => navigate("saved") },
        { id: "health", title: "Open observed health", keywords: "health service errors warnings p95 exceptions", disabled: !state.entries.length, run: () => navigate("health") },
        { id: "investigation", title: "Open case & investigation workspace", keywords: "case evidence notes incident findings hypothesis bookmark", run: () => navigate("investigation") },
        { id: "case-report", title: "Export case report (Markdown)", keywords: "case report markdown findings health exceptions", run: actions.exportCaseMarkdown },
        { id: "exceptions", title: "Open exception groups", keywords: "errors fingerprint recurring failure crash trends", disabled: !state.entries.length, run: () => navigate("exceptions") },
        { id: "add-evidence", title: "Add selected log to investigation", keywords: "evidence pin bookmark", disabled: !getSelectedEntry?.(), run: actions.addSelectedEvidence },
        { id: "save-workspace", title: "Save workspace", keywords: "session sdsession bookmark", hint: "⇧⌘S", disabled: !state.entries.length, run: actions.saveWorkspace },
        { id: "export", title: "Export current results", keywords: "download json ndjson", disabled: !state.filteredIndexes.length, run: actions.exportFiltered },
        { id: "save-view", title: "Save current view", keywords: "filters preset", disabled: !state.entries.length, run: actions.saveCurrentView },
        { id: "reset", title: "Reset filters", keywords: "clear query search", disabled: !state.entries.length, run: actions.resetFilters },
        { id: "windowed", title: state.renderMode === "virtual" ? "Switch to paged table" : "Switch to windowed table", keywords: "virtual large performance viewport", disabled: !state.entries.length || state.settings?.wrap || Number(root.innerWidth || 0) < 780, run: actions.toggleRenderMode },
        { id: "live", title: state.tail?.active ? "Stop live tail" : "Start local live tail", keywords: "follow file stream", run: () => navigate("live") },
        { id: "settings", title: "Open settings", keywords: "preferences parser performance recovery", run: () => navigate("settings") },
        { id: "clear", title: "Clear loaded logs", keywords: "remove dataset", disabled: !state.entries.length, run: actions.clearAll }
      ];
    }

    function filteredCommands() {
      const commands = definitions();
      return getPaletteEngine()?.filter?.(commands, el.commandPaletteInput?.value || "") || commands;
    }

    function render() {
      if (!el.commandPaletteList) return;
      const commands = filteredCommands();
      state.commandPaletteIndex = Math.max(0, Math.min(state.commandPaletteIndex, Math.max(0, commands.length - 1)));
      el.commandPaletteList.replaceChildren();
      if (!commands.length) {
        el.commandPaletteInput?.removeAttribute("aria-activedescendant");
        const empty = doc.createElement("p");
        empty.className = "command-empty";
        empty.textContent = "No matching commands.";
        el.commandPaletteList.appendChild(empty);
        return;
      }
      commands.forEach((command, index) => {
        const button = doc.createElement("button");
        button.type = "button";
        button.id = `commandPaletteOption-${index}`;
        button.className = `command-item${index === state.commandPaletteIndex ? " is-active" : ""}`;
        button.dataset.commandId = command.id;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", index === state.commandPaletteIndex ? "true" : "false");
        button.disabled = Boolean(command.disabled);
        const copy = doc.createElement("span");
        const strong = doc.createElement("strong");
        strong.textContent = command.title;
        const small = doc.createElement("small");
        small.textContent = command.keywords || "SignalDock action";
        copy.append(strong, small);
        button.appendChild(copy);
        if (command.hint) {
          const kbd = doc.createElement("kbd");
          kbd.textContent = command.hint;
          button.appendChild(kbd);
        }
        el.commandPaletteList.appendChild(button);
      });
      const activeOption = el.commandPaletteList.querySelector(".is-active");
      if (activeOption) el.commandPaletteInput?.setAttribute("aria-activedescendant", activeOption.id);
      else el.commandPaletteInput?.removeAttribute("aria-activedescendant");
      activeOption?.scrollIntoView?.({ block: "nearest" });
    }

    function open() {
      if (!el.commandPaletteDialog) return;
      closeCompetingDialogs("commandPaletteDialog");
      state.commandPaletteIndex = 0;
      el.commandPaletteInput.value = "";
      el.commandPaletteInput.setAttribute("aria-expanded", "true");
      render();
      showDialogSafely(el.commandPaletteDialog);
      root.requestAnimationFrame?.(() => el.commandPaletteInput?.focus());
    }

    function close() {
      if (!el.commandPaletteDialog) return;
      el.commandPaletteInput?.setAttribute("aria-expanded", "false");
      el.commandPaletteInput?.removeAttribute("aria-activedescendant");
      if (typeof el.commandPaletteDialog.close === "function" && el.commandPaletteDialog.open) el.commandPaletteDialog.close();
      else el.commandPaletteDialog.removeAttribute("open");
    }

    function run(id) {
      const command = definitions().find((item) => item.id === id);
      if (!command || command.disabled) return;
      close();
      command.run?.();
    }

    function handleKeydown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (el.commandPaletteDialog?.open) close(); else open();
        return true;
      }
      if (!el.commandPaletteDialog?.open) return false;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return true;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const commands = filteredCommands();
        if (commands.length) state.commandPaletteIndex = (state.commandPaletteIndex + (event.key === "ArrowDown" ? 1 : -1) + commands.length) % commands.length;
        render();
        return true;
      }
      if (event.key === "Enter") {
        const commands = filteredCommands();
        if (commands[state.commandPaletteIndex]) {
          event.preventDefault();
          run(commands[state.commandPaletteIndex].id);
        }
        return true;
      }
      return false;
    }

    function bind() {
      if (bound) return;
      bound = true;
      doc.querySelectorAll("[data-nav]").forEach((button) => listen(button, "click", () => navigate(button.dataset.nav)));
      listen(el.commandPaletteButton, "click", open);
      listen(el.closeCommandPaletteButton, "click", close);
      listen(el.commandPaletteInput, "input", () => { state.commandPaletteIndex = 0; render(); });
      listen(el.commandPaletteList, "click", (event) => {
        const button = event.target.closest("[data-command-id]");
        if (button) run(button.dataset.commandId);
      });
      listen(doc, "keydown", handleKeydown);
      navResetDialogs.filter(Boolean).forEach((dialog) => listen(dialog, "close", () => setActiveNav("logs")));
      if (traceCompareDialog) listen(traceCompareDialog, "close", () => { if (traceExplorerDialog?.open) return; setActiveNav("logs"); });
    }

    function destroy() {
      while (listeners.length) listeners.pop()();
      bound = false;
    }

    return Object.freeze({ setActiveNav, navigate, definitions, filteredCommands, render, open, close, run, handleKeydown, bind, destroy });
  }

  root.SignalDockCommandNavigationController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
