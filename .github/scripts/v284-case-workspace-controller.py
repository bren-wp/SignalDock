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
controller_path = root / 'src' / 'app' / 'case-workspace-controller.js'
controller_test_path = root / 'tests' / 'case-workspace-controller-smoke.mjs'
ui_foundations_path = root / 'tests' / 'ui-foundations-smoke.mjs'
source_layout_test_path = root / 'tests' / 'source-layout-smoke.mjs'
ci_path = root / '.github' / 'workflows' / 'ci.yml'

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.8.3";', 'const APP_VERSION = "2.8.4";', 'app version')
app = replace_exact(
    app,
    '  let projectController = null;\n  let caseCheckpointController = null;\n',
    '  let projectController = null;\n  let caseWorkspaceController = null;\n  let caseCheckpointController = null;\n',
    'Case Workspace controller state slot'
)

init_anchor = '''    projectController.bind();
    state.caseCheckpoints = window.SignalDockCaseCheckpoints?.normalizeList?.([]) || [];
'''
init_replacement = '''    projectController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
    caseWorkspaceController = window.SignalDockCaseWorkspaceController.create({
      state,
      el,
      getUtils: utils,
      toast,
      getSelectedEntry: selectedEntry,
      recordCaseActivity,
      refreshCaseWorkspace: (rebuild = true) => renderCaseWorkspace(rebuild),
      scheduleViewAutosave: () => scheduleViewAutosave(),
      scheduleDatasetAutosave: () => scheduleDatasetAutosave()
    });
    caseWorkspaceController.bind();
    state.caseCheckpoints = window.SignalDockCaseCheckpoints?.normalizeList?.([]) || [];
'''
app = replace_exact(app, init_anchor, init_replacement, 'Case Workspace controller initialization')

event_block = '''    el.addCaseFindingButton?.addEventListener("click", addCaseFinding);
    el.exportCaseMarkdownButton?.addEventListener("click", exportCaseMarkdown);
    el.exportCaseJsonButton?.addEventListener("click", exportCaseJson);
    el.importCaseJsonButton?.addEventListener("click", () => el.caseFileInput?.click());
    el.caseFileInput?.addEventListener("change", importCaseJson);
    el.caseFindings?.addEventListener("input", onCaseFindingEdit);
    el.caseFindings?.addEventListener("change", onCaseFindingEdit);
    el.caseFindings?.addEventListener("click", onCaseFindingClick);
    el.addCaseMilestoneButton?.addEventListener("click", addCaseMilestone);
    el.caseMilestones?.addEventListener("click", onCaseMilestoneClick);
    el.caseMilestones?.addEventListener("change", onCaseMilestoneEdit);
    el.caseMilestones?.addEventListener("input", onCaseMilestoneEdit);
    el.addCaseAttachmentButton?.addEventListener("click", () => el.caseAttachmentInput?.click());
    el.caseAttachmentInput?.addEventListener("change", addCaseAttachmentMetadata);
    el.caseAttachments?.addEventListener("click", onCaseAttachmentClick);
    el.caseAttachments?.addEventListener("input", onCaseAttachmentEdit);
'''
event_replacement = '''    el.exportCaseMarkdownButton?.addEventListener("click", exportCaseMarkdown);
    el.exportCaseJsonButton?.addEventListener("click", exportCaseJson);
    el.importCaseJsonButton?.addEventListener("click", () => el.caseFileInput?.click());
    el.caseFileInput?.addEventListener("change", importCaseJson);
'''
app = replace_exact(app, event_block, event_replacement, 'Case Workspace event ownership')

