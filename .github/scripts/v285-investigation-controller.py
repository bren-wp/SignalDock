from pathlib import Path


def replace_exact(text, old, new, label, expected=1):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new, expected)


root = Path('.')
app_path = root / 'app.js'
index_path = root / 'index.html'
version_path = root / 'VERSION'
readme_path = root / 'README.md'
changelog_path = root / 'CHANGELOG.md'
technical_path = root / 'docs' / 'TECHNICAL.md'
source_layout_path = root / 'docs' / 'SOURCE-LAYOUT.md'
src_readme_path = root / 'src' / 'README.md'
controller_path = root / 'src' / 'app' / 'investigation-controller.js'
controller_test_path = root / 'tests' / 'investigation-controller-smoke.mjs'
source_layout_test_path = root / 'tests' / 'source-layout-smoke.mjs'
ui_foundations_path = root / 'tests' / 'ui-foundations-smoke.mjs'

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.8.4";', 'const APP_VERSION = "2.8.5";', 'app version')
app = replace_exact(
    app,
    '  let projectController = null;\n  let caseWorkspaceController = null;\n',
    '  let projectController = null;\n  let investigationController = null;\n  let caseWorkspaceController = null;\n',
    'Investigation controller state slot'
)
app = replace_exact(
    app,
    '      investigation: openInvestigation,\n',
    '      investigation: () => investigationController?.open(),\n',
    'Investigation navigation dispatch'
)

init_anchor = '''    projectController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
init_replacement = '''    projectController.bind();
    if (!window.SignalDockInvestigationController?.create) throw new Error("SignalDock Investigation controller is unavailable.");
    investigationController = window.SignalDockInvestigationController.create({
      state,
      el,
      appVersion: APP_VERSION,
      getUtils: utils,
      toast,
      getSelectedEntry: selectedEntry,
      selectEntry,
      entryRowIntoView,
      updateStats,
      renderInspector,
      refreshCaseWorkspace: (rebuild = true) => renderCaseWorkspace(rebuild),
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav,
      scheduleViewAutosave: () => scheduleViewAutosave(),
      scheduleDatasetAutosave: () => scheduleDatasetAutosave()
    });
    investigationController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
app = replace_exact(app, init_anchor, init_replacement, 'Investigation controller initialization')
app = replace_exact(
    app,
    '      recordCaseActivity,\n',
    '      recordCaseActivity: (...args) => investigationController?.recordActivity(...args),\n',
    'Case Workspace activity callback'
)

investigation_events = '''    el.addEvidenceButton?.addEventListener("click", addSelectedEvidence);
    el.closeInvestigationButton?.addEventListener("click", closeInvestigation);
    el.exportInvestigationBundleButton?.addEventListener("click", exportInvestigationBundle);
    el.exportInvestigationMarkdownButton?.addEventListener("click", exportInvestigationMarkdown);
    el.exportInvestigationJsonButton?.addEventListener("click", exportInvestigationJson);
    el.importInvestigationJsonButton?.addEventListener("click", () => el.investigationFileInput?.click());
    el.investigationFileInput?.addEventListener("change", importInvestigationJson);
    el.clearInvestigationButton?.addEventListener("click", clearInvestigation);
    el.investigationTitle?.addEventListener("input", persistInvestigationMeta);
    el.investigationSummary?.addEventListener("input", persistInvestigationMeta);
    el.investigationList?.addEventListener("click", onInvestigationClick);
    el.investigationList?.addEventListener("change", onInvestigationEdit);
    [el.caseStatus, el.caseSeverity].forEach((control) => control?.addEventListener("change", persistCaseMeta));
    [el.caseHypothesis, el.caseImpact, el.caseNextSteps].forEach((control) => control?.addEventListener("input", persistCaseMeta));
'''
app = replace_exact(app, investigation_events, '', 'Investigation event ownership')
app = replace_exact(
    app,
    '    el.caseTimelineFilter?.addEventListener("change", () => { state.caseTimelineFilter = el.caseTimelineFilter.value || "all"; renderCaseUnifiedTimeline(); });\n    el.caseTimelineList?.addEventListener("click", onCaseTimelineClick);\n',
    '',
    'Case Timeline event ownership'
)

