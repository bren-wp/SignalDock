(function (root) {
  "use strict";

  const VERSION = 1;
  const MAX_SAVED_VIEWS = 24;

  function create(options = {}) {
    const state = options.state;
    const el = options.el || {};
    const ownerDocument = options.ownerDocument || el.savedList?.ownerDocument || el.saveViewButton?.ownerDocument || null;
    const requiredCallbacks = [
      "persistSavedViews",
      "requestName",
      "createViewId",
      "getShortSource",
      "syncLevelChips",
      "applyFilters",
      "toast"
    ];

    if (!state || typeof state !== "object") throw new Error("Saved Views controller requires application state.");
    if (!ownerDocument) throw new Error("Saved Views controller requires a document context.");
    for (const name of requiredCallbacks) {
      if (typeof options[name] !== "function") throw new Error(`Saved Views controller requires ${name}().`);
    }

    const persistSavedViews = options.persistSavedViews;
    const requestName = options.requestName;
    const createViewId = options.createViewId;
    const getShortSource = options.getShortSource;
    const syncLevelChips = options.syncLevelChips;
    const applyFilters = options.applyFilters;
    const toast = options.toast;
    const listeners = [];
    let bound = false;

    function listen(target, type, handler) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }

    function setSelectValue(select, value, fallback = "") {
      if (!select) return;
      const wanted = Array.from(select.options || []).some((option) => option.value === value) ? value : fallback;
      select.value = wanted;
    }

    function buildViewName() {
      const parts = [];
      if (el.levelFilter?.value) parts.push(el.levelFilter.value);
      if (el.sourceFilter?.value) parts.push(getShortSource(el.sourceFilter.value));
      if (el.timeFilter?.value) parts.push(el.timeFilter.options?.[el.timeFilter.selectedIndex]?.textContent || el.timeFilter.value);
      if (el.queryInput?.value.trim()) parts.push(el.queryInput.value.trim().slice(0, 24));
      return parts.join(" · ") || "My log view";
    }

    function saveCurrentView() {
      if (!state.entries?.length) return;
      const suggested = buildViewName();
      const name = requestName("Name this saved view:", suggested);
      if (!name?.trim()) return;
      const view = {
        id: createViewId(),
        name: name.trim().slice(0, 48),
        query: el.queryInput?.value || "",
        level: el.levelFilter?.value || "",
        source: el.sourceFilter?.value || "",
        timeRange: el.timeFilter?.value || "",
        sortMode: el.sortFilter?.value || "original"
      };
      state.savedViews = Array.isArray(state.savedViews) ? state.savedViews : [];
      state.savedViews.unshift(view);
      state.savedViews = state.savedViews.slice(0, MAX_SAVED_VIEWS);
      persistSavedViews(state.savedViews);
      render();
      toast(`Saved view “${view.name}”.`);
    }

    function makeIcon(symbol) {
      const icon = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "icon");
      icon.setAttribute("aria-hidden", "true");
      const use = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", `assets/icons.svg#${symbol}`);
      icon.appendChild(use);
      return icon;
    }

    function render() {
      if (!el.savedList) return;
      el.savedList.replaceChildren();
      if (el.savedCount) el.savedCount.textContent = (state.queryLibrary?.length || 0).toLocaleString();
      const savedViews = Array.isArray(state.savedViews) ? state.savedViews : [];
      if (!savedViews.length) {
        const empty = ownerDocument.createElement("div");
        empty.className = "sidebar-empty";
        empty.textContent = "Save filters for quick access";
        el.savedList.appendChild(empty);
        return;
      }

      savedViews.forEach((view) => {
        const wrap = ownerDocument.createElement("div");
        wrap.className = "saved-row";
        const button = ownerDocument.createElement("button");
        button.type = "button";
        button.className = "saved-button";
        button.dataset.viewId = view.id;
        const name = ownerDocument.createElement("span");
        name.textContent = view.name;
        name.title = view.name;
        const count = ownerDocument.createElement("em");
        count.textContent = view.level || view.timeRange || "VIEW";
        button.append(makeIcon("bookmark"), name, count);

        const remove = ownerDocument.createElement("button");
        remove.type = "button";
        remove.className = "icon-button icon-button--tiny";
        remove.dataset.deleteView = view.id;
        remove.title = `Delete ${view.name}`;
        remove.setAttribute("aria-label", `Delete saved view ${view.name}`);
        remove.appendChild(makeIcon("close"));

        wrap.append(button, remove);
        el.savedList.appendChild(wrap);
      });
    }

    function onListClick(event) {
      const remove = event.target?.closest?.("[data-delete-view]");
      if (remove) {
        state.savedViews = (state.savedViews || []).filter((view) => view.id !== remove.dataset.deleteView);
        persistSavedViews(state.savedViews);
        render();
        return;
      }

      const button = event.target?.closest?.("[data-view-id]");
      if (!button) return;
      const view = (state.savedViews || []).find((item) => item.id === button.dataset.viewId);
      if (!view) return;
      if (el.queryInput) el.queryInput.value = view.query || "";
      setSelectValue(el.levelFilter, view.level, "");
      setSelectValue(el.sourceFilter, view.source, "");
      setSelectValue(el.timeFilter, view.timeRange, "");
      setSelectValue(el.sortFilter, view.sortMode, "original");
      syncLevelChips(el.levelFilter?.value || "");
      applyFilters(true);
      toast(`Applied “${view.name}”.`);
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(el.saveViewButton, "click", saveCurrentView);
      listen(el.savedList, "click", onListClick);
    }

    function destroy() {
      while (listeners.length) {
        const [target, type, handler] = listeners.pop();
        target.removeEventListener(type, handler);
      }
      bound = false;
    }

    return Object.freeze({
      VERSION,
      bind,
      destroy,
      saveCurrentView,
      buildViewName,
      render,
      onListClick
    });
  }

  root.SignalDockSavedViewsController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
