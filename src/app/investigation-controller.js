(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      el,
      appVersion,
      getUtils,
      toast,
      getSelectedEntry,
      selectEntry,
      entryRowIntoView,
      updateStats,
      renderInspector,
      refreshCaseWorkspace,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav,
      scheduleViewAutosave,
      scheduleDatasetAutosave
    } = options;

    if (!state || !el) throw new TypeError("Investigation controller requires state and element registries.");
    for (const [name, value] of Object.entries({
      getUtils,
      toast,
      getSelectedEntry,
      selectEntry,
      entryRowIntoView,
      updateStats,
      renderInspector,
      refreshCaseWorkspace,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav,
      scheduleViewAutosave,
      scheduleDatasetAutosave
    })) {
      if (typeof value !== "function") throw new TypeError(`Investigation controller requires ${name}().`);
    }
    if (!root.SignalDockInvestigation) throw new Error("SignalDock Investigation domain module is unavailable.");

    const doc = el.investigationList?.ownerDocument || el.caseTimelineList?.ownerDocument || el.caseActivityList?.ownerDocument || root.document;
    if (!doc) throw new Error("Investigation controller requires a document.");

    let bound = false;
    const listeners = [];

    function investigation() {
      return root.SignalDockInvestigation;
    }

    function workspace() {
      return root.SignalDockCaseWorkspace;
    }

    function timelineDomain() {
      return root.SignalDockCaseTimeline;
    }

    function utils() {
      return getUtils();
    }

    function listen(node, type, handler) {
      if (!node) return;
      node.addEventListener(type, handler);
      listeners.push([node, type, handler]);
    }

    function persist() {
      scheduleViewAutosave();
      if (state.settings?.autosave !== false) scheduleDatasetAutosave();
    }

    function recordActivity(type, label, detail = "", options = {}) {
      if (!workspace()?.appendActivity) return;
      state.caseFile = workspace().appendActivity(state.caseFile, type, {
        label,
        detail,
        findingId: options.findingId || "",
        evidenceId: options.evidenceId || ""
      });
    }

    function renderCaseActivity() {
      if (!el.caseActivityList) return;
      const activity = Array.isArray(state.caseFile?.activity)
        ? [...state.caseFile.activity].sort((a, b) => String(b.at).localeCompare(String(a.at)))
        : [];
      if (el.caseActivityMeta) el.caseActivityMeta.textContent = `${activity.length.toLocaleString()} event${activity.length === 1 ? "" : "s"}`;
      el.caseActivityList.replaceChildren();
      if (!activity.length) {
        const empty = doc.createElement("div");
        empty.className = "case-findings__empty";
        empty.textContent = "Case changes will appear here.";
        el.caseActivityList.appendChild(empty);
        return;
      }
      activity.slice(0, 120).forEach((item) => {
        const row = doc.createElement("article");
        row.className = "case-activity__item";
        const dot = doc.createElement("i");
        dot.setAttribute("aria-hidden", "true");
        const copy = doc.createElement("div");
        const strong = doc.createElement("strong");
        strong.textContent = item.label || item.type || "Case activity";
        const small = doc.createElement("small");
        const when = Date.parse(item.at);
        small.textContent = Number.isFinite(when) ? new Date(when).toLocaleString() : item.at || "";
        copy.append(strong, small);
        if (item.detail) {
          const detail = doc.createElement("p");
          detail.textContent = item.detail;
          copy.appendChild(detail);
        }
        row.append(dot, copy);
        el.caseActivityList.appendChild(row);
      });
    }

    function renderCaseTimeline() {
      if (!el.caseTimelineList || !timelineDomain()) return;
      const timeline = timelineDomain().build(state.caseFile || {}, state.investigation || {}, { limit: 1000 });
      const filter = state.caseTimelineFilter || "all";
      if (el.caseTimelineFilter && el.caseTimelineFilter.value !== filter) el.caseTimelineFilter.value = filter;
      const rows = filter === "all" ? timeline.items : timeline.items.filter((item) => item.type === filter);
      if (el.caseTimelineMeta) {
        el.caseTimelineMeta.textContent = timeline.summary.total
          ? `${timeline.summary.total} timed events · ${timeline.summary.evidence} evidence · ${timeline.summary.milestones} milestones · ${timeline.summary.activity} activity`
          : "No timestamped case events.";
      }
      el.caseTimelineList.replaceChildren();
      if (!rows.length) {
        const empty = doc.createElement("div");
        empty.className = "case-findings__empty";
        empty.textContent = "No timeline items match this view.";
        el.caseTimelineList.appendChild(empty);
        return;
      }
      [...rows].reverse().slice(0, 300).forEach((item) => {
        const row = doc.createElement("article");
        row.className = "case-timeline-item";
        row.dataset.type = item.type;
        if (item.evidenceId) row.dataset.evidenceId = item.evidenceId;
        const time = doc.createElement("time");
        time.dateTime = item.at;
        time.textContent = new Date(item.timestampMs).toLocaleString();
        const dot = doc.createElement("i");
        dot.setAttribute("aria-hidden", "true");
        const copy = doc.createElement("div");
        copy.className = "case-timeline-item__copy";
        const strong = doc.createElement("strong");
        strong.textContent = `${item.type[0].toUpperCase() + item.type.slice(1)} · ${item.title}`;
        const small = doc.createElement("small");
        small.textContent = [item.state, item.detail].filter(Boolean).join(" · ");
        copy.append(strong, small);
        row.append(time, dot, copy);
        el.caseTimelineList.appendChild(row);
      });
    }

    function renderCaseSurfaces() {
      renderCaseActivity();
      renderCaseTimeline();
    }

    function renderEvidenceTimeline() {
      if (!el.investigationTimeline) return;
      const timeline = investigation().timeline(state.investigation, { maxBuckets: 16 });
      el.investigationTimeline.replaceChildren();
      if (!timeline.buckets.length) {
        if (el.investigationTimelineMeta) el.investigationTimelineMeta.textContent = "No timed evidence";
        const empty = doc.createElement("span");
        empty.className = "investigation-timeline__empty";
        empty.textContent = "Pin timestamped log entries to build the local evidence timeline.";
        el.investigationTimeline.appendChild(empty);
        return;
      }
      const max = Math.max(...timeline.buckets.map((bucket) => bucket.count), 1);
      if (el.investigationTimelineMeta) el.investigationTimelineMeta.textContent = `${new Date(timeline.start).toLocaleString()} → ${new Date(timeline.end).toLocaleString()}`;
      timeline.buckets.forEach((bucket) => {
        const bar = doc.createElement("span");
        bar.className = `investigation-timeline__bar${bucket.fatal ? " has-fatal" : bucket.errors ? " has-errors" : ""}`;
        bar.title = `${bucket.count} evidence item${bucket.count === 1 ? "" : "s"} · ${bucket.errors} errors · ${bucket.fatal} fatal`;
        bar.style.setProperty("--evidence-height", `${Math.max(8, Math.round((bucket.count / max) * 100))}%`);
        el.investigationTimeline.appendChild(bar);
      });
    }

    function render() {
      if (!el.investigationList) return;
      state.investigation = investigation().normalize(state.investigation);
      const summary = investigation().summarize(state.investigation);
      if (el.investigationStats) {
        el.investigationStats.textContent = `${summary.items.toLocaleString()} evidence item${summary.items === 1 ? "" : "s"} · ${summary.services.toLocaleString()} services · ${summary.tags.toLocaleString()} tags${summary.exceptionGroups ? ` · ${summary.exceptionGroups} exception groups` : ""}`;
      }
      refreshCaseWorkspace();
      renderEvidenceTimeline();
      el.investigationList.replaceChildren();
      if (!state.investigation.items.length) {
        const empty = doc.createElement("div");
        empty.className = "investigation-empty";
        empty.textContent = "No evidence pinned yet. Select a log entry and choose Add evidence.";
        el.investigationList.appendChild(empty);
        return;
      }

      state.investigation.items.forEach((item, index) => {
        const card = doc.createElement("article");
        card.className = "investigation-item";
        card.dataset.investigationId = item.id;
        const head = doc.createElement("div");
        head.className = "investigation-item__head";
        const identity = doc.createElement("div");
        const badge = doc.createElement("span");
        badge.className = `level-badge level-${String(item.level || "UNKNOWN").toUpperCase()}`;
        badge.textContent = item.level || "UNKNOWN";
        const title = doc.createElement("strong");
        title.textContent = `${item.service || "—"} · ${item.source ? utils().shortSource(item.source) : "source"}`;
        const time = doc.createElement("small");
        time.textContent = item.timestamp ? utils().formatTime(item.timestamp) : `Evidence ${index + 1}`;
        identity.append(badge, title, time);
        const actions = doc.createElement("div");
        const openButton = doc.createElement("button");
        openButton.type = "button";
        openButton.className = "button button--ghost button--small";
        openButton.dataset.investigationAction = "open";
        openButton.dataset.investigationId = item.id;
        openButton.textContent = "Open";
        const removeButton = doc.createElement("button");
        removeButton.type = "button";
        removeButton.className = "button button--ghost button--small";
        removeButton.dataset.investigationAction = "remove";
        removeButton.dataset.investigationId = item.id;
        removeButton.textContent = "Remove";
        actions.append(openButton, removeButton);
        head.append(identity, actions);
        const message = doc.createElement("p");
        message.className = "investigation-item__message";
        message.textContent = item.message || "(empty message)";
        const fingerprint = item.fingerprint ? doc.createElement("code") : null;
        if (fingerprint) {
          fingerprint.className = "investigation-item__fingerprint";
          fingerprint.textContent = item.fingerprint;
          fingerprint.title = "Normalized exception fingerprint";
        }
        const fields = doc.createElement("div");
        fields.className = "investigation-item__fields";
        const noteLabel = doc.createElement("label");
        const noteSpan = doc.createElement("span");
        noteSpan.textContent = "Note";
        const note = doc.createElement("textarea");
        note.rows = 2;
        note.maxLength = 8000;
        note.value = item.note || "";
        note.dataset.investigationNote = item.id;
        note.placeholder = "Why is this entry important?";
        noteLabel.append(noteSpan, note);
        const tagLabel = doc.createElement("label");
        const tagSpan = doc.createElement("span");
        tagSpan.textContent = "Tags";
        const tags = doc.createElement("input");
        tags.type = "text";
        tags.value = (item.tags || []).join(", ");
        tags.dataset.investigationTags = item.id;
        tags.placeholder = "auth, regression, incident-42";
        tagLabel.append(tagSpan, tags);
        fields.append(noteLabel, tagLabel);
        card.append(head, message);
        if (fingerprint) card.appendChild(fingerprint);
        card.append(fields);
        el.investigationList.appendChild(card);
      });
    }

    function syncCaseControls() {
      if (el.investigationTitle) el.investigationTitle.value = state.investigation?.title || "Investigation";
      if (el.investigationSummary) el.investigationSummary.value = state.investigation?.summary || "";
      if (el.caseStatus) el.caseStatus.value = state.caseFile?.status || "open";
      if (el.caseSeverity) el.caseSeverity.value = state.caseFile?.severity || "none";
      if (el.caseHypothesis) el.caseHypothesis.value = state.caseFile?.hypothesis || "";
      if (el.caseImpact) el.caseImpact.value = state.caseFile?.impact || "";
      if (el.caseNextSteps) el.caseNextSteps.value = state.caseFile?.nextSteps || "";
    }

    function open() {
      if (!el.investigationDialog) return;
      state.investigation = investigation().normalize(state.investigation);
      if (workspace()?.normalize) state.caseFile = workspace().normalize(state.caseFile);
      syncCaseControls();
      render();
      closeCompetingDialogs("investigationDialog");
      showDialogSafely(el.investigationDialog);
    }

    function close() {
      if (!el.investigationDialog) return;
      if (typeof el.investigationDialog.close === "function" && el.investigationDialog.open) el.investigationDialog.close();
      else el.investigationDialog.removeAttribute("open");
      setActiveNav("logs");
    }

    function persistInvestigationMeta() {
      state.investigation = investigation().normalize(Object.assign({}, state.investigation, {
        title: el.investigationTitle?.value || "Investigation",
        summary: el.investigationSummary?.value || "",
        updatedAt: new Date().toISOString()
      }));
      if (workspace()?.updateMeta) {
        state.caseFile = workspace().updateMeta(state.caseFile, {
          title: state.investigation.title,
          summary: state.investigation.summary
        });
      }
      updateStats();
      persist();
    }

    function persistCaseMeta() {
      if (!workspace()?.updateMeta) return;
      const previousStatus = state.caseFile?.status || "open";
      const previousSeverity = state.caseFile?.severity || "none";
      state.caseFile = workspace().updateMeta(state.caseFile, {
        title: el.investigationTitle?.value || state.investigation?.title || "Investigation",
        summary: el.investigationSummary?.value || state.investigation?.summary || "",
        status: el.caseStatus?.value || "open",
        severity: el.caseSeverity?.value || "none",
        hypothesis: el.caseHypothesis?.value || "",
        impact: el.caseImpact?.value || "",
        nextSteps: el.caseNextSteps?.value || ""
      });
      if (state.caseFile.status !== previousStatus) recordActivity("case.status", "Case status changed", `${previousStatus} → ${state.caseFile.status}`);
      if (state.caseFile.severity !== previousSeverity) recordActivity("case.severity", "Case severity changed", `${previousSeverity} → ${state.caseFile.severity}`);
      refreshCaseWorkspace(false);
      persist();
    }

    function pinEvidence(entry, options = {}) {
      if (!entry) return false;
      try {
        const result = investigation().add(state.investigation, entry, options.note || "", options.tags || []);
        state.investigation = result.notebook;
        if (result.added) {
          const pinned = result.item || state.investigation.items.find((item) => item.entryId === entry.id);
          recordActivity(
            "evidence.pinned",
            options.activityLabel || "Evidence pinned",
            options.activityDetail || `${entry.level} · ${entry.service || "—"} · ${(entry.message || "").slice(0, 160)}`,
            { evidenceId: pinned?.id || "" }
          );
        }
        updateStats();
        renderInspector();
        if (el.investigationDialog?.open) render();
        else refreshCaseWorkspace();
        persist();
        toast(result.added ? (options.addedMessage || "Added log entry to investigation.") : (options.duplicateMessage || "This log entry is already pinned as evidence."));
        return result.added;
      } catch (error) {
        toast(`Could not add evidence: ${error.message || error}`, "error", 6500);
        return false;
      }
    }

    function addSelectedEvidence() {
      pinEvidence(getSelectedEntry());
    }

    function findEntryForEvidence(item) {
      if (!item) return null;
      let entry = Number.isInteger(item.globalIndex) ? state.entries[item.globalIndex] : null;
      if (!entry || (item.entryId && entry.id !== item.entryId)) {
        entry = state.entries.find((candidate) => candidate.id === item.entryId || (candidate.source === item.source && candidate.globalIndex === item.globalIndex)) || null;
      }
      return entry;
    }

    function openEvidence(item) {
      const entry = findEntryForEvidence(item);
      if (!entry) {
        toast("The referenced evidence log is not present in this workspace.", "error");
        return;
      }
      close();
      selectEntry(entry.id);
      entryRowIntoView(entry.globalIndex);
    }

    function onInvestigationClick(event) {
      const button = event.target.closest("[data-investigation-action]");
      if (!button) return;
      const id = button.dataset.investigationId;
      const item = state.investigation?.items?.find((candidate) => candidate.id === id);
      if (!item) return;
      if (button.dataset.investigationAction === "remove") {
        state.investigation = investigation().remove(state.investigation, id);
        if (workspace()?.pruneEvidenceLinks) state.caseFile = workspace().pruneEvidenceLinks(state.caseFile, state.investigation.items);
        recordActivity("evidence.removed", "Evidence removed", item.message || item.id, { evidenceId: id });
        render();
        updateStats();
        renderInspector();
        persist();
        return;
      }
      if (button.dataset.investigationAction === "open") openEvidence(item);
    }

    function onInvestigationEdit(event) {
      const noteId = event.target.dataset.investigationNote;
      const tagId = event.target.dataset.investigationTags;
      const id = noteId || tagId;
      if (!id) return;
      state.investigation = investigation().update(state.investigation, id, noteId ? { note: event.target.value } : { tags: event.target.value });
      render();
      updateStats();
      persist();
    }

    function onCaseTimelineClick(event) {
      const row = event.target.closest("[data-evidence-id]");
      if (!row) return;
      const item = state.investigation?.items?.find((candidate) => candidate.id === row.dataset.evidenceId);
      if (item) openEvidence(item);
    }

    function onCaseTimelineFilter() {
      state.caseTimelineFilter = el.caseTimelineFilter?.value || "all";
      renderCaseTimeline();
    }

    function exportBundle() {
      const text = investigation().exportBundle(state.investigation, {
        appVersion,
        sourceLabel: el.loadedMeta?.textContent || "local-workspace",
        caseFile: workspace()?.normalize?.(state.caseFile) || state.caseFile
      });
      utils().downloadParts(`signaldock-evidence-${new Date().toISOString().slice(0, 10)}.sdbundle`, [text], "application/json;charset=utf-8");
      toast("Self-contained evidence bundle exported.");
    }

    function exportJson() {
      const text = investigation().exportJson(state.investigation);
      utils().downloadParts(`signaldock-investigation-${new Date().toISOString().slice(0, 10)}.json`, [text], "application/json;charset=utf-8");
      toast("Investigation exported as JSON.");
    }

    function exportMarkdown() {
      const text = investigation().exportMarkdown(state.investigation);
      utils().downloadParts(`signaldock-investigation-${new Date().toISOString().slice(0, 10)}.md`, [text], "text/markdown;charset=utf-8");
      toast("Investigation exported as Markdown.");
    }

    async function importJson(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        let imported;
        let importedCase = null;
        const probe = JSON.parse(text);
        if (probe?.schema === investigation().BUNDLE_SCHEMA) {
          const bundle = investigation().importBundle(text);
          imported = bundle.investigation;
          importedCase = bundle.caseFile || null;
        } else {
          imported = investigation().importJson(text);
        }
        const mergeResult = investigation().merge
          ? investigation().merge(state.investigation, imported)
          : { notebook: imported, added: imported.items.length, skipped: 0, idMap: {} };
        state.investigation = mergeResult.notebook;
        if (importedCase && workspace()) {
          const remappedCase = workspace().normalize(importedCase);
          const idMap = mergeResult.idMap || {};
          remappedCase.findings.forEach((finding) => {
            finding.evidenceIds = finding.evidenceIds.map((id) => idMap[id] || id);
          });
          remappedCase.activity.forEach((activity) => {
            if (activity.evidenceId) activity.evidenceId = idMap[activity.evidenceId] || activity.evidenceId;
          });
          state.caseFile = workspace().merge ? workspace().merge(state.caseFile, remappedCase) : remappedCase;
        }
        if (workspace()?.pruneEvidenceLinks) state.caseFile = workspace().pruneEvidenceLinks(state.caseFile, state.investigation.items);
        recordActivity("evidence.imported", "Investigation evidence merged", `${mergeResult.added} added · ${mergeResult.skipped} not added`);
        syncCaseControls();
        render();
        updateStats();
        renderInspector();
        persist();
        toast(`Merged investigation evidence. ${mergeResult.added.toLocaleString()} added, ${mergeResult.skipped.toLocaleString()} not added.`);
      } catch (error) {
        toast(`Could not import investigation: ${error.message || error}`, "error", 6500);
      } finally {
        event.target.value = "";
      }
    }

    function clear() {
      if (!state.investigation?.items?.length) return;
      if (typeof root.confirm === "function" && !root.confirm("Clear all pinned evidence and notes from this investigation?")) return;
      const title = state.investigation.title;
      const summary = state.investigation.summary;
      state.investigation = investigation().empty();
      state.investigation.title = title || "Investigation";
      state.investigation.summary = summary || "";
      if (workspace()?.pruneEvidenceLinks) state.caseFile = workspace().pruneEvidenceLinks(state.caseFile, []);
      recordActivity("evidence.cleared", "Investigation evidence cleared", "All pinned evidence was removed from the local investigation.");
      render();
      updateStats();
      renderInspector();
      persist();
      toast("Investigation evidence cleared.");
    }

    function openImportPicker() {
      el.investigationFileInput?.click();
    }

    function bind() {
      if (bound) return api;
      listen(el.addEvidenceButton, "click", addSelectedEvidence);
      listen(el.closeInvestigationButton, "click", close);
      listen(el.exportInvestigationBundleButton, "click", exportBundle);
      listen(el.exportInvestigationMarkdownButton, "click", exportMarkdown);
      listen(el.exportInvestigationJsonButton, "click", exportJson);
      listen(el.importInvestigationJsonButton, "click", openImportPicker);
      listen(el.investigationFileInput, "change", importJson);
      listen(el.clearInvestigationButton, "click", clear);
      listen(el.investigationTitle, "input", persistInvestigationMeta);
      listen(el.investigationSummary, "input", persistInvestigationMeta);
      listen(el.investigationList, "click", onInvestigationClick);
      listen(el.investigationList, "change", onInvestigationEdit);
      listen(el.caseStatus, "change", persistCaseMeta);
      listen(el.caseSeverity, "change", persistCaseMeta);
      listen(el.caseHypothesis, "input", persistCaseMeta);
      listen(el.caseImpact, "input", persistCaseMeta);
      listen(el.caseNextSteps, "input", persistCaseMeta);
      listen(el.caseTimelineFilter, "change", onCaseTimelineFilter);
      listen(el.caseTimelineList, "click", onCaseTimelineClick);
      bound = true;
      return api;
    }

    function destroy() {
      while (listeners.length) {
        const [node, type, handler] = listeners.pop();
        node.removeEventListener(type, handler);
      }
      bound = false;
    }

    const api = Object.freeze({
      bind,
      destroy,
      open,
      close,
      render,
      pinEvidence,
      recordActivity,
      renderCaseSurfaces,
      syncCaseControls
    });
    return api;
  }

  root.SignalDockInvestigationController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