exception_pin_old = '''    if (button.dataset.exceptionAction === "pin") {
      const result = window.SignalDockInvestigation?.add?.(state.investigation, entry, `Representative sample from ${fingerprint}`, ["exception", fingerprint]);
      if (result) { state.investigation = result.notebook; if (result.added) { const pinned = state.investigation.items.find((item) => item.entryId === entry.id); recordCaseActivity("evidence.pinned", "Exception evidence pinned", `${fingerprint} · ${(entry.message || "").slice(0, 160)}`, { evidenceId: pinned?.id || "" }); } updateStats(); scheduleViewAutosave(); if (state.settings.autosave !== false) scheduleDatasetAutosave(); toast(result.added ? "Exception sample added to investigation." : "This sample is already pinned."); }
      return;
    }
'''
exception_pin_new = '''    if (button.dataset.exceptionAction === "pin") {
      investigationController?.pinEvidence(entry, {
        note: `Representative sample from ${fingerprint}`,
        tags: ["exception", fingerprint],
        activityLabel: "Exception evidence pinned",
        activityDetail: `${fingerprint} · ${(entry.message || "").slice(0, 160)}`,
        addedMessage: "Exception sample added to investigation.",
        duplicateMessage: "This sample is already pinned."
      });
      return;
    }
'''
app = replace_exact(app, exception_pin_old, exception_pin_new, 'Exception evidence controller routing')

