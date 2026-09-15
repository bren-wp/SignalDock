(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      el,
      getUtils,
      toast,
      getSelectedEntry,
      recordCaseActivity,
      refreshCaseWorkspace,
      scheduleViewAutosave,
      scheduleDatasetAutosave
    } = options;

    if (!state || !el) throw new TypeError("Case Workspace controller requires state and element registries.");
    for (const [name, value] of Object.entries({
      getUtils,
      toast,
      getSelectedEntry,
      recordCaseActivity,
      refreshCaseWorkspace,
      scheduleViewAutosave,
      scheduleDatasetAutosave
    })) {
      if (typeof value !== "function") throw new TypeError(`Case Workspace controller requires ${name}().`);
    }
    if (!root.SignalDockCaseWorkspace) throw new Error("SignalDock Case Workspace domain module is unavailable.");

    const doc = el.caseFindings?.ownerDocument || el.caseMilestones?.ownerDocument || el.caseAttachments?.ownerDocument || root.document;
    if (!doc) throw new Error("Case Workspace controller requires a document.");

    let bound = false;
    const listeners = [];

    function workspace() {
      return root.SignalDockCaseWorkspace;
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

    function createEmpty(message) {
      const empty = doc.createElement("div");
      empty.className = "case-findings__empty";
      empty.textContent = message;
      return empty;
    }

    function createButton(label, action, idKey, id) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "button button--ghost button--small";
      button.textContent = label;
      button.dataset[action.key] = action.value;
      if (idKey && id) button.dataset[idKey] = id;
      return button;
    }

    function renderFindings() {
      if (!el.caseFindings) return;
      el.caseFindings.replaceChildren();
      if (!state.caseFile.findings.length) {
        el.caseFindings.appendChild(createEmpty("No findings yet. Add a finding when evidence supports or disproves a hypothesis."));
        return;
      }

      const evidence = Array.isArray(state.investigation?.items) ? state.investigation.items : [];
      for (const finding of state.caseFile.findings) {
        const card = doc.createElement("article");
        card.className = "case-finding";
        card.dataset.caseFindingId = finding.id;

        const top = doc.createElement("div");
        top.className = "case-finding__top";
        const title = doc.createElement("input");
        title.type = "text";
        title.maxLength = 180;
        title.value = finding.title || "";
        title.dataset.caseField = "title";
        title.dataset.caseFindingId = finding.id;
        title.setAttribute("aria-label", "Finding title");

        const stateSelect = doc.createElement("select");
        stateSelect.dataset.caseField = "state";
        stateSelect.dataset.caseFindingId = finding.id;
        for (const [value, label] of [["open", "Open"], ["confirmed", "Confirmed"], ["dismissed", "Dismissed"]]) {
          const option = doc.createElement("option");
          option.value = value;
          option.textContent = label;
          option.selected = finding.state === value;
          stateSelect.appendChild(option);
        }

        const remove = createButton("Remove", { key: "caseAction", value: "remove" }, "caseFindingId", finding.id);
        top.append(title, stateSelect, remove);

        const body = doc.createElement("textarea");
        body.rows = 2;
        body.maxLength = 12000;
        body.value = finding.body || "";
        body.dataset.caseField = "body";
        body.dataset.caseFindingId = finding.id;
        body.placeholder = "What did the evidence establish?";

        const meta = doc.createElement("div");
        meta.className = "case-finding__meta";
        const tagLabel = doc.createElement("label");
        tagLabel.append(doc.createTextNode("Tags"));
        const tags = doc.createElement("input");
        tags.type = "text";
        tags.value = (finding.tags || []).join(", ");
        tags.dataset.caseField = "tags";
        tags.dataset.caseFindingId = finding.id;
        tags.placeholder = "root-cause, auth, regression";
        tagLabel.appendChild(tags);

        const evidenceLabel = doc.createElement("label");
        evidenceLabel.append(doc.createTextNode("Linked evidence"));
        const select = doc.createElement("select");
        select.multiple = true;
        select.dataset.caseField = "evidenceIds";
        select.dataset.caseFindingId = finding.id;
        for (const [index, item] of evidence.entries()) {
          const option = doc.createElement("option");
          option.value = item.id;
          option.textContent = `${index + 1}. ${item.level || "UNKNOWN"} · ${item.service || "—"} · ${(item.message || "").slice(0, 80)}`;
          option.selected = finding.evidenceIds.includes(item.id);
          select.appendChild(option);
        }
        evidenceLabel.appendChild(select);
        meta.append(tagLabel, evidenceLabel);
        card.append(top, body, meta);
        el.caseFindings.appendChild(card);
      }
    }

    function addFinding() {
      try {
        const selected = getSelectedEntry();
        const pinned = selected ? state.investigation?.items?.find((item) => item.entryId === selected.id) : null;
        const result = workspace().addFinding(state.caseFile, { evidenceIds: pinned ? [pinned.id] : [] });
        state.caseFile = result.caseFile;
        recordCaseActivity("finding.added", "Finding added", result.finding.title || "New finding", { findingId: result.finding.id });
        refreshCaseWorkspace(true);
        persist();
        toast("Case finding added.");
      } catch (error) {
        toast(`Could not add finding: ${error.message || error}`, "error", 6500);
      }
    }

    function onFindingEdit(event) {
      const target = event.target;
      const id = target.dataset.caseFindingId;
      const field = target.dataset.caseField;
      if (!id || !field) return;
      let value = target.value;
      if (field === "evidenceIds") value = [...target.selectedOptions].map((option) => option.value);
      state.caseFile = workspace().updateFinding(state.caseFile, id, { [field]: value });
      if (event.type === "change") {
        recordCaseActivity("finding.updated", "Finding updated", `${field} changed`, { findingId: id });
        refreshCaseWorkspace(false);
      }
      persist();
    }

    function onFindingClick(event) {
      const button = event.target.closest("[data-case-action]");
      if (!button || button.dataset.caseAction !== "remove") return;
      const id = button.dataset.caseFindingId;
      const finding = state.caseFile?.findings?.find((item) => item.id === id);
      state.caseFile = workspace().removeFinding(state.caseFile, id);
      recordCaseActivity("finding.removed", "Finding removed", finding?.title || id, { findingId: id });
      refreshCaseWorkspace(true);
      persist();
    }

    function renderMilestones() {
      if (!el.caseMilestones) return;
      el.caseMilestones.replaceChildren();
      if (!state.caseFile.milestones.length) {
        el.caseMilestones.appendChild(createEmpty("No milestones yet."));
        return;
      }

      for (const item of [...state.caseFile.milestones].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
        const row = doc.createElement("article");
        row.className = "case-milestone";
        row.dataset.caseMilestoneId = item.id;

        const input = doc.createElement("input");
        input.value = item.title;
        input.dataset.caseMilestoneField = "title";
        input.maxLength = 180;

        const status = doc.createElement("select");
        status.dataset.caseMilestoneField = "status";
        for (const value of ["planned", "reached", "blocked"]) {
          const option = doc.createElement("option");
          option.value = value;
          option.textContent = value[0].toUpperCase() + value.slice(1);
          option.selected = item.status === value;
          status.appendChild(option);
        }

        const at = doc.createElement("input");
        at.type = "datetime-local";
        at.dataset.caseMilestoneField = "at";
        const timestamp = Date.parse(item.at);
        if (Number.isFinite(timestamp)) {
          const date = new Date(timestamp);
          at.value = new Date(timestamp - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }

        const note = doc.createElement("textarea");
        note.rows = 2;
        note.maxLength = 4000;
        note.value = item.note || "";
        note.dataset.caseMilestoneField = "note";
        const remove = createButton("Remove", { key: "caseMilestoneAction", value: "remove" });
        row.append(input, status, at, note, remove);
        el.caseMilestones.appendChild(row);
      }
    }

    function addMilestone() {
      try {
        const result = workspace().addMilestone(state.caseFile, {
          title: `Milestone ${(state.caseFile?.milestones?.length || 0) + 1}`,
          status: "planned",
          at: new Date().toISOString()
        });
        state.caseFile = result.caseFile;
        recordCaseActivity("milestone.added", "Milestone added", result.milestone.title);
        refreshCaseWorkspace(false);
        persist();
        toast("Case milestone added.");
      } catch (error) {
        toast(`Could not add milestone: ${error.message || error}`, "error", 6500);
      }
    }

    function onMilestoneEdit(event) {
      const row = event.target.closest("[data-case-milestone-id]");
      const field = event.target.dataset.caseMilestoneField;
      if (!row || !field) return;
      let value = event.target.value;
      if (field === "at" && value) {
        const timestamp = Date.parse(value);
        if (!Number.isFinite(timestamp)) {
          toast("Choose a valid milestone date and time.", "error");
          return;
        }
        value = new Date(timestamp).toISOString();
      }
      state.caseFile = workspace().updateMilestone(state.caseFile, row.dataset.caseMilestoneId, { [field]: value });
      if (event.type === "change") {
        recordCaseActivity("milestone.updated", "Milestone updated", `${field} changed`);
        refreshCaseWorkspace(false);
      }
      persist();
    }

    function onMilestoneClick(event) {
      const button = event.target.closest("[data-case-milestone-action]");
      const row = event.target.closest("[data-case-milestone-id]");
      if (!button || !row || button.dataset.caseMilestoneAction !== "remove") return;
      const item = state.caseFile.milestones.find((value) => value.id === row.dataset.caseMilestoneId);
      state.caseFile = workspace().removeMilestone(state.caseFile, row.dataset.caseMilestoneId);
      recordCaseActivity("milestone.removed", "Milestone removed", item?.title || row.dataset.caseMilestoneId);
      refreshCaseWorkspace(false);
      persist();
    }

    function renderAttachments() {
      if (!el.caseAttachments) return;
      el.caseAttachments.replaceChildren();
      if (!state.caseFile.attachments.length) {
        el.caseAttachments.appendChild(createEmpty("No local file references yet."));
        return;
      }

      for (const item of state.caseFile.attachments) {
        const row = doc.createElement("article");
        row.className = "case-attachment";
        row.dataset.caseAttachmentId = item.id;
        const meta = doc.createElement("div");
        const strong = doc.createElement("strong");
        strong.textContent = item.name;
        const small = doc.createElement("small");
        small.textContent = `${item.type || "unknown"} · ${utils().formatBytes(Number(item.size) || 0)} · metadata only`;
        meta.append(strong, small);
        const note = doc.createElement("input");
        note.value = item.note || "";
        note.maxLength = 2000;
        note.placeholder = "Why this local file matters";
        note.dataset.caseAttachmentField = "note";
        const remove = createButton("Remove", { key: "caseAttachmentAction", value: "remove" });
        row.append(meta, note, remove);
        el.caseAttachments.appendChild(row);
      }
    }

    async function addAttachmentMetadata(event) {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      let added = 0;
      let failure = null;
      try {
        for (const file of files) {
          try {
            const result = workspace().addAttachmentMetadata(state.caseFile, file);
            state.caseFile = result.caseFile;
            if (!result.added) continue;
            added += 1;
            recordCaseActivity("attachment.added", "Local file reference added", `${file.name} · ${utils().formatBytes(file.size)}`);
          } catch (error) {
            failure = error;
            break;
          }
        }
        if (added) {
          refreshCaseWorkspace(false);
          persist();
        }
        if (failure) toast(`Could not add another file reference: ${failure.message || failure}`, "error", 6500);
        else if (added) toast(`${added} local attachment reference${added === 1 ? "" : "s"} added. File contents were not stored.`);
        else toast("No new local file references were added.");
      } finally {
        event.target.value = "";
      }
    }

    function onAttachmentEdit(event) {
      const row = event.target.closest("[data-case-attachment-id]");
      if (!row || !event.target.dataset.caseAttachmentField) return;
      state.caseFile = workspace().updateAttachment(state.caseFile, row.dataset.caseAttachmentId, { note: event.target.value });
      persist();
    }

    function onAttachmentClick(event) {
      const button = event.target.closest("[data-case-attachment-action]");
      const row = event.target.closest("[data-case-attachment-id]");
      if (!button || !row || button.dataset.caseAttachmentAction !== "remove") return;
      const item = state.caseFile.attachments.find((value) => value.id === row.dataset.caseAttachmentId);
      state.caseFile = workspace().removeAttachment(state.caseFile, row.dataset.caseAttachmentId);
      recordCaseActivity("attachment.removed", "Local file reference removed", item?.name || row.dataset.caseAttachmentId);
      refreshCaseWorkspace(false);
      persist();
    }

    function render(options = {}) {
      state.caseFile = workspace().normalize(state.caseFile);
      renderMilestones();
      renderAttachments();
      if (options.rebuildFindings !== false) renderFindings();
    }

    function openAttachmentPicker() {
      el.caseAttachmentInput?.click();
    }

    function bind() {
      if (bound) return api;
      listen(el.addCaseFindingButton, "click", addFinding);
      listen(el.caseFindings, "input", onFindingEdit);
      listen(el.caseFindings, "change", onFindingEdit);
      listen(el.caseFindings, "click", onFindingClick);
      listen(el.addCaseMilestoneButton, "click", addMilestone);
      listen(el.caseMilestones, "click", onMilestoneClick);
      listen(el.caseMilestones, "change", onMilestoneEdit);
      listen(el.caseMilestones, "input", onMilestoneEdit);
      listen(el.addCaseAttachmentButton, "click", openAttachmentPicker);
      listen(el.caseAttachmentInput, "change", addAttachmentMetadata);
      listen(el.caseAttachments, "click", onAttachmentClick);
      listen(el.caseAttachments, "input", onAttachmentEdit);
      bound = true;
      return api;
    }

    function destroy() {
      if (!bound) return;
      for (const [node, type, handler] of listeners.splice(0)) node.removeEventListener(type, handler);
      bound = false;
    }

    const api = Object.freeze({ bind, destroy, render });
    return api;
  }

  root.SignalDockCaseWorkspaceController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
