(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      el,
      toast,
      renderCaseWorkspace,
      scheduleDatasetAutosave
    } = options;

    if (!state || !el) throw new TypeError("Case Checkpoint controller requires state and element registries.");
    for (const [name, value] of Object.entries({ toast, renderCaseWorkspace, scheduleDatasetAutosave })) {
      if (typeof value !== "function") throw new TypeError(`Case Checkpoint controller requires ${name}().`);
    }
    if (!root.SignalDockCaseCheckpoints) throw new Error("SignalDock Case Checkpoints domain module is unavailable.");

    const doc = el.caseCheckpoints?.ownerDocument || root.document;
    if (!doc) throw new Error("Case Checkpoint controller requires a document.");

    let bound = false;
    const listeners = [];

    function checkpoints() {
      return root.SignalDockCaseCheckpoints;
    }

    function listen(node, type, handler) {
      if (!node) return;
      node.addEventListener(type, handler);
      listeners.push([node, type, handler]);
    }

    function makeButton(label) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "button button--ghost button--small";
      button.textContent = label;
      return button;
    }

    function changeRow(label, value) {
      const row = doc.createElement("span");
      const strong = doc.createElement("strong");
      strong.textContent = label;
      row.append(strong, doc.createTextNode(` ${value}`));
      return row;
    }

    function formatDate(value) {
      const timestamp = Date.parse(String(value || ""));
      return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "Unknown time";
    }

    function render() {
      if (!el.caseCheckpoints) return;
      state.caseCheckpoints = checkpoints().normalizeList(state.caseCheckpoints);
      el.caseCheckpoints.replaceChildren();
      if (!state.caseCheckpoints.length) {
        const empty = doc.createElement("div");
        empty.className = "case-findings__empty";
        empty.textContent = "No case checkpoints yet.";
        el.caseCheckpoints.appendChild(empty);
        return;
      }

      for (const checkpoint of [...state.caseCheckpoints].reverse()) {
        const diff = checkpoints().diff(checkpoint, state.caseFile, state.investigation);
        const row = doc.createElement("article");
        row.className = "checkpoint-row";

        const copy = doc.createElement("div");
        const strong = doc.createElement("strong");
        strong.textContent = checkpoint.label;
        const small = doc.createElement("small");
        small.textContent = `${formatDate(checkpoint.createdAt)} · ${diff.summary.changedSections} changed sections · evidence +${diff.evidenceAdded.length}/-${diff.evidenceRemoved.length}`;
        copy.append(strong, small);

        const details = doc.createElement("details");
        details.className = "checkpoint-diff";
        const summary = doc.createElement("summary");
        summary.textContent = diff.summary.changedSections ? "Review changes since checkpoint" : "No structural changes since checkpoint";
        details.appendChild(summary);

        const changes = doc.createElement("div");
        changes.className = "checkpoint-diff__grid";
        for (const [field, values] of Object.entries(diff.fields)) {
          changes.appendChild(changeRow(field, `${values.before || "—"} → ${values.after || "—"}`));
        }
        if (diff.summary.findingChanges) changes.appendChild(changeRow("Findings", `+${diff.findings.added.length} / -${diff.findings.removed.length}`));
        if (diff.summary.milestoneChanges) changes.appendChild(changeRow("Milestones", `+${diff.milestones.added.length} / -${diff.milestones.removed.length}`));
        if (diff.summary.attachmentChanges) changes.appendChild(changeRow("Attachments", `+${diff.attachments.added.length} / -${diff.attachments.removed.length}`));
        if (diff.summary.evidenceChanges) changes.appendChild(changeRow("Evidence", `+${diff.evidenceAdded.length} / -${diff.evidenceRemoved.length}`));
        if (!changes.childElementCount) changes.appendChild(changeRow("State", "No changed fields or collection membership"));
        details.appendChild(changes);
        copy.appendChild(details);

        const actions = doc.createElement("div");
        for (const [action, label] of [["restore", "Restore case"], ["remove", "Remove"]]) {
          const button = makeButton(label);
          button.dataset.checkpointAction = action;
          button.dataset.checkpointId = checkpoint.id;
          actions.appendChild(button);
        }

        row.append(copy, actions);
        el.caseCheckpoints.appendChild(row);
      }
    }

    function createCheckpoint() {
      const checkpoint = checkpoints().create(state.caseFile, state.investigation, {
        label: el.caseCheckpointLabel?.value?.trim() || ""
      });
      state.caseCheckpoints = checkpoints().add(state.caseCheckpoints, checkpoint);
      if (el.caseCheckpointLabel) el.caseCheckpointLabel.value = "";
      render();
      scheduleDatasetAutosave();
      toast("Case checkpoint created.");
    }

    function syncCaseFields() {
      if (el.caseStatus) el.caseStatus.value = state.caseFile?.status || "open";
      if (el.caseSeverity) el.caseSeverity.value = state.caseFile?.severity || "none";
      if (el.caseHypothesis) el.caseHypothesis.value = state.caseFile?.hypothesis || "";
      if (el.caseImpact) el.caseImpact.value = state.caseFile?.impact || "";
      if (el.caseNextSteps) el.caseNextSteps.value = state.caseFile?.nextSteps || "";
    }

    function restoreCheckpoint(checkpoint) {
      state.caseFile = root.SignalDockCaseWorkspace?.normalize?.(checkpoint.caseFile) || checkpoint.caseFile;
      state.caseFile = root.SignalDockCaseWorkspace?.appendActivity?.(
        state.caseFile,
        "case.checkpoint.restored",
        { label: "Case checkpoint restored", detail: checkpoint.label }
      ) || state.caseFile;
      syncCaseFields();
      renderCaseWorkspace();
      scheduleDatasetAutosave();
      toast(`Restored case state from “${checkpoint.label}”.`);
    }

    function onClick(event) {
      const button = event.target.closest("[data-checkpoint-action]");
      if (!button) return;
      const checkpoint = state.caseCheckpoints.find((item) => item.id === button.dataset.checkpointId);
      if (!checkpoint) return;

      if (button.dataset.checkpointAction === "remove") {
        state.caseCheckpoints = checkpoints().remove(state.caseCheckpoints, checkpoint.id);
        render();
        scheduleDatasetAutosave();
        return;
      }
      if (button.dataset.checkpointAction === "restore") restoreCheckpoint(checkpoint);
    }

    function bind() {
      if (bound) return api;
      listen(el.addCaseCheckpointButton, "click", createCheckpoint);
      listen(el.caseCheckpoints, "click", onClick);
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

  root.SignalDockCaseCheckpointController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