block_start = app.find('  function openInvestigation() {')
block_end = app.find('  function renderCaseWorkspace(rebuild = true) {', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('Investigation primary application block not found')
app = app[:block_start] + app[block_end:]

app = replace_exact(
    app,
    '    renderCaseActivity();\n    renderCaseUnifiedTimeline();\n',
    '    investigationController?.renderCaseSurfaces();\n',
    'Case surface controller rendering'
)
app = replace_exact(
    app,
    '      recordCaseActivity("case.imported", "Case file imported", file.name || "Imported case");\n',
    '      investigationController?.recordActivity("case.imported", "Case file imported", file.name || "Imported case");\n',
    'Case import activity routing'
)

block_start = app.find('  function renderInvestigationTimeline() {')
block_end = app.find('  function entryRowIntoView(globalIndex) {', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('Investigation timeline/application block not found')
app = app[:block_start] + app[block_end:]

block_start = app.find('  function exportInvestigationBundle() {')
block_end = app.find('  function filterByServiceValue(service) {', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('Investigation import/export block not found')
app = app[:block_start] + app[block_end:]

for forbidden in [
    'function openInvestigation()',
    'function closeInvestigation()',
    'function persistInvestigationMeta()',
    'function addSelectedEvidence()',
    'function renderInvestigation()',
    'function renderInvestigationTimeline()',
    'function renderCaseActivity()',
    'function renderCaseUnifiedTimeline()',
    'function onCaseTimelineClick(',
    'function persistCaseMeta()',
    'function onInvestigationClick(',
    'function onInvestigationEdit(',
    'function exportInvestigationBundle()',
    'function exportInvestigationJson()',
    'function exportInvestigationMarkdown()',
    'function importInvestigationJson(',
    'function clearInvestigation()',
    'el.addEvidenceButton?.addEventListener',
    'el.investigationList?.addEventListener',
    'el.caseTimelineList?.addEventListener'
]:
    if forbidden in app:
        raise SystemExit(f'legacy Investigation UI wiring remains: {forbidden}')
app_path.write_text(app)

controller_path.parent.mkdir(parents=True, exist_ok=True)
controller_path.write_text(r'''(function (root) {
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
''')

index = index_path.read_text()
index = replace_exact(
    index,
    '  <script src="src/app/project-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    '  <script src="src/app/project-controller.js" defer></script>\n  <script src="src/app/investigation-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    'Investigation controller script order'
)
index_path.write_text(index)

version_path.write_text('2.8.5\n')

readme = readme_path.read_text()
readme = replace_exact(readme, 'version-2.8.4-', 'version-2.8.5-', 'README version badge')
readme = readme.replace('SignalDock v2.8.4', 'SignalDock v2.8.5')
readme = replace_exact(
    readme,
    '- feature-level Project controller under `src/app/` that owns project UI/reopen orchestration while retaining the narrow desktop capability facade and portable-export stripping rules\n',
    '- feature-level Project controller under `src/app/` that owns project UI/reopen orchestration while retaining the narrow desktop capability facade and portable-export stripping rules\n- feature-level Investigation controller under `src/app/` that owns evidence UI, local investigation import/export, Case Activity and Unified Timeline coordination through explicit callbacks\n',
    'README Investigation controller feature'
)
readme_path.write_text(readme)

changelog = changelog_path.read_text()
entry = '''## 2.8.5 — 2026-09-16

### Investigation application controller
- Extracted Investigation evidence rendering/actions, local import/export, Case Activity and Unified Case Timeline coordination from the root `app.js` into `src/app/investigation-controller.js`.
- Consolidated Investigation and Case metadata event ownership behind an idempotent controller boundary while keeping evidence/case normalization in the existing investigation domain modules.
- Routed exception-sample pinning through the same controller path so evidence limits now surface controlled feedback instead of uncaught UI exceptions.
- Unified evidence-to-log navigation for the Investigation list and Case Timeline, including explicit feedback when referenced evidence is not present in the active workspace.
- Corrected investigation import feedback to report items as “not added” instead of incorrectly assuming every skipped item was a duplicate.

### Regression coverage
- Added a dedicated Investigation controller smoke test covering controller ownership, load order, local-only constraints and application integration.
- Extended permanent source-layout and HTTP smoke gates to require all six application controllers.

'''
changelog = replace_exact(changelog, '# Changelog\n\n', '# Changelog\n\n' + entry, 'CHANGELOG release insertion')
changelog_path.write_text(changelog)

technical = technical_path.read_text()
technical = replace_exact(technical, 'Current version: **2.8.4**.', 'Current version: **2.8.5**.', 'technical version')
technical = replace_exact(
    technical,
    '`project-controller.js` owns Project Manager rendering, CRUD actions and explicit link/relink/reopen/forget orchestration. File parsing and workspace restore remain injected application callbacks, while filesystem access is limited to the existing `src/platform/desktop-bridge.js` capability facade. Portable project export/duplication rules remain in `src/investigation/project-manager.js`.\n\n',
    '`project-controller.js` owns Project Manager rendering, CRUD actions and explicit link/relink/reopen/forget orchestration. File parsing and workspace restore remain injected application callbacks, while filesystem access is limited to the existing `src/platform/desktop-bridge.js` capability facade. Portable project export/duplication rules remain in `src/investigation/project-manager.js`.\n\n`investigation-controller.js` owns Investigation evidence rendering/actions, local import/export, Case Activity and Unified Case Timeline coordination. Investigation and Case domain modules remain authoritative for normalization and bounded evidence/case data; log selection, inspector refresh, Case Workspace refresh and autosave are injected callbacks.\n\n',
    'technical Investigation controller boundary'
)
technical_path.write_text(technical)

source_layout = source_layout_path.read_text()
source_layout = replace_exact(
    source_layout,
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `investigation-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'source layout controller list'
)
source_layout_path.write_text(source_layout)

src_readme = src_readme_path.read_text()
src_readme = replace_exact(
    src_readme,
    '`app/project-controller.js` owns Project Manager UI and explicit reopen/link orchestration.\n\n',
    '`app/project-controller.js` owns Project Manager UI and explicit reopen/link orchestration.\n\n`app/investigation-controller.js` owns evidence UI, local investigation import/export, Case Activity and Unified Timeline coordination.\n\n',
    'src README Investigation controller entry'
)
src_readme_path.write_text(src_readme)

source_layout_test = source_layout_test_path.read_text()
source_layout_test = replace_exact(
    source_layout_test,
    '''const applicationControllers = [
  "src/app/query-library-controller.js",
  "src/app/baseline-controller.js",
  "src/app/project-controller.js",
  "src/app/case-workspace-controller.js",
  "src/app/case-checkpoint-controller.js"
];''',
    '''const applicationControllers = [
  "src/app/query-library-controller.js",
  "src/app/baseline-controller.js",
  "src/app/project-controller.js",
  "src/app/investigation-controller.js",
  "src/app/case-workspace-controller.js",
  "src/app/case-checkpoint-controller.js"
];''',
    'source layout controller registry'
)
source_layout_test_path.write_text(source_layout_test)

ui = ui_foundations_path.read_text()
ui = replace_exact(
    ui,
    'const projectController = fs.readFileSync(path.join(root, "src/app/project-controller.js"), "utf8");\n',
    'const projectController = fs.readFileSync(path.join(root, "src/app/project-controller.js"), "utf8");\nconst investigationController = fs.readFileSync(path.join(root, "src/app/investigation-controller.js"), "utf8");\n',
    'UI foundations Investigation controller read'
)
ui = replace_exact(
    ui,
    'for (const token of ["historySection", "markHistoryReopened", "forgetProjectHandles"]) {\n  if (!projectController.includes(token)) throw new Error(`Missing Project controller foundation token: ${token}`);\n}\n',
    'for (const token of ["historySection", "markHistoryReopened", "forgetProjectHandles"]) {\n  if (!projectController.includes(token)) throw new Error(`Missing Project controller foundation token: ${token}`);\n}\nfor (const token of ["renderCaseSurfaces", "pinEvidence", "evidence.imported", "Case Timeline"]) {\n  if (!investigationController.includes(token)) throw new Error(`Missing Investigation controller foundation token: ${token}`);\n}\n',
    'UI foundations Investigation tokens'
)
ui_foundations_path.write_text(ui)

controller_test_path.write_text(r'''import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const app = read("app.js");
const html = read("index.html");
const controller = read("src/app/investigation-controller.js");

assert.match(version, /^\d+\.\d+\.\d+$/, "VERSION must remain semantic");
assert.ok(app.includes(`const APP_VERSION = "${version}";`), "APP_VERSION must follow VERSION");
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
const projectIndex = scripts.indexOf("src/app/project-controller.js");
const controllerIndex = scripts.indexOf("src/app/investigation-controller.js");
const caseWorkspaceIndex = scripts.indexOf("src/app/case-workspace-controller.js");
const appIndex = scripts.indexOf("app.js");
assert.ok(projectIndex >= 0 && projectIndex < controllerIndex && controllerIndex < caseWorkspaceIndex && caseWorkspaceIndex < appIndex, "Investigation controller must load between Project and Case Workspace controllers before app.js");

for (const token of [
  "SignalDockInvestigationController.create",
  "investigationController.bind()",
  "investigationController?.renderCaseSurfaces()",
  "investigationController?.pinEvidence(entry",
  "investigationController?.recordActivity(\"case.imported\""
]) assert.ok(app.includes(token), `Investigation app integration token missing: ${token}`);

for (const token of [
  "function openInvestigation()",
  "function renderInvestigation()",
  "function renderInvestigationTimeline()",
  "function renderCaseActivity()",
  "function renderCaseUnifiedTimeline()",
  "function persistInvestigationMeta()",
  "function persistCaseMeta()",
  "function exportInvestigationBundle()",
  "function importInvestigationJson(",
  "el.addEvidenceButton?.addEventListener",
  "el.investigationList?.addEventListener",
  "el.caseTimelineList?.addEventListener"
]) assert.equal(app.includes(token), false, `Investigation UI implementation leaked back into app.js: ${token}`);

for (const token of [
  "const VERSION = 1",
  "SignalDockInvestigation",
  "SignalDockCaseWorkspace",
  "SignalDockCaseTimeline",
  "recordActivity",
  "renderCaseSurfaces",
  "pinEvidence",
  "Could not add evidence:",
  "not added",
  "function bind()",
  "function destroy()"
]) assert.ok(controller.includes(token), `Investigation controller quality token missing: ${token}`);

for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(controller.includes(forbidden), false, `Investigation controller must stay local-only and capability-narrow: ${forbidden}`);
}

const sandbox = { self: {}, console };
vm.runInNewContext(controller, sandbox, { filename: "investigation-controller.js" });
assert.equal(sandbox.self.SignalDockInvestigationController.VERSION, 1);
assert.equal(typeof sandbox.self.SignalDockInvestigationController.create, "function");
assert.equal(Object.isFrozen(sandbox.self.SignalDockInvestigationController), true);

console.log("investigation-controller-smoke PASS");
''')

print('v2.8.5 Investigation controller migration staged')
