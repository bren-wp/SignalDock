(function (root) {
  "use strict";

  const VERSION = 1;
  const MAX_VIRTUAL_SCROLL_PX = 8000000;

  function create(options = {}) {
    const {
      state,
      el,
      ownerDocument = el?.logTable?.ownerDocument || root.document,
      ownerWindow = ownerDocument?.defaultView || root,
      debounce,
      scheduleFrame,
      now,
      calculateVirtualViewport,
      formatTime,
      shortSource,
      recordPerformance,
      scheduleViewAutosave,
      selectEntry
    } = options;

    if (!state || !el || !ownerDocument || !ownerWindow) throw new Error("Table View controller requires state, elements and UI context.");
    const required = {
      debounce,
      scheduleFrame,
      now,
      calculateVirtualViewport,
      formatTime,
      shortSource,
      recordPerformance,
      scheduleViewAutosave,
      selectEntry
    };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== "function") throw new Error(`Table View controller requires ${name}().`);
    }

    const listeners = [];
    let bound = false;
    let virtualSpacerRules = null;

    function listen(target, type, handler) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }

    function canUseVirtualTable() {
      return !state.settings?.wrap && Number(ownerWindow.innerWidth || 0) >= 780;
    }

    function renderTable() {
      if (state.renderMode === "virtual" && canUseVirtualTable()) {
        renderVirtualTable(false);
        return;
      }
      ownerDocument.body?.classList?.remove("virtual-log-view");
      el.logTable?.classList?.remove("is-virtual");
      renderPagedTable();
    }

    function renderPagedTable() {
      const renderStarted = now();
      el.logTable.replaceChildren();
      const total = state.filteredIndexes.length;
      ensurePageInRange();

      if (!state.entries.length) {
        el.logTable.appendChild(emptyTable(
          "No logs loaded",
          "Import JSON, NDJSON, LOG, TXT or ZIP files. SignalDock processes everything locally in your browser."
        ));
        updatePagination(0);
        return;
      }
      if (!total) {
        el.logTable.appendChild(emptyTable(
          "No matching entries",
          "Try a broader query or reset your active level, source, time, or query filters."
        ));
        updatePagination(0);
        return;
      }

      const start = (state.page - 1) * state.pageSize;
      const end = Math.min(start + state.pageSize, total);
      const pageIndexes = state.filteredIndexes.slice(start, end);
      const generation = ++state.renderGeneration;
      const chunkSize = state.pageSize >= 500 ? 125 : pageIndexes.length;

      const appendChunk = (offset) => {
        if (generation !== state.renderGeneration) return;
        const fragment = ownerDocument.createDocumentFragment();
        const limit = Math.min(offset + chunkSize, pageIndexes.length);
        for (let index = offset; index < limit; index += 1) {
          const entry = state.entries[pageIndexes[index]];
          if (entry) fragment.appendChild(buildLogRow(entry));
        }
        el.logTable.appendChild(fragment);
        if (limit < pageIndexes.length) scheduleFrame(() => appendChunk(limit));
        else recordPerformance(now() - renderStarted, { rows: pageIndexes.length, pageSize: state.pageSize, mode: "paged" });
      };

      appendChunk(0);
      if (el.resultsSummary) {
        el.resultsSummary.textContent = `Showing ${start + 1}–${end} of ${total.toLocaleString()} matching entries · ${state.lastEngine}`;
      }
      updatePagination(total);
    }

    function setVirtualSpacerHeights(topPx, bottomPx) {
      try {
        if (!virtualSpacerRules) {
          let topRule = null;
          let bottomRule = null;
          for (const sheet of Array.from(ownerDocument.styleSheets || [])) {
            for (const rule of Array.from(sheet.cssRules || [])) {
              if (rule.selectorText === ".virtual-spacer--top") topRule = rule;
              if (rule.selectorText === ".virtual-spacer--bottom") bottomRule = rule;
            }
          }
          if (!topRule || !bottomRule) return false;
          virtualSpacerRules = { topRule, bottomRule };
        }
        virtualSpacerRules.topRule.style.height = `${Math.max(0, Math.round(topPx))}px`;
        virtualSpacerRules.bottomRule.style.height = `${Math.max(0, Math.round(bottomPx))}px`;
        return true;
      } catch {
        return false;
      }
    }

    function renderVirtualTable(resetScroll = false) {
      const renderStarted = now();
      const total = state.filteredIndexes.length;
      ownerDocument.body?.classList?.add("virtual-log-view");
      el.logTable?.classList?.add("is-virtual");
      if (resetScroll && el.logTable) el.logTable.scrollTop = 0;

      if (!state.entries.length || !total) {
        el.logTable.replaceChildren(emptyTable(
          state.entries.length ? "No matching entries" : "No logs loaded",
          state.entries.length ? "Try a broader query or reset the active filters." : "Import logs to begin local analysis."
        ));
        updatePagination(0);
        return;
      }

      const rowHeight = state.settings?.compact ? 37 : 46;
      const viewport = calculateVirtualViewport({
        total,
        rowHeight,
        viewportHeight: Math.max(el.logTable.clientHeight || 0, 420),
        scrollTop: el.logTable.scrollTop,
        overscan: state.virtual.overscan,
        maxScrollPx: MAX_VIRTUAL_SCROLL_PX
      });
      if (!viewport) {
        state.renderMode = "paged";
        renderPagedTable();
        return;
      }

      state.virtual.rowHeight = rowHeight;
      state.virtual.pitch = viewport.pitch;
      state.virtual.compressed = viewport.compressed;
      state.virtual.start = viewport.start;
      state.virtual.end = viewport.end;

      const topSpacer = ownerDocument.createElement("div");
      topSpacer.className = "virtual-spacer virtual-spacer--top";
      topSpacer.setAttribute("aria-hidden", "true");
      const bottomSpacer = ownerDocument.createElement("div");
      bottomSpacer.className = "virtual-spacer virtual-spacer--bottom";
      bottomSpacer.setAttribute("aria-hidden", "true");

      if (!setVirtualSpacerHeights(viewport.topSpacerPx, viewport.bottomSpacerPx)) {
        state.renderMode = "paged";
        if (el.renderMode) el.renderMode.value = "paged";
        ownerDocument.body?.classList?.remove("virtual-log-view");
        el.logTable?.classList?.remove("is-virtual");
        renderPagedTable();
        return;
      }

      const fragment = ownerDocument.createDocumentFragment();
      fragment.appendChild(topSpacer);
      for (let position = viewport.start; position < viewport.end; position += 1) {
        const entry = state.entries[state.filteredIndexes[position]];
        if (entry) fragment.appendChild(buildLogRow(entry));
      }
      fragment.appendChild(bottomSpacer);
      el.logTable.replaceChildren(fragment);

      if (el.resultsSummary) {
        el.resultsSummary.textContent = `Window ${viewport.start + 1}–${viewport.end} of ${total.toLocaleString()} matching entries · ${state.lastEngine}`;
      }
      if (el.pageLabel) el.pageLabel.textContent = "Windowed";
      if (el.prevPage) el.prevPage.disabled = true;
      if (el.nextPage) el.nextPage.disabled = true;
      if (el.pageSize) el.pageSize.disabled = true;
      recordPerformance(now() - renderStarted, { rows: viewport.end - viewport.start, total, mode: "virtual" });
    }

    function buildLogRow(entry) {
      const row = ownerDocument.createElement("div");
      row.className = `log-row${state.selectedId === entry.id ? " is-selected" : ""}`;
      row.dataset.entryId = entry.id;
      row.tabIndex = 0;

      const time = ownerDocument.createElement("span");
      time.className = "log-row__time";
      time.textContent = formatTime(entry.timestamp);
      time.title = entry.timestamp || "No timestamp detected";

      const level = ownerDocument.createElement("span");
      level.className = `level-badge level-${entry.level}`;
      level.textContent = entry.level;

      const source = ownerDocument.createElement("span");
      source.className = "log-row__source";
      source.textContent = entry.service !== "—" ? entry.service : shortSource(entry.source);
      source.title = entry.service !== "—" ? `${entry.service} · ${entry.source}` : entry.source;

      const message = ownerDocument.createElement("span");
      message.className = "log-row__message";
      message.textContent = entry.message || "(empty message)";
      message.title = entry.message || "";

      const menu = ownerDocument.createElement("span");
      menu.className = "row-menu";
      const icon = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "icon");
      icon.setAttribute("aria-hidden", "true");
      const use = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "assets/icons.svg#chevron");
      icon.appendChild(use);
      menu.appendChild(icon);

      row.append(time, level, source, message, menu);
      return row;
    }

    function emptyTable(title, text) {
      const wrap = ownerDocument.createElement("div");
      wrap.className = "empty-table";
      const iconWrap = ownerDocument.createElement("span");
      iconWrap.className = "empty-table__icon";
      const icon = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "icon");
      icon.setAttribute("aria-hidden", "true");
      const use = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "assets/icons.svg#terminal");
      icon.appendChild(use);
      iconWrap.appendChild(icon);
      const strong = ownerDocument.createElement("strong");
      strong.textContent = title;
      const paragraph = ownerDocument.createElement("p");
      paragraph.textContent = text;
      wrap.append(iconWrap, strong, paragraph);
      return wrap;
    }

    function updatePagination(total) {
      if (state.renderMode === "virtual" && canUseVirtualTable()) {
        if (el.pageLabel) el.pageLabel.textContent = total ? "Windowed" : "—";
        if (el.prevPage) el.prevPage.disabled = true;
        if (el.nextPage) el.nextPage.disabled = true;
        if (el.pageSize) el.pageSize.disabled = true;
        if (!total && el.resultsSummary) {
          el.resultsSummary.textContent = state.entries.length ? `0 matching entries · ${state.lastEngine}` : "Load logs to begin";
        }
        return;
      }

      const pages = Math.max(1, Math.ceil(total / state.pageSize));
      if (el.pageLabel) el.pageLabel.textContent = `${state.page} / ${pages}`;
      if (el.prevPage) el.prevPage.disabled = !total || state.page <= 1;
      if (el.nextPage) el.nextPage.disabled = !total || state.page >= pages;
      if (el.pageSize) el.pageSize.disabled = !state.entries.length;
      if (!total && el.resultsSummary) {
        el.resultsSummary.textContent = state.entries.length ? `0 matching entries · ${state.lastEngine}` : "Load logs to begin";
      }
    }

    function ensurePageInRange() {
      const pages = Math.max(1, Math.ceil(state.filteredIndexes.length / state.pageSize));
      state.page = Math.max(1, Math.min(state.page, pages));
    }

    function setPage(page) {
      if (state.renderMode === "virtual" && canUseVirtualTable()) return;
      const pages = Math.max(1, Math.ceil(state.filteredIndexes.length / state.pageSize));
      state.page = Math.max(1, Math.min(page, pages));
      renderTable();
      if (el.logTable) el.logTable.scrollTop = 0;
      scheduleViewAutosave();
    }

    function entryRowIntoView(globalIndex) {
      const position = state.filteredIndexes.indexOf(globalIndex);
      if (position < 0) return;

      if (state.renderMode === "virtual" && canUseVirtualTable()) {
        const metrics = calculateVirtualViewport({
          total: state.filteredIndexes.length,
          rowHeight: state.virtual.rowHeight,
          viewportHeight: el.logTable.clientHeight || 420,
          overscan: state.virtual.overscan,
          maxScrollPx: MAX_VIRTUAL_SCROLL_PX,
          scrollTop: 0
        });
        if (metrics) {
          const availableScroll = Math.max(
            1,
            Math.min(metrics.maxScrollPx, metrics.logicalHeight) - (el.logTable.clientHeight || 420)
          );
          el.logTable.scrollTop = metrics.compressed
            ? (position / Math.max(1, state.filteredIndexes.length - 1)) * availableScroll
            : position * metrics.pitch;
        }
        renderVirtualTable(false);
        return;
      }

      state.page = Math.floor(position / state.pageSize) + 1;
      renderTable();
    }

    function onTableActivation(event) {
      const row = event.target?.closest?.("[data-entry-id]");
      if (!row) return;
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      if (event.type === "keydown") event.preventDefault();
      selectEntry(row.dataset.entryId);
    }

    function onScroll() {
      if (state.renderMode !== "virtual") return;
      const current = now();
      const delta = Math.abs(el.logTable.scrollTop - state.virtual.lastScrollTop);
      const elapsed = Math.max(1, current - state.virtual.lastScrollAt);
      const velocity = delta / elapsed;
      state.virtual.overscan = Math.max(10, Math.min(64, Math.round(10 + velocity * 10)));
      state.virtual.lastScrollTop = el.logTable.scrollTop;
      state.virtual.lastScrollAt = current;
      if (state.virtual.raf) return;
      state.virtual.raf = scheduleFrame(() => {
        state.virtual.raf = 0;
        renderVirtualTable(false);
      });
    }

    function bind() {
      if (bound) return;
      bound = true;

      listen(el.prevPage, "click", () => setPage(state.page - 1));
      listen(el.nextPage, "click", () => setPage(state.page + 1));
      listen(el.pageSize, "change", () => {
        state.pageSize = Number(el.pageSize.value) || 100;
        state.page = 1;
        renderTable();
        scheduleViewAutosave();
      });
      listen(el.renderMode, "change", () => {
        state.renderMode = el.renderMode.value === "virtual" ? "virtual" : "paged";
        state.page = 1;
        if (el.logTable) el.logTable.scrollTop = 0;
        renderTable();
        scheduleViewAutosave();
      });
      listen(el.logTable, "scroll", onScroll);
      listen(el.logTable, "click", onTableActivation);
      listen(el.logTable, "keydown", onTableActivation);
      listen(ownerWindow, "resize", debounce(() => {
        if (state.renderMode === "virtual") renderTable();
      }, 120));
    }

    function destroy() {
      while (listeners.length) {
        const [target, type, handler] = listeners.pop();
        target.removeEventListener(type, handler);
      }
      if (state.virtual.raf && typeof ownerWindow.cancelAnimationFrame === "function") {
        ownerWindow.cancelAnimationFrame(state.virtual.raf);
      }
      state.virtual.raf = 0;
      bound = false;
    }

    return Object.freeze({
      VERSION,
      bind,
      destroy,
      canUseVirtualTable,
      renderTable,
      renderPagedTable,
      renderVirtualTable,
      buildLogRow,
      emptyTable,
      updatePagination,
      ensurePageInRange,
      setPage,
      entryRowIntoView
    });
  }

  root.SignalDockTableViewController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