block_start = app.find('  function renderCaseWorkspace(rebuild = true) {')
block_end = app.find('  async function exportCaseJson() {', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('Case Workspace application block not found')
new_render = '''  function renderCaseWorkspace(rebuild = true) {
    if (!window.SignalDockCaseWorkspace || !el.caseFindings) return;
    state.caseFile = window.SignalDockCaseWorkspace.pruneEvidenceLinks(state.caseFile, state.investigation?.items || []);
    const summary = window.SignalDockCaseWorkspace.summarize(state.caseFile, state.investigation?.items || []);
    if (el.caseWorkspaceStats) el.caseWorkspaceStats.textContent = `${summary.findings} findings · ${summary.confirmed} confirmed · ${summary.linkedEvidence} linked evidence`;
    renderCaseActivity();
    renderCaseUnifiedTimeline();
    caseWorkspaceController?.render({ rebuildFindings: rebuild });
    caseCheckpointController?.render();
  }

'''
app = app[:block_start] + new_render + app[block_end:]

for forbidden in [
    'function addCaseFinding()',
    'function onCaseFindingEdit(',
    'function onCaseFindingClick(',
    'function renderCaseMilestones()',
    'function addCaseMilestone()',
    'function onCaseMilestoneEdit(',
    'function onCaseMilestoneClick(',
    'function renderCaseAttachments()',
    'function addCaseAttachmentMetadata(',
    'function onCaseAttachmentEdit(',
    'function onCaseAttachmentClick(',
    'el.addCaseFindingButton?.addEventListener',
    'el.caseFindings?.addEventListener',
    'el.addCaseMilestoneButton?.addEventListener',
    'el.caseMilestones?.addEventListener',
    'el.addCaseAttachmentButton?.addEventListener',
    'el.caseAttachmentInput?.addEventListener',
    'el.caseAttachments?.addEventListener'
]:
    if forbidden in app:
        raise SystemExit(f'legacy Case Workspace UI wiring remains: {forbidden}')
app_path.write_text(app)

controller_path.parent.mkdir(parents=True, exist_ok=True)
controller_path.write_text(r'''(function (root) {
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
''')

index = index_path.read_text()
index = replace_exact(
    index,
    '  <script src="src/app/project-controller.js" defer></script>\n  <script src="src/app/case-checkpoint-controller.js" defer></script>\n  <script src="app.js" defer></script>',
    '  <script src="src/app/project-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n  <script src="src/app/case-checkpoint-controller.js" defer></script>\n  <script src="app.js" defer></script>',
    'Case Workspace controller script load order'
)
index_path.write_text(index)

version_path.write_text('2.8.4\n')

readme = readme_path.read_text()
readme = replace_exact(readme, 'version-2.8.3-', 'version-2.8.4-', 'README version badge')
readme = replace_exact(readme, 'SignalDock v2.8.3 — real application UI', 'SignalDock v2.8.4 — real application UI', 'README caption version')
readme = replace_exact(readme, 'SignalDock v2.8.3 application screenshot', 'SignalDock v2.8.4 application screenshot', 'README screenshot alt version')
checkpoint_bullet = '- feature-level Case Checkpoint controller under `src/app/` that owns checkpoint rendering/actions while the bounded checkpoint model remains in `src/investigation/`\n'
readme = replace_exact(
    readme,
    checkpoint_bullet,
    checkpoint_bullet + '- feature-level Case Workspace controller under `src/app/` that owns findings, milestones and metadata-only attachment UI coordination while case normalization/persistence rules stay in `src/investigation/`\n',
    'README Case Workspace controller bullet'
)
readme_path.write_text(readme)

changelog = changelog_path.read_text()
entry = '''## 2.8.4 — 2026-09-16

### Case Workspace application controller
- Extracted findings, milestones and metadata-only attachment rendering/actions from the root `app.js` into `src/app/case-workspace-controller.js`.
- Preserved Case Workspace normalization, limits, merge/export rules and attachment metadata-only guarantees in `src/investigation/case-workspace.js`.
- Added idempotent event binding/teardown and a single persistence helper for view/dataset autosave scheduling.
- Milestone changes now refresh the unified Case Timeline and related Case surfaces after committed edits instead of leaving the visible timeline stale until another render.
- Invalid milestone dates and Case Workspace collection limits now surface controlled user feedback instead of allowing unhandled UI exceptions; duplicate attachment selections report that no new references were added.

### Regression coverage
- Added a dedicated Case Workspace controller smoke test covering ownership boundaries, local-only constraints and controller load order.
- Extended permanent source-layout and HTTP smoke gates to require all five application controllers.

'''
changelog = replace_exact(changelog, '# Changelog\n\n', '# Changelog\n\n' + entry, 'CHANGELOG insertion')
changelog_path.write_text(changelog)

source_layout = source_layout_path.read_text()
source_layout = replace_exact(
    source_layout,
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js` and `case-checkpoint-controller.js`.',
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'source layout controller list'
)
source_layout_path.write_text(source_layout)

technical = technical_path.read_text()
technical = replace_exact(technical, 'Current version: **2.8.3**.', 'Current version: **2.8.4**.', 'technical current version')
checkpoint_paragraph = '`case-checkpoint-controller.js` owns Case Checkpoint rendering and create/remove/restore UI actions. Checkpoint snapshots/diffs remain in `src/investigation/case-checkpoints.js`, while the controller receives Case Workspace refresh and autosave as narrow callbacks. Case Workspace rendering also refreshes checkpoint diffs so restored sessions and later edits remain visually synchronized.\n'
technical = replace_exact(
    technical,
    checkpoint_paragraph,
    checkpoint_paragraph + '\n`case-workspace-controller.js` owns findings, milestones and metadata-only attachment rendering plus their delegated UI events. The Case Workspace domain module remains authoritative for normalization, bounds and metadata-only attachment records. Cross-feature effects such as selected-entry lookup, activity recording, workspace refresh and autosave are injected callbacks rather than hidden global dependencies.\n',
    'technical Case Workspace controller paragraph'
)
technical_path.write_text(technical)

src_readme = src_readme_path.read_text()
src_readme = replace_exact(
    src_readme,
    '`app/case-checkpoint-controller.js` owns Case Checkpoint UI rendering and create/remove/restore event coordination.\n',
    '`app/case-checkpoint-controller.js` owns Case Checkpoint UI rendering and create/remove/restore event coordination.\n\n`app/case-workspace-controller.js` owns findings, milestones and metadata-only attachment UI coordination.\n',
    'src README Case Workspace controller'
)
src_readme_path.write_text(src_readme)

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
const controller = read("src/app/case-workspace-controller.js");

assert.match(version, /^\d+\.\d+\.\d+$/, "VERSION must remain semantic");
assert.ok(app.includes(`const APP_VERSION = "${version}";`), "APP_VERSION must follow VERSION");
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
const controllerIndex = scripts.indexOf("src/app/case-workspace-controller.js");
const checkpointIndex = scripts.indexOf("src/app/case-checkpoint-controller.js");
const appIndex = scripts.indexOf("app.js");
assert.ok(controllerIndex >= 0 && controllerIndex < checkpointIndex && checkpointIndex < appIndex, "Case Workspace controller must load before checkpoint controller and app.js");

for (const token of [
  "SignalDockCaseWorkspaceController.create",
  "caseWorkspaceController.bind()",
  "caseWorkspaceController?.render({ rebuildFindings: rebuild })"
]) assert.ok(app.includes(token), `Case Workspace app integration token missing: ${token}`);

for (const token of [
  "function addCaseFinding()",
  "function onCaseFindingEdit(",
  "function renderCaseMilestones()",
  "function addCaseMilestone()",
  "function renderCaseAttachments()",
  "function addCaseAttachmentMetadata(",
  "el.addCaseFindingButton?.addEventListener",
  "el.addCaseMilestoneButton?.addEventListener",
  "el.addCaseAttachmentButton?.addEventListener"
]) assert.equal(app.includes(token), false, `Case Workspace UI implementation leaked back into app.js: ${token}`);

for (const token of [
  "const VERSION = 1",
  "SignalDockCaseWorkspace",
  "getSelectedEntry",
  "recordCaseActivity",
  "refreshCaseWorkspace",
  "scheduleViewAutosave",
  "scheduleDatasetAutosave",
  "metadata only",
  "Choose a valid milestone date and time.",
  "No new local file references were added.",
  "function bind()",
  "function destroy()"
]) assert.ok(controller.includes(token), `Case Workspace controller quality token missing: ${token}`);

for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(controller.includes(forbidden), false, `Case Workspace controller must stay local-only and capability-narrow: ${forbidden}`);
}

const sandbox = { self: {}, console };
vm.runInNewContext(controller, sandbox, { filename: "case-workspace-controller.js" });
assert.equal(sandbox.self.SignalDockCaseWorkspaceController.VERSION, 1);
assert.equal(typeof sandbox.self.SignalDockCaseWorkspaceController.create, "function");
assert.equal(Object.isFrozen(sandbox.self.SignalDockCaseWorkspaceController), true);

console.log("case-workspace-controller-smoke PASS");
''')

source_layout_test = source_layout_test_path.read_text()
source_layout_test = replace_exact(
    source_layout_test,
    'for (const ref of ["src/app/query-library-controller.js", "src/app/baseline-controller.js", "src/app/project-controller.js", "src/app/case-checkpoint-controller.js"]) {\n',
    'for (const ref of ["src/app/query-library-controller.js", "src/app/baseline-controller.js", "src/app/project-controller.js", "src/app/case-workspace-controller.js", "src/app/case-checkpoint-controller.js"]) {\n',
    'source-layout HTML controller list'
)
source_layout_test = replace_exact(
    source_layout_test,
    '''for (const ref of [
  "src/app/query-library-controller.js",
  "src/app/baseline-controller.js",
  "src/app/project-controller.js",
  "src/app/case-checkpoint-controller.js"
]) {
''',
    '''for (const ref of [
  "src/app/query-library-controller.js",
  "src/app/baseline-controller.js",
  "src/app/project-controller.js",
  "src/app/case-workspace-controller.js",
  "src/app/case-checkpoint-controller.js"
]) {
''',
    'source-layout CI controller list'
)
source_layout_test_path.write_text(source_layout_test)

ui = ui_foundations_path.read_text()
ui = replace_exact(
    ui,
    'const caseCheckpointController = fs.readFileSync(path.join(root, "src/app/case-checkpoint-controller.js"), "utf8");\n',
    'const caseCheckpointController = fs.readFileSync(path.join(root, "src/app/case-checkpoint-controller.js"), "utf8");\nconst caseWorkspaceController = fs.readFileSync(path.join(root, "src/app/case-workspace-controller.js"), "utf8");\n',
    'UI foundations Case Workspace controller read'
)
checkpoint_loop = '''for (const token of ["checkpoint-diff", "case.checkpoint.restored", "scheduleDatasetAutosave", "renderCaseWorkspace"]) {
  if (!caseCheckpointController.includes(token)) throw new Error(`Missing Case Checkpoint controller foundation token: ${token}`);
}
'''
ui = replace_exact(
    ui,
    checkpoint_loop,
    checkpoint_loop + '''for (const token of ["case-finding", "case-milestone", "case-attachment", "refreshCaseWorkspace", "metadata only"]) {
  if (!caseWorkspaceController.includes(token)) throw new Error(`Missing Case Workspace controller foundation token: ${token}`);
}
''',
    'UI foundations Case Workspace tokens'
)
ui_foundations_path.write_text(ui)

ci = ci_path.read_text()
ci = replace_exact(
    ci,
    '          curl --fail --silent --show-error http://127.0.0.1:8080/src/app/project-controller.js -o /dev/null\n',
    '          curl --fail --silent --show-error http://127.0.0.1:8080/src/app/project-controller.js -o /dev/null\n          curl --fail --silent --show-error http://127.0.0.1:8080/src/app/case-workspace-controller.js -o /dev/null\n',
    'CI Case Workspace controller HTTP smoke'
)
ci_path.write_text(ci)

print('v2.8.4 Case Workspace controller migration staged')
