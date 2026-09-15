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
controller_path = root / 'src' / 'app' / 'project-controller.js'
controller_test_path = root / 'tests' / 'project-controller-smoke.mjs'

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.8.1";', 'const APP_VERSION = "2.8.2";', 'app version')
app = replace_exact(app, '  let baselineController = null;\n', '  let baselineController = null;\n  let projectController = null;\n', 'project controller state slot')
app = replace_exact(app, '      projects: openProjects,\n', '      projects: () => projectController?.open(),\n', 'project nav route')
app = replace_exact(app, '      renderProjects,\n', '      renderProjects: () => projectController?.render(),\n', 'baseline project render callback')

project_state_anchor = '''    state.projects = window.SignalDockProjectManager?.load?.() || [];
    state.activeProjectId = String(utils().loadJson("signaldock-active-project-v1", "") || "");
'''
project_init = project_state_anchor + '''    if (!window.SignalDockProjectController?.create) throw new Error("SignalDock Project controller is unavailable.");
    projectController = window.SignalDockProjectController.create({
      state,
      el,
      getUtils: utils,
      toast,
      closeCompetingDialogs,
      showDialogSafely,
      projectDatasetId,
      loadFiles: (files, options) => handleFiles(files, options),
      restoreWorkspaceFile: (file) => restoreWorkspace(file),
      refreshBaselineHistory: () => baselineController?.renderHistory()
    });
    projectController.bind();
'''
app = replace_exact(app, project_state_anchor, project_init, 'project controller initialization')
app = replace_exact(app, '    renderProjects();\n    applySettings();', '    projectController.render();\n    applySettings();', 'initial project render')

project_events = '''    el.closeProjectButton?.addEventListener("click", closeProjects);
    el.createProjectButton?.addEventListener("click", createProject);
    el.projectLinkFilesButton?.addEventListener("click", linkAndLoadProjectFiles);
    el.exportProjectsButton?.addEventListener("click", exportProjects);
    el.importProjectsButton?.addEventListener("click", () => el.projectsFileInput?.click());
    el.projectsFileInput?.addEventListener("change", importProjects);
    el.projectList?.addEventListener("click", onProjectListClick);
'''
app = replace_exact(app, project_events, '', 'project event wiring')

