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
controller_path = root / 'src' / 'app' / 'case-checkpoint-controller.js'
controller_test_path = root / 'tests' / 'case-checkpoint-controller-smoke.mjs'
ui_foundations_path = root / 'tests' / 'ui-foundations-smoke.mjs'
source_layout_test_path = root / 'tests' / 'source-layout-smoke.mjs'

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.8.2";', 'const APP_VERSION = "2.8.3";', 'app version')
app = replace_exact(app, '  let projectController = null;\n', '  let projectController = null;\n  let caseCheckpointController = null;\n', 'checkpoint controller state slot')

init_anchor = '''    projectController.bind();
    state.caseCheckpoints = window.SignalDockCaseCheckpoints?.normalizeList?.([]) || [];
    projectController.render();
'''
init_replacement = '''    projectController.bind();
    state.caseCheckpoints = window.SignalDockCaseCheckpoints?.normalizeList?.([]) || [];
    if (!window.SignalDockCaseCheckpointController?.create) throw new Error("SignalDock Case Checkpoint controller is unavailable.");
    caseCheckpointController = window.SignalDockCaseCheckpointController.create({
      state,
      el,
      toast,
      renderCaseWorkspace: () => renderCaseWorkspace(),
      scheduleDatasetAutosave: () => scheduleDatasetAutosave()
    });
    caseCheckpointController.bind();
    projectController.render();
'''
app = replace_exact(app, init_anchor, init_replacement, 'checkpoint controller initialization')

events = '''    el.addCaseCheckpointButton?.addEventListener("click", createCaseCheckpoint);
    el.caseCheckpoints?.addEventListener("click", onCaseCheckpointClick);

'''
app = replace_exact(app, events, '', 'checkpoint event ownership')

render_anchor = '''    renderCaseActivity();
    renderCaseUnifiedTimeline();
    renderCaseMilestones();
    renderCaseAttachments();
    if (!rebuild) return;
'''
render_replacement = '''    renderCaseActivity();
    renderCaseUnifiedTimeline();
    renderCaseMilestones();
    renderCaseAttachments();
    caseCheckpointController?.render();
    if (!rebuild) return;
'''
app = replace_exact(app, render_anchor, render_replacement, 'checkpoint render integration')

