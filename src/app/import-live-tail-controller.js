(function (root) {
  "use strict";

  const VERSION = 1;
  const TAIL_INTERVAL_MS = 1400;

  function create(options = {}) {
    const {
      state,
      el,
      ownerDocument = el?.fileInput?.ownerDocument || root.document,
      parseFile,
      parseText,
      restoreWorkspaceFile,
      startParseProfile,
      touchProjectDatasets,
      setProcessing,
      nextFrame,
      toast,
      rebuildFilterIndex,
      refreshFilters,
      setControlsEnabled,
      syncWorkerIndex,
      applyFilters,
      markDatasetForAutosave,
      renderEverything,
      canUseLiveTail,
      pickLiveTailFile,
      readLiveTailDelta
    } = options;

    if (!state || !el || !ownerDocument) throw new Error("Import/Live Tail controller requires state, elements and document.");
    const required = {
      parseFile,
      parseText,
      restoreWorkspaceFile,
      startParseProfile,
      touchProjectDatasets,
      setProcessing,
      nextFrame,
      toast,
      rebuildFilterIndex,
      refreshFilters,
      setControlsEnabled,
      syncWorkerIndex,
      applyFilters,
      markDatasetForAutosave,
      renderEverything,
      canUseLiveTail,
      pickLiveTailFile,
      readLiveTailDelta
    };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== "function") throw new Error(`Import/Live Tail controller requires ${name}().`);
    }

    const listeners = [];
    let bound = false;
    let dragDepth = 0;

    function listen(target, type, handler) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }

    function hasFileDrag(event) {
      return Array.from(event?.dataTransfer?.types || []).includes("Files");
    }

    function projectDatasetId(file) {
      return `${file?.name || "dataset"}-${Math.max(0, Number(file?.size) || 0)}-${Math.max(0, Number(file?.lastModified) || 0)}`;
    }

    function appendParsedEntries(parsed) {
      const entries = Array.isArray(parsed) ? parsed : [];
      state.baselineComparison = null;
      if (el.baselineChangeCount) el.baselineChangeCount.textContent = "0";
      const base = state.entries.length;
      entries.forEach((entry, offset) => {
        entry.globalIndex = base + offset;
        entry.id = `sd-${entry.globalIndex}`;
      });
      state.entries.push(...entries);
      return entries.length;
    }

    function updateLiveTailNav() {
      const button = ownerDocument.querySelector?.('[data-nav="live"]');
      if (!button) return;
      button.classList?.toggle?.("is-live", Boolean(state.tail.active));
      const label = button.querySelector?.("span");
      if (label) label.textContent = state.tail.active ? "Stop live tail" : "Live tail";
    }

    function scheduleTailPoll() {
      if (!state.tail.active) return;
      state.tail.timer = root.setTimeout?.(pollLiveTail, TAIL_INTERVAL_MS) ?? null;
    }

    function stopLiveTail() {
      if (state.tail.timer != null) root.clearTimeout?.(state.tail.timer);
      state.tail.active = false;
      state.tail.timer = null;
      updateLiveTailNav();
    }

    async function startLiveTail() {
      if (state.tail.active) {
        stopLiveTail();
        toast("Live tail stopped.");
        return;
      }
      if (!canUseLiveTail()) {
        toast("Live tail is not available in this browser. You can still import updated files manually.", "error", 6500);
        return;
      }

      try {
        const selected = await pickLiveTailFile();
        if (!selected?.handle || !selected?.file) return;
        await handleFiles([selected.file]);
        state.tail = {
          active: true,
          handle: selected.handle,
          offset: selected.file.size,
          timer: null,
          carry: "",
          source: selected.file.name
        };
        updateLiveTailNav();
        toast(`Live tail started for ${selected.file.name}.`);
        scheduleTailPoll();
      } catch (error) {
        if (error?.name !== "AbortError") toast(`Could not start live tail: ${error.message || error}`, "error", 6500);
      }
    }

    async function pollLiveTail() {
      if (!state.tail.active || !state.tail.handle) return;
      try {
        const delta = await readLiveTailDelta(state.tail.handle, state.tail.offset);
        if (!delta) {
          scheduleTailPoll();
          return;
        }
        if (delta.truncated) {
          state.tail.offset = 0;
          state.tail.carry = "";
          toast(`${delta.name || state.tail.source} was truncated; live tail restarted from the beginning.`);
        }
        if (delta.size > state.tail.offset) {
          const start = Number.isFinite(delta.start) ? delta.start : state.tail.offset;
          state.tail.offset = delta.size;
          const combined = state.tail.carry + String(delta.text || "");
          const lines = combined.split(/\r?\n/);
          state.tail.carry = lines.pop() || "";
          const complete = lines.join("\n");
          if (complete.trim()) {
            const parsed = await parseText(complete, state.tail.source);
            appendParsedEntries(parsed);
            state.loadedBytes += Math.max(0, delta.size - start);
            rebuildFilterIndex();
            refreshFilters();
            syncWorkerIndex();
            applyFilters(false);
            markDatasetForAutosave();
          }
        }
      } catch (error) {
        stopLiveTail();
        toast(`Live tail stopped: ${error.message || error}`, "error", 6500);
        return;
      }
      scheduleTailPoll();
    }

    async function handleFiles(fileList, options = {}) {
      const files = Array.from(fileList || []);
      if (!files.length) return { added: 0, failed: 0, loadedIds: [] };

      const projectLinks = new Map(
        (Array.isArray(options.projectItems) ? options.projectItems : [])
          .filter((item) => item?.file)
          .map((item) => [item.file, item])
      );
      const loadedProjectIds = [];
      const sessionFiles = files.filter((file) => file.name.toLowerCase().endsWith(".sdsession"));
      if (sessionFiles.length) {
        if (files.length !== 1) {
          toast("Open a .sdsession workspace by itself; do not mix it with log imports.", "error", 6500);
          if (el.fileInput) el.fileInput.value = "";
          return;
        }
        await restoreWorkspaceFile(sessionFiles[0]);
        if (el.fileInput) el.fileInput.value = "";
        return;
      }

      setProcessing(true, "Processing logs…", `${files.length} file${files.length === 1 ? "" : "s"} selected`);
      let added = 0;
      let failed = 0;
      const projectFiles = [];

      try {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          try {
            const finishParseProfile = startParseProfile(file);
            const parsed = await parseFile(file, (progress) => {
              const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
              setProcessing(true, "Processing logs…", `${index + 1}/${files.length} · ${file.name} · ${percent}%`);
            });
            finishParseProfile?.({ entries: parsed.length, profile: state.settings.parserProfile || "auto" });
            appendParsedEntries(parsed);
            state.loadedBytes += file.size;
            state.inputFileCount += 1;
            added += parsed.length;
            const linked = projectLinks.get(file) || {};
            const historyId = linked.historyId || projectDatasetId(file);
            projectFiles.push({
              id: historyId,
              name: file.name,
              size: file.size,
              handleRef: linked.handleRef || "",
              handleKind: linked.handleRef ? "file" : ""
            });
            loadedProjectIds.push(historyId);
          } catch (error) {
            failed += 1;
            toast(`${file.name}: ${error.message || error}`, "error", 7000);
          }
          await nextFrame();
        }
      } finally {
        setProcessing(false);
        if (el.fileInput) el.fileInput.value = "";
      }

      if (added) {
        touchProjectDatasets(projectFiles);
        rebuildFilterIndex();
        refreshFilters();
        setControlsEnabled(true);
        syncWorkerIndex();
        applyFilters(true);
        const profileLabel = state.settings.parserProfile && state.settings.parserProfile !== "auto"
          ? ` · ${state.settings.parserProfile} profile`
          : "";
        toast(`Loaded ${added.toLocaleString()} log entries${profileLabel}${failed ? ` · ${failed} file(s) skipped` : ""}.`);
        markDatasetForAutosave();
      } else if (!state.entries.length) {
        renderEverything();
      }

      return { added, failed, loadedIds: loadedProjectIds };
    }

    function onDragEnter(event) {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      dragDepth += 1;
      if (el.dragOverlay) el.dragOverlay.hidden = false;
    }

    function onDragOver(event) {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
    }

    function onDragLeave(event) {
      if (!hasFileDrag(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth && el.dragOverlay) el.dragOverlay.hidden = true;
    }

    function onDrop(event) {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      dragDepth = 0;
      if (el.dragOverlay) el.dragOverlay.hidden = true;
      void handleFiles(event.dataTransfer?.files);
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(el.importButton, "click", () => el.fileInput?.click());
      listen(el.fileInput, "change", (event) => { void handleFiles(event.target?.files); });
      listen(ownerDocument, "dragenter", onDragEnter);
      listen(ownerDocument, "dragover", onDragOver);
      listen(ownerDocument, "dragleave", onDragLeave);
      listen(ownerDocument, "drop", onDrop);
    }

    function destroy() {
      stopLiveTail();
      while (listeners.length) {
        const [target, type, handler] = listeners.pop();
        target.removeEventListener(type, handler);
      }
      dragDepth = 0;
      if (el.dragOverlay) el.dragOverlay.hidden = true;
      bound = false;
    }

    return Object.freeze({
      VERSION,
      bind,
      destroy,
      startLiveTail,
      stopLiveTail,
      updateLiveTailNav,
      pollLiveTail,
      handleFiles,
      appendParsedEntries,
      projectDatasetId,
      hasFileDrag
    });
  }

  root.SignalDockImportLiveTailController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