block_start = app.find('function openProjects() {')
block_end_token = '\n  function createCaseCheckpoint() {'
block_end = app.find(block_end_token, block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('project implementation block not found')
app = app[:block_start] + app[block_end:]

app = app.replace('renderProjects();', 'projectController?.render();')

for forbidden in [
    'function openProjects()',
    'function closeProjects()',
    'function persistActiveProject()',
    'function createProject()',
    'function projectHistorySection(',
    'function renderProjects()',
    'function linkAndLoadProjectFiles()',
    'function relinkProjectHistoryItem(',
    'function reopenProjectHistoryItem(',
    'function onProjectListClick(',
    'function exportProjects()',
    'function importProjects(',
    'el.createProjectButton?.addEventListener',
    'renderProjects();'
]:
    if forbidden in app:
        raise SystemExit(f'legacy Project app wiring remains: {forbidden}')
app_path.write_text(app)

controller_path.parent.mkdir(parents=True, exist_ok=True)
controller_path.write_text(r'''(function (root) {
  "use strict";

  const VERSION = 1;
  const ACTIVE_PROJECT_KEY = "signaldock-active-project-v1";
  const MIME_JSON = "application/json;charset=utf-8";
  const HISTORY_FIELDS = new Set(["recentWorkspaces", "recentDatasets"]);
  const PROJECT_FILE_TYPES = Object.freeze([{
    description: "SignalDock log datasets",
    accept: {
      "application/json": [".json", ".jsonl", ".ndjson"],
      "text/plain": [".log", ".txt"],
      "application/zip": [".zip"]
    }
  }]);

  function create(options = {}) {
    const {
      state,
      el,
      getUtils,
      toast,
      closeCompetingDialogs,
      showDialogSafely,
      projectDatasetId,
      loadFiles,
      restoreWorkspaceFile,
      refreshBaselineHistory,
      confirmAction = (message) => Boolean(root.confirm?.(message))
    } = options;

    const requiredFunctions = {
      getUtils,
      toast,
      closeCompetingDialogs,
      showDialogSafely,
      projectDatasetId,
      loadFiles,
      restoreWorkspaceFile,
      refreshBaselineHistory
    };
    if (!state || !el) throw new TypeError("Project controller requires state and element registries.");
    for (const [name, value] of Object.entries(requiredFunctions)) {
      if (typeof value !== "function") throw new TypeError(`Project controller requires ${name}().`);
    }
    if (!root.SignalDockProjectManager) throw new Error("SignalDock Project Manager is unavailable.");

    const doc = el.projectDialog?.ownerDocument || root.document;
    if (!doc) throw new Error("Project controller requires a document.");

    let bound = false;
    const listeners = [];

    function manager() {
      return root.SignalDockProjectManager;
    }

    function bridge() {
      return root.SignalDockDesktopBridge;
    }

    function listen(node, type, handler) {
      if (!node) return;
      node.addEventListener(type, handler);
      listeners.push([node, type, handler]);
    }

    function makeButton(label, className = "button button--ghost button--small") {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = className;
      button.textContent = label;
      return button;
    }

    function formatDate(value, fallback = "Unknown time") {
      const timestamp = Date.parse(String(value || ""));
      return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : fallback;
    }

    function persistActiveProject() {
      getUtils().saveJson(ACTIVE_PROJECT_KEY, state.activeProjectId || "");
    }

    function notifyProjectContextChanged() {
      refreshBaselineHistory();
    }

    function historyButton(project, field, item, action, label, primary = false) {
      const button = makeButton(label, primary ? "button button--primary button--small" : undefined);
      button.dataset.projectHistoryAction = action;
      button.dataset.projectId = project.id;
      button.dataset.projectField = field;
      button.dataset.projectItemId = item.id;
      return button;
    }

    function historySection(project) {
      const details = doc.createElement("details");
      details.className = "project-history";
      const summary = doc.createElement("summary");
      summary.textContent = `${project.recentWorkspaces.length} sessions · ${project.recentDatasets.length} datasets · ${project.baselines.length} baselines · ${project.cases.length} cases`;
      details.appendChild(summary);

      const grid = doc.createElement("div");
      grid.className = "project-history__grid";
      const linkedSections = [
        ["Recent workspaces", "recentWorkspaces", project.recentWorkspaces, (item) => `${item.name} · ${formatDate(item.openedAt)}`],
        ["Recent datasets", "recentDatasets", project.recentDatasets, (item) => `${item.name} · ${getUtils().formatBytes(item.size)}`]
      ];

      for (const [label, field, values, format] of linkedSections) {
        const section = doc.createElement("section");
        const strong = doc.createElement("strong");
        strong.textContent = label;
        section.appendChild(strong);
        if (!values.length) {
          const small = doc.createElement("small");
          small.textContent = "No history yet";
          section.appendChild(small);
        } else {
          for (const item of values.slice(0, 5)) {
            const row = doc.createElement("div");
            row.className = "project-history-item";
            const copy = doc.createElement("div");
            const small = doc.createElement("small");
            small.textContent = format(item);
            const badge = doc.createElement("span");
            badge.className = `project-link-state${item.handleRef ? " is-linked" : ""}`;
            badge.textContent = item.handleRef ? `Linked${item.reopenCount ? ` · reopened ${item.reopenCount}×` : ""}` : "Metadata only";
            copy.append(small, badge);
            const actions = doc.createElement("div");
            if (item.handleRef) {
              actions.append(
                historyButton(project, field, item, "reopen", "Reopen", true),
                historyButton(project, field, item, "forget", "Forget link")
              );
            } else {
              actions.append(historyButton(project, field, item, "relink", "Relink"));
            }
            row.append(copy, actions);
            section.appendChild(row);
          }
        }
        grid.appendChild(section);
      }

      const metadataSections = [
        ["Baselines", project.baselines, (item) => `${item.name} · ${formatDate(item.capturedAt)}`],
        ["Cases", project.cases, (item) => `${item.title} · ${item.status}`]
      ];
      for (const [label, values, format] of metadataSections) {
        const section = doc.createElement("section");
        const strong = doc.createElement("strong");
        strong.textContent = label;
        section.appendChild(strong);
        if (!values.length) {
          const small = doc.createElement("small");
          small.textContent = "No history yet";
          section.appendChild(small);
        } else {
          for (const item of values.slice(0, 5)) {
            const small = doc.createElement("small");
            small.textContent = format(item);
            section.appendChild(small);
          }
        }
        grid.appendChild(section);
      }
      details.appendChild(grid);
      return details;
    }

    function render() {
      if (!el.projectList) return;
      state.projects = manager().load?.() || state.projects || [];
      if (state.activeProjectId && !state.projects.some((project) => project.id === state.activeProjectId)) {
        state.activeProjectId = "";
        persistActiveProject();
      }
      if (el.projectCount) el.projectCount.textContent = String(state.projects.filter((project) => !project.archived).length);
      const active = state.projects.find((project) => project.id === state.activeProjectId);
      const capabilities = bridge()?.capabilities?.() || { mode: "browser", filePicker: false, persistentHandles: false };

      if (el.projectLinkFilesButton) {
        el.projectLinkFilesButton.disabled = !active || active.archived || !capabilities.filePicker;
        el.projectLinkFilesButton.title = !active
          ? "Activate a project first"
          : !capabilities.filePicker
            ? "File linking is unavailable in this browser"
            : "Choose local log files, load them and remember reopen access for this project";
      }
      if (el.projectCapabilityMeta) {
        el.projectCapabilityMeta.textContent = capabilities.persistentHandles
          ? "Linked files can be reopened on this device. File access never leaves SignalDock."
          : "Project history stays local, but linked files may need to be selected again.";
      }
      if (el.activeProjectMeta) {
        el.activeProjectMeta.textContent = active
          ? `Active · ${active.name} · ${active.recentDatasets.length} recent datasets · ${active.baselines.length} baselines${active.lastWorkspace ? ` · last session: ${active.lastWorkspace}` : ""}`
          : "No active project.";
      }

      el.projectList.replaceChildren();
      if (!state.projects.length) {
        const empty = doc.createElement("div");
        empty.className = "case-findings__empty";
        empty.textContent = "No local projects yet.";
        el.projectList.appendChild(empty);
        return;
      }

      for (const project of state.projects) {
        const row = doc.createElement("article");
        row.className = `project-row${project.id === state.activeProjectId ? " is-active" : ""}${project.archived ? " is-archived" : ""}`;
        const copy = doc.createElement("div");
        const strong = doc.createElement("strong");
        strong.textContent = `${project.name}${project.archived ? " · Archived" : ""}`;
        const small = doc.createElement("small");
        small.textContent = [project.description || "Local project", project.tags.join(" · ")].filter(Boolean).join(" · ");
        copy.append(strong, small, historySection(project));

        const actions = doc.createElement("div");
        for (const [action, label] of [
          ["activate", project.id === state.activeProjectId ? "Active" : "Activate"],
          ["duplicate", "Duplicate"],
          ["archive", project.archived ? "Unarchive" : "Archive"],
          ["delete", "Delete"]
        ]) {
          const button = makeButton(label);
          button.dataset.projectAction = action;
          button.dataset.projectId = project.id;
          button.disabled = action === "activate" && (project.id === state.activeProjectId || project.archived);
          actions.appendChild(button);
        }
        row.append(copy, actions);
        el.projectList.appendChild(row);
      }
    }

    function open() {
      closeCompetingDialogs("projectDialog");
      render();
      showDialogSafely(el.projectDialog);
    }

    function close() {
      if (!el.projectDialog) return;
      if (typeof el.projectDialog.close === "function" && el.projectDialog.open) el.projectDialog.close();
      else el.projectDialog.removeAttribute("open");
    }

    function createProject() {
      try {
        const result = manager().create(state.projects, {
          name: el.projectName?.value || "",
          description: el.projectDescription?.value || ""
        });
        state.projects = result.projects;
        state.activeProjectId = result.project.id;
        persistActiveProject();
        if (el.projectName) el.projectName.value = "";
        if (el.projectDescription) el.projectDescription.value = "";
        render();
        notifyProjectContextChanged();
        toast(`Created project “${result.project.name}”.`);
      } catch (error) {
        toast(error.message || String(error), "error", 6500);
      }
    }

    async function linkAndLoadFiles() {
      const desktop = bridge();
      const project = state.projects.find((item) => item.id === state.activeProjectId);
      if (!project || project.archived) {
        toast("Activate a non-archived project before linking local files.", "error");
        return;
      }
      if (!desktop?.pickFiles) {
        toast("Persistent local file linking is unavailable in this runtime.", "error");
        return;
      }
      try {
        const records = await desktop.pickFiles({
          multiple: true,
          maxFiles: 64,
          persistHandle: true,
          projectId: project.id,
          idPrefix: "dataset",
          note: "SignalDock linked project dataset",
          types: PROJECT_FILE_TYPES
        });
        if (!records.length) return;
        const projectItems = records.map((record) => ({
          file: record.file,
          historyId: projectDatasetId(record.file),
          handleRef: record.handleRef,
          handleKind: "file"
        }));
        const result = await loadFiles(records.map((record) => record.file), { projectItems });
        const loaded = new Set(result?.loadedIds || []);
        for (const item of projectItems) {
          if (item.handleRef && !loaded.has(item.historyId)) await desktop.forgetHandle?.(item.handleRef);
        }
        render();
        if (loaded.size) toast(`Linked ${loaded.size} dataset${loaded.size === 1 ? "" : "s"} to “${project.name}”.`);
      } catch (error) {
        toast(`Could not link local files: ${error.message || error}`, "error", 7000);
      }
    }

    async function relinkHistoryItem(project, field, item) {
      const desktop = bridge();
      if (!desktop?.pickFiles) {
        toast("Persistent local file linking is unavailable in this runtime.", "error");
        return;
      }
      const records = await desktop.pickFiles({
        multiple: false,
        maxFiles: 1,
        persistHandle: true,
        projectId: project.id,
        idPrefix: `relink-${item.id}`,
        note: `SignalDock relink: ${item.name}`
      });
      if (!records.length) return;
      const record = records[0];
      const mismatch = record.file.name !== item.name || (item.size && Number(record.file.size) !== Number(item.size));
      if (mismatch && !confirmAction(`The selected file does not match the saved name/size for “${item.name}”. Link it anyway?`)) {
        if (record.handleRef) await desktop.forgetHandle?.(record.handleRef);
        return;
      }
      state.projects = manager().linkHistoryHandle(state.projects, project.id, field, item.id, record.handleRef, "file");
      render();
      toast(`Relinked “${item.name}”.`);
    }

    async function reopenHistoryItem(project, field, item) {
      const desktop = bridge();
      if (!item.handleRef || !desktop?.reopenFile) {
        toast("This history entry has no local reopen link.", "error");
        return;
      }
      try {
        const record = await desktop.reopenFile(item.handleRef, { requestPermission: true });
        if (field === "recentWorkspaces") {
          await restoreWorkspaceFile(record.file);
          state.activeProjectId = project.id;
          persistActiveProject();
          state.projects = manager().markHistoryReopened(state.projects, project.id, field, item.id);
        } else {
          const result = await loadFiles([record.file], {
            projectItems: [{ file: record.file, historyId: item.id, handleRef: item.handleRef, handleKind: "file" }]
          });
          if (!(result?.loadedIds || []).includes(item.id)) return;
          state.projects = manager().markHistoryReopened(state.projects, project.id, field, item.id);
        }
        render();
        notifyProjectContextChanged();
        toast(`Reopened “${item.name}” locally.`);
      } catch (error) {
        toast(`Could not reopen “${item.name}”: ${error.message || error}`, "error", 7500);
      }
    }

    async function onHistoryAction(button) {
      const project = state.projects.find((item) => item.id === button.dataset.projectId);
      const field = button.dataset.projectField;
      const item = project?.[field]?.find((entry) => entry.id === button.dataset.projectItemId);
      if (!project || !item || !HISTORY_FIELDS.has(field)) return;
      const action = button.dataset.projectHistoryAction;
      if (action === "reopen") {
        await reopenHistoryItem(project, field, item);
        return;
      }
      if (action === "relink") {
        try {
          await relinkHistoryItem(project, field, item);
        } catch (error) {
          toast(`Could not relink “${item.name}”: ${error.message || error}`, "error", 7000);
        }
        return;
      }
      if (action === "forget") {
        try {
          if (item.handleRef) await bridge()?.forgetHandle?.(item.handleRef);
          state.projects = manager().unlinkHistoryHandle(state.projects, project.id, field, item.id);
          render();
          toast(`Forgot the local reopen link for “${item.name}”.`);
        } catch (error) {
          toast(`Could not forget local link: ${error.message || error}`, "error");
        }
      }
    }

    async function onListClick(event) {
      const historyButton = event.target.closest("[data-project-history-action]");
      if (historyButton) {
        await onHistoryAction(historyButton);
        return;
      }
      const button = event.target.closest("[data-project-action]");
      if (!button) return;
      const id = button.dataset.projectId;
      const project = state.projects.find((item) => item.id === id);
      if (!project) return;

      if (button.dataset.projectAction === "activate") {
        state.activeProjectId = id;
        persistActiveProject();
        render();
        notifyProjectContextChanged();
        toast(`Active project: ${project.name}.`);
        return;
      }
      if (button.dataset.projectAction === "duplicate") {
        try {
          const result = manager().duplicate(state.projects, id);
          state.projects = result.projects;
          state.activeProjectId = result.project.id;
          persistActiveProject();
          render();
          notifyProjectContextChanged();
          toast(`Duplicated project as “${result.project.name}” without copying local file capabilities.`);
        } catch (error) {
          toast(error.message || String(error), "error", 6500);
        }
        return;
      }
      if (button.dataset.projectAction === "archive") {
        state.projects = manager().archive(state.projects, id, !project.archived);
        if (!project.archived && state.activeProjectId === id) {
          state.activeProjectId = "";
          persistActiveProject();
          notifyProjectContextChanged();
        }
        render();
        return;
      }
      if (button.dataset.projectAction === "delete") {
        const confirmed = confirmAction(`Delete local project metadata “${project.name}”? Log files are not affected; saved reopen permissions for this project will also be forgotten.`);
        if (!confirmed) return;
        try {
          await bridge()?.forgetProjectHandles?.(id);
        } catch {
          // Local metadata removal must remain possible even when capability cleanup is unavailable.
        }
        state.projects = manager().remove(state.projects, id);
        if (state.activeProjectId === id) {
          state.activeProjectId = "";
          persistActiveProject();
        }
        render();
        notifyProjectContextChanged();
      }
    }

    async function exportProjects() {
      const text = manager().exportJson(state.projects, state.activeProjectId);
      if (root.SignalDockStorageAdapter?.saveText) {
        await root.SignalDockStorageAdapter.saveText({ name: "signaldock-projects.sdprojects", mime: MIME_JSON, text });
      } else {
        getUtils().downloadParts("signaldock-projects.sdprojects", [text], MIME_JSON);
      }
      toast("Project metadata exported.");
    }

    async function importProjects(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const result = manager().importJson(await file.text());
        state.projects = result.projects;
        state.activeProjectId = result.activeId && result.projects.some((project) => project.id === result.activeId) ? result.activeId : "";
        persistActiveProject();
        render();
        notifyProjectContextChanged();
        toast(`Imported ${state.projects.length} project records.`);
      } catch (error) {
        toast(`Could not import projects: ${error.message || error}`, "error", 7000);
      } finally {
        event.target.value = "";
      }
    }

    function bind() {
      if (bound) return api;
      listen(el.closeProjectButton, "click", close);
      listen(el.createProjectButton, "click", createProject);
      listen(el.projectLinkFilesButton, "click", linkAndLoadFiles);
      listen(el.exportProjectsButton, "click", exportProjects);
      listen(el.importProjectsButton, "click", () => el.projectsFileInput?.click());
      listen(el.projectsFileInput, "change", importProjects);
      listen(el.projectList, "click", onListClick);
      bound = true;
      return api;
    }

    function destroy() {
      if (!bound) return;
      for (const [node, type, handler] of listeners.splice(0)) node.removeEventListener(type, handler);
      bound = false;
    }

    const api = Object.freeze({ bind, destroy, open, close, render });
    return api;
  }

  root.SignalDockProjectController = Object.freeze({ VERSION, ACTIVE_PROJECT_KEY, create });
}(typeof self !== "undefined" ? self : window));
''')

index = index_path.read_text()
index = replace_exact(
    index,
    '  <script src="src/app/baseline-controller.js" defer></script>\n',
    '  <script src="src/app/baseline-controller.js" defer></script>\n  <script src="src/app/project-controller.js" defer></script>\n',
    'project controller script tag'
)
index_path.write_text(index)

version = version_path.read_text().strip()
if version != '2.8.1':
    raise SystemExit(f'VERSION expected 2.8.1, found {version!r}')
version_path.write_text('2.8.2\n')

readme = readme_path.read_text()
readme = replace_exact(readme, 'version-2.8.1-22d3ee', 'version-2.8.2-22d3ee', 'README badge')
readme = replace_exact(readme, 'SignalDock v2.8.1 — real application UI with the bundled demo dataset', 'SignalDock v2.8.2 — real application UI with the bundled demo dataset', 'README caption')
readme = replace_exact(readme, 'alt="SignalDock v2.8.1 application screenshot showing local log analysis"', 'alt="SignalDock v2.8.2 application screenshot showing local log analysis"', 'README screenshot alt')
needle = '- feature-level Baseline controller under `src/app/` with explicit Project/filters/autosave callbacks and preserved aggregate-only baseline semantics\n'
readme = replace_exact(readme, needle, needle + '- feature-level Project controller under `src/app/` that owns project UI/reopen orchestration while retaining the narrow desktop capability facade and portable-export stripping rules\n', 'README project controller highlight')
readme_path.write_text(readme)

technical = technical_path.read_text()
technical = replace_exact(technical, 'Current version: **2.8.1**.', 'Current version: **2.8.2**.', 'technical version')
needle = '`baseline-controller.js` owns Baseline Compare and Baseline History UI coordination, while aggregate snapshot normalization/comparison remains in `src/investigation/baseline-manager.js`. Project naming/attachment, filter application and autosave are injected callbacks so the controller does not reach into Project Manager implementation details.\n'
technical = replace_exact(technical, needle, needle + '\n`project-controller.js` owns Project Manager rendering, CRUD actions and explicit link/relink/reopen/forget orchestration. File parsing and workspace restore remain injected application callbacks, while filesystem access is limited to the existing `src/platform/desktop-bridge.js` capability facade. Portable project export/duplication rules remain in `src/investigation/project-manager.js`.\n', 'technical project controller section')
technical_path.write_text(technical)

source_layout = source_layout_path.read_text()
old = 'Current feature controllers: `query-library-controller.js` and `baseline-controller.js`. Cross-feature work must be supplied as narrow callbacks rather than direct controller-to-controller calls.\n'
new = 'Current feature controllers: `query-library-controller.js`, `baseline-controller.js` and `project-controller.js`. Cross-feature work must be supplied as narrow callbacks rather than direct controller-to-controller calls.\n'
source_layout = replace_exact(source_layout, old, new, 'source layout controller inventory')
source_layout_path.write_text(source_layout)

src_readme = src_readme_path.read_text()
if 'project-controller.js' not in src_readme:
    anchor = '  - `baseline-controller.js` — Baseline Compare/History UI coordination\n'
    if anchor in src_readme:
        src_readme = src_readme.replace(anchor, anchor + '  - `project-controller.js` — Project Manager UI and explicit reopen/link orchestration\n', 1)
    else:
        src_readme += '\n`app/project-controller.js` owns Project Manager UI and explicit reopen/link orchestration.\n'
src_readme_path.write_text(src_readme)

changelog = changelog_path.read_text()
release = '''## 2.8.2 — 2026-09-16

### Project application controller
- Extracted Project Manager rendering, CRUD actions, import/export and explicit link/relink/reopen/forget orchestration from the root `app.js` into `src/app/project-controller.js`.
- Preserved the narrow `SignalDockDesktopBridge` capability surface; the controller receives file parsing and workspace restore as explicit callbacks instead of gaining arbitrary filesystem or shell access.
- Kept project normalization, persistence, portable export and capability stripping in `src/investigation/project-manager.js`.
- Added idempotent controller event binding/teardown and defensive rendering for invalid historical timestamps.

### Capability safety and maintainability
- Project deletion still attempts project-handle cleanup before metadata removal while never deleting user files; metadata removal remains possible if capability cleanup is unavailable.
- Duplicate/export behavior continues to strip local handle references through the Project Manager domain model.
- Added a Project controller architecture smoke test and extended permanent source-layout/HTTP coverage to all three application controllers.

'''
if '## 2.8.2 — 2026-09-16' in changelog:
    raise SystemExit('2.8.2 changelog already present')
changelog = replace_exact(changelog, '# Changelog\n\n', '# Changelog\n\n' + release, 'changelog insertion')
changelog_path.write_text(changelog)

# Keep existing feature-controller tests forward-compatible with 2.8 patch releases.
for test_name, exact in [
    ('tests/baseline-controller-smoke.mjs', 'assert.equal(version, "2.8.1");'),
]:
    path = root / test_name
    text = path.read_text()
    replacement = 'const featureVersion = version.split(".").map(Number);\nassert.ok(featureVersion.length === 3 && featureVersion.every(Number.isFinite) && (featureVersion[0] > 2 || (featureVersion[0] === 2 && featureVersion[1] >= 8)), `expected SignalDock >= 2.8.x, got ${version}`);'
    text = replace_exact(text, exact, replacement, f'{test_name} version-forward gate')
    path.write_text(text)

controller_test_path.write_text(r'''import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const html = read("index.html");
const app = read("app.js");
const controller = read("src/app/project-controller.js");

assert.equal(version, "2.8.2");
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
const controllerIndex = scripts.indexOf("src/app/project-controller.js");
const appIndex = scripts.indexOf("app.js");
assert.ok(controllerIndex >= 0 && controllerIndex < appIndex, "project controller must load before app.js");

for (const token of [
  "SignalDockProjectController.create",
  "projectController.bind()",
  "projectController.render()",
  "projects: () => projectController?.open()",
  "renderProjects: () => projectController?.render()"
]) assert.ok(app.includes(token), `Project app integration token missing: ${token}`);

for (const token of [
  "function openProjects()",
  "function renderProjects()",
  "function linkAndLoadProjectFiles()",
  "function reopenProjectHistoryItem(",
  "function onProjectListClick(",
  "el.createProjectButton?.addEventListener"
]) assert.ok(!app.includes(token), `Project implementation leaked back into app.js: ${token}`);

for (const token of [
  "const VERSION = 1",
  "const HISTORY_FIELDS = new Set",
  "function create(options = {})",
  "function bind()",
  "function destroy()",
  "let bound = false",
  "restoreWorkspaceFile",
  "refreshBaselineHistory",
  "requestPermission: true",
  "forgetProjectHandles",
  "without copying local file capabilities"
]) assert.ok(controller.includes(token), `Project controller quality token missing: ${token}`);

for (const forbidden of ["root.invoke", ".invoke(", "shell", "exec(", "spawn("]) {
  assert.ok(!controller.includes(forbidden), `Project controller must not expose generic native capabilities: ${forbidden}`);
}
for (const primitive of ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("]) {
  assert.ok(!controller.includes(primitive), `Project controller must stay local-only: ${primitive}`);
}

const sandbox = { self: {}, console, Set };
vm.runInNewContext(controller, sandbox, { filename: "project-controller.js" });
assert.equal(sandbox.self.SignalDockProjectController.VERSION, 1);
assert.equal(typeof sandbox.self.SignalDockProjectController.create, "function");
assert.equal(Object.isFrozen(sandbox.self.SignalDockProjectController), true);

console.log("project-controller-smoke PASS");
''')

print('v2.8.2 Project controller migration staged')