block_start = app.find('  function createCaseCheckpoint() {')
block_end_token = '\n  function openHealth() {'
block_end = app.find(block_end_token, block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('Case Checkpoint implementation block not found')
app = app[:block_start] + app[block_end:]

for forbidden in [
    'function createCaseCheckpoint()',
    'function checkpointChangeRow(',
    'function renderCaseCheckpoints()',
    'function onCaseCheckpointClick(',
    'el.addCaseCheckpointButton?.addEventListener',
    'el.caseCheckpoints?.addEventListener'
]:
    if forbidden in app:
        raise SystemExit(f'legacy Case Checkpoint app wiring remains: {forbidden}')
app_path.write_text(app)

controller_path.parent.mkdir(parents=True, exist_ok=True)
controller_path.write_text(r'''(function (root) {
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
''')

index = index_path.read_text()
index = replace_exact(
    index,
    '  <script src="src/app/project-controller.js" defer></script>\n  <script src="app.js" defer></script>',
    '  <script src="src/app/project-controller.js" defer></script>\n  <script src="src/app/case-checkpoint-controller.js" defer></script>\n  <script src="app.js" defer></script>',
    'controller script load order'
)
index_path.write_text(index)

version_path.write_text('2.8.3\n')

readme = readme_path.read_text()
readme = replace_exact(readme, 'version-2.8.2-', 'version-2.8.3-', 'README version badge')
readme = replace_exact(readme, 'SignalDock v2.8.2 — real application UI', 'SignalDock v2.8.3 — real application UI', 'README caption version')
readme = replace_exact(readme, 'SignalDock v2.8.2 application screenshot', 'SignalDock v2.8.3 application screenshot', 'README screenshot alt version')
project_bullet = '- feature-level Project controller under `src/app/` that owns project UI/reopen orchestration while retaining the narrow desktop capability facade and portable-export stripping rules\n'
readme = replace_exact(
    readme,
    project_bullet,
    project_bullet + '- feature-level Case Checkpoint controller under `src/app/` that owns checkpoint rendering/actions while the bounded checkpoint model remains in `src/investigation/`\n',
    'README checkpoint controller bullet'
)
readme_path.write_text(readme)

changelog = changelog_path.read_text()
entry = '''## 2.8.3 — 2026-09-16

### Case Checkpoint application controller
- Extracted Case Checkpoint rendering, create/remove/restore actions and event ownership from the root `app.js` into `src/app/case-checkpoint-controller.js`.
- Kept checkpoint normalization, creation and diff semantics in `src/investigation/case-checkpoints.js`; the controller receives case-workspace rendering and autosave through narrow callbacks.
- Checkpoint rendering now refreshes as part of Case Workspace rendering, so restored/imported workspaces and subsequent case edits keep checkpoint diffs synchronized without requiring a checkpoint action first.
- Added defensive timestamp formatting plus idempotent listener binding/teardown.

### Regression coverage
- Added a dedicated Case Checkpoint controller smoke test and moved checkpoint UI ownership assertions out of the root application test surface.
- Extended the source-layout gate to require all four application controllers while preserving the zero-build static runtime.

'''
changelog = replace_exact(changelog, '# Changelog\n\n', '# Changelog\n\n' + entry, 'CHANGELOG insertion')
changelog_path.write_text(changelog)

source_layout = source_layout_path.read_text()
source_layout = replace_exact(
    source_layout,
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js` and `project-controller.js`.',
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js` and `case-checkpoint-controller.js`.',
    'source layout controller list'
)
source_layout_path.write_text(source_layout)

technical = technical_path.read_text()
technical = replace_exact(technical, 'Current version: **2.8.2**.', 'Current version: **2.8.3**.', 'technical current version')
project_paragraph = '`project-controller.js` owns Project Manager rendering, CRUD actions and explicit link/relink/reopen/forget orchestration. File parsing and workspace restore remain injected application callbacks, while filesystem access is limited to the existing `src/platform/desktop-bridge.js` capability facade. Portable project export/duplication rules remain in `src/investigation/project-manager.js`.\n'
technical = replace_exact(
    technical,
    project_paragraph,
    project_paragraph + '\n`case-checkpoint-controller.js` owns Case Checkpoint rendering and create/remove/restore UI actions. Checkpoint snapshots/diffs remain in `src/investigation/case-checkpoints.js`, while the controller receives Case Workspace refresh and autosave as narrow callbacks. Case Workspace rendering also refreshes checkpoint diffs so restored sessions and later edits remain visually synchronized.\n',
    'technical checkpoint controller paragraph'
)
technical_path.write_text(technical)

src_readme = src_readme_path.read_text()
src_readme = replace_exact(
    src_readme,
    '`app/project-controller.js` owns Project Manager UI and explicit reopen/link orchestration.\n',
    '`app/project-controller.js` owns Project Manager UI and explicit reopen/link orchestration.\n\n`app/case-checkpoint-controller.js` owns Case Checkpoint UI rendering and create/remove/restore event coordination.\n',
    'src README checkpoint controller'
)
src_readme_path.write_text(src_readme)

ui = ui_foundations_path.read_text()
ui = replace_exact(
    ui,
    'const projectController = fs.readFileSync(path.join(root, "src/app/project-controller.js"), "utf8");\n',
    'const projectController = fs.readFileSync(path.join(root, "src/app/project-controller.js"), "utf8");\nconst caseCheckpointController = fs.readFileSync(path.join(root, "src/app/case-checkpoint-controller.js"), "utf8");\n',
    'UI foundation controller import'
)
ui = replace_exact(ui, '  "checkpoint-diff",\n', '', 'remove checkpoint ownership from app assertion')
project_loop = '''for (const token of ["historySection", "markHistoryReopened", "forgetProjectHandles"]) {
  if (!projectController.includes(token)) throw new Error(`Missing Project controller foundation token: ${token}`);
}
'''
ui = replace_exact(
    ui,
    project_loop,
    project_loop + '''for (const token of ["checkpoint-diff", "case.checkpoint.restored", "scheduleDatasetAutosave", "renderCaseWorkspace"]) {
  if (!caseCheckpointController.includes(token)) throw new Error(`Missing Case Checkpoint controller foundation token: ${token}`);
}
''',
    'UI foundation checkpoint ownership'
)
ui_foundations_path.write_text(ui)

source_test = source_layout_test_path.read_text()
source_test = replace_exact(
    source_test,
    'for (const ref of ["src/app/query-library-controller.js", "src/app/baseline-controller.js", "src/app/project-controller.js"]) {',
    'for (const ref of ["src/app/query-library-controller.js", "src/app/baseline-controller.js", "src/app/project-controller.js", "src/app/case-checkpoint-controller.js"]) {',
    'source layout controller list'
)
source_layout_test_path.write_text(source_test)

controller_test_path.write_text(r'''import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const controller = fs.readFileSync(path.join(root, "src/app/case-checkpoint-controller.js"), "utf8");

assert.ok(html.includes('src/app/case-checkpoint-controller.js'), "Case Checkpoint controller must load before app.js");
assert.ok(app.includes("SignalDockCaseCheckpointController.create"), "root app must initialize Case Checkpoint controller");
assert.ok(app.includes("caseCheckpointController.bind()"), "root app must bind Case Checkpoint controller");
assert.ok(app.includes("caseCheckpointController?.render()"), "Case Workspace rendering must refresh checkpoint diffs");
assert.equal(app.includes("function createCaseCheckpoint()"), false, "checkpoint creation must not remain owned by app.js");
assert.equal(app.includes("function renderCaseCheckpoints()"), false, "checkpoint rendering must not remain owned by app.js");
assert.equal(app.includes("function onCaseCheckpointClick("), false, "checkpoint actions must not remain owned by app.js");
assert.equal(app.includes('el.addCaseCheckpointButton?.addEventListener'), false, "checkpoint event ownership must not be duplicated");

for (const token of [
  "const VERSION = 1",
  "SignalDockCaseCheckpoints",
  "SignalDockCaseWorkspace",
  "checkpoint-diff",
  "case.checkpoint.restored",
  "renderCaseWorkspace",
  "scheduleDatasetAutosave",
  "function bind()",
  "function destroy()",
  "Unknown time"
]) {
  assert.ok(controller.includes(token), `missing Case Checkpoint controller token: ${token}`);
}
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", ".invoke(", "localStorage", "sessionStorage"]) {
  assert.equal(controller.includes(forbidden), false, `Case Checkpoint controller must not introduce ${forbidden}`);
}

console.log("case-checkpoint-controller-smoke PASS");
''')

print('v2.8.3 Case Checkpoint controller migration staged')
