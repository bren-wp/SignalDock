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
source_layout_test_path = root / 'tests' / 'source-layout-smoke.mjs'
ui_foundations_path = root / 'tests' / 'ui-foundations-smoke.mjs'
controller_test_path = root / 'tests' / 'exception-controller-smoke.mjs'
controller_path = root / 'src' / 'app' / 'exception-controller.js'
ci_path = root / '.github' / 'workflows' / 'ci.yml'

if not controller_path.exists():
    raise SystemExit('Exception controller must exist before migration')
if 'src/app/exception-controller.js' not in ci_path.read_text():
    raise SystemExit('Permanent CI must verify the Exception controller asset before migration')

app = app_path.read_text()
app = replace_exact(app, 'const APP_VERSION = "2.8.5";', 'const APP_VERSION = "2.8.6";', 'app version')
app = replace_exact(
    app,
    '  let projectController = null;\n  let investigationController = null;\n  let caseWorkspaceController = null;\n',
    '  let projectController = null;\n  let investigationController = null;\n  let exceptionController = null;\n  let caseWorkspaceController = null;\n',
    'Exception controller state slot'
)
app = replace_exact(
    app,
    '      exceptions: openExceptions,\n',
    '      exceptions: () => exceptionController?.open(),\n',
    'Exception navigation dispatch'
)

init_anchor = '''    investigationController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
init_replacement = '''    investigationController.bind();
    if (!window.SignalDockExceptionController?.create) throw new Error("SignalDock Exception controller is unavailable.");
    exceptionController = window.SignalDockExceptionController.create({
      state,
      el,
      getUtils: utils,
      formatDuration,
      toast,
      applyFilters,
      selectEntry,
      entryRowIntoView,
      pinEvidence: (...args) => investigationController?.pinEvidence(...args),
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    });
    exceptionController.bind();
    if (!window.SignalDockCaseWorkspaceController?.create) throw new Error("SignalDock Case Workspace controller is unavailable.");
'''
app = replace_exact(app, init_anchor, init_replacement, 'Exception controller initialization')

exception_events = '''    el.closeExceptionButton?.addEventListener("click", closeExceptions);
    el.exceptionResetButton?.addEventListener("click", () => { state.exceptionViewFingerprint = ""; renderExceptions(); });
    el.exceptionList?.addEventListener("click", onExceptionClick);
'''
app = replace_exact(app, exception_events, '', 'Exception event ownership')

block_start = app.find('  function openExceptions() {')
block_end = app.find('  function openHealth() {', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('Exception application block not found')
app = app[:block_start] + app[block_end:]

for forbidden in [
    'function openExceptions()',
    'function closeExceptions()',
    'function renderExceptions()',
    'function renderExceptionTrend()',
    'function onExceptionClick(',
    'el.closeExceptionButton?.addEventListener',
    'el.exceptionResetButton?.addEventListener',
    'el.exceptionList?.addEventListener'
]:
    if forbidden in app:
        raise SystemExit(f'legacy Exception UI wiring remains: {forbidden}')
app_path.write_text(app)

index = index_path.read_text()
index = replace_exact(
    index,
    '  <script src="src/app/investigation-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    '  <script src="src/app/investigation-controller.js" defer></script>\n  <script src="src/app/exception-controller.js" defer></script>\n  <script src="src/app/case-workspace-controller.js" defer></script>\n',
    'Exception controller script order'
)
index_path.write_text(index)

source_test = source_layout_test_path.read_text()
source_test = replace_exact(
    source_test,
    '  "src/app/investigation-controller.js",\n  "src/app/case-workspace-controller.js",\n',
    '  "src/app/investigation-controller.js",\n  "src/app/exception-controller.js",\n  "src/app/case-workspace-controller.js",\n',
    'source layout controller inventory'
)
source_layout_test_path.write_text(source_test)

ui_test = ui_foundations_path.read_text()
ui_test = replace_exact(
    ui_test,
    'const investigationController = fs.readFileSync(path.join(root, "src/app/investigation-controller.js"), "utf8");\nconst caseCheckpointController',
    'const investigationController = fs.readFileSync(path.join(root, "src/app/investigation-controller.js"), "utf8");\nconst exceptionController = fs.readFileSync(path.join(root, "src/app/exception-controller.js"), "utf8");\nconst caseCheckpointController',
    'UI foundation Exception controller source'
)
ui_test = replace_exact(
    ui_test,
    'for (const token of ["renderCaseSurfaces", "renderCaseTimeline", "pinEvidence", "evidence.imported"]) {\n  if (!investigationController.includes(token)) throw new Error(`Missing Investigation controller foundation token: ${token}`);\n}\n',
    'for (const token of ["renderCaseSurfaces", "renderCaseTimeline", "pinEvidence", "evidence.imported"]) {\n  if (!investigationController.includes(token)) throw new Error(`Missing Investigation controller foundation token: ${token}`);\n}\nfor (const token of ["composeFingerprintQuery", "resolveSampleEntry", "sampleIds", "exception-trend-badge"]) {\n  if (!exceptionController.includes(token)) throw new Error(`Missing Exception controller foundation token: ${token}`);\n}\n',
    'UI foundation Exception controller assertions'
)
ui_foundations_path.write_text(ui_test)

controller_test_path.write_text(r'''import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/app/exception-controller.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");

const sandbox = {
  self: {
    SignalDockExceptionGroups: {
      summary: () => ({ groups: 0, occurrences: 0, errors: 0, fatal: 0 }),
      candidate: () => true,
      fingerprint: (entry) => entry?.fingerprint || ""
    }
  },
  console
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "exception-controller.js" });
const api = sandbox.self.SignalDockExceptionController;
assert.equal(api.VERSION, 1);
assert.equal(api.extractFingerprint("level:error fingerprint:EX-ABC service:api"), "ex-abc");
assert.equal(api.extractFingerprint("service:api exception:ex-123"), "ex-123");
assert.equal(api.extractFingerprint("level:error"), "");
assert.equal(api.composeFingerprintQuery("level:error fingerprint:old service:api", "EX-NEW"), "level:error service:api exception:ex-new");
assert.equal(api.composeFingerprintQuery("exception:a fingerprint:b service:web", "ex-c"), "service:web exception:ex-c");
assert.equal(api.composeFingerprintQuery(" service:web  ", ""), "service:web");

const doc = {};
const stable = { id: "stable-id", globalIndex: 9, fingerprint: "ex-stable" };
const indexed = { id: "indexed-id", globalIndex: 1, fingerprint: "ex-index" };
const fallback = { id: "fallback-id", globalIndex: 2, fingerprint: "ex-fallback" };
const state = {
  entries: [null, indexed, fallback, stable],
  exceptionGroups: [],
  exceptionTrends: null,
  exceptionViewFingerprint: ""
};
const noop = () => {};
const controller = api.create({
  state,
  el: { exceptionList: { ownerDocument: doc } },
  getUtils: () => ({ shortSource: String }),
  formatDuration: String,
  toast: noop,
  applyFilters: noop,
  selectEntry: noop,
  entryRowIntoView: noop,
  pinEvidence: noop,
  closeCompetingDialogs: noop,
  showDialogSafely: noop,
  setActiveNav: noop
});
assert.equal(controller.resolveSampleEntry({ fingerprint: "ex-stable", sampleIds: ["stable-id"], sampleIndexes: [1] }), stable, "stable sample ID must win over stale indexes");
assert.equal(controller.resolveSampleEntry({ fingerprint: "ex-index", sampleIds: ["missing"], sampleIndexes: [1] }), indexed, "sample index fallback should remain supported");
assert.equal(controller.resolveSampleEntry({ fingerprint: "ex-fallback", sampleIds: [], sampleIndexes: [] }), fallback, "fingerprint fallback should recover a representative entry");
assert.equal(controller.resolveSampleEntry({ fingerprint: "ex-missing", sampleIds: [], sampleIndexes: [] }), null);

for (const forbidden of ["fetch(", ".invoke(", "XMLHttpRequest", "WebSocket("]) {
  assert.ok(!source.includes(forbidden), `Exception controller must not introduce network/native escape hatch: ${forbidden}`);
}
assert.ok(index.includes('src/app/exception-controller.js'), "Exception controller must load from index.html");
assert.ok(ci.includes('src/app/exception-controller.js'), "CI must HTTP-smoke the Exception controller");
assert.ok(app.includes("SignalDockExceptionController.create"), "app.js must create the Exception controller");
assert.ok(app.includes("exceptionController.bind()"), "app.js must bind the Exception controller");
assert.ok(app.includes("exceptions: () => exceptionController?.open()"), "navigation must route through the Exception controller");
for (const legacy of ["function openExceptions()", "function renderExceptions()", "function onExceptionClick("]) {
  assert.ok(!app.includes(legacy), `legacy Exception orchestration must leave app.js: ${legacy}`);
}
console.log("exception-controller-smoke PASS");
''')

version_path.write_text('2.8.6\n')

readme = readme_path.read_text()
if readme.count('2.8.5') != 3:
    raise SystemExit(f'README version references: expected 3, found {readme.count("2.8.5")}')
readme = readme.replace('2.8.5', '2.8.6')
readme = replace_exact(
    readme,
    '- feature-level Investigation controller under `src/app/` that owns evidence UI, local investigation import/export, Case Activity and Unified Timeline coordination through explicit callbacks\n',
    '- feature-level Investigation controller under `src/app/` that owns evidence UI, local investigation import/export, Case Activity and Unified Timeline coordination through explicit callbacks\n- feature-level Exception controller under `src/app/` that owns recurring-failure rendering, fingerprint filtering and representative-sample actions while exception grouping/trend analysis remains in `src/analysis/`\n',
    'README Exception controller feature'
)
readme_path.write_text(readme)

technical = technical_path.read_text()
technical = replace_exact(technical, 'Current version: **2.8.5**.', 'Current version: **2.8.6**.', 'technical current version')
technical = replace_exact(
    technical,
    '`investigation-controller.js` owns Investigation evidence rendering/actions, local import/export, Case Activity and Unified Case Timeline coordination. Investigation and Case domain modules remain authoritative for normalization and bounded evidence/case data; log selection, inspector refresh, Case Workspace refresh and autosave are injected callbacks.\n',
    '`investigation-controller.js` owns Investigation evidence rendering/actions, local import/export, Case Activity and Unified Case Timeline coordination. Investigation and Case domain modules remain authoritative for normalization and bounded evidence/case data; log selection, inspector refresh, Case Workspace refresh and autosave are injected callbacks.\n\n`exception-controller.js` owns Exception Explorer rendering, deterministic fingerprint query coordination and representative-sample actions. Grouping and trend classification remain in `src/analysis/exception-groups.js` and `src/analysis/exception-trends.js`; log filtering, evidence pinning and selected-log navigation are injected callbacks. Sample resolution prefers stable entry IDs before index and fingerprint fallbacks so restored workspaces do not depend on stale array positions.\n',
    'technical Exception controller boundary'
)
technical_path.write_text(technical)

source_layout = source_layout_path.read_text()
source_layout = replace_exact(
    source_layout,
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `investigation-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `investigation-controller.js`, `exception-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`.',
    'source layout Exception controller inventory'
)
source_layout_path.write_text(source_layout)

src_readme = src_readme_path.read_text()
src_readme = replace_exact(
    src_readme,
    '`app/investigation-controller.js` owns evidence UI, local investigation import/export, Case Activity and Unified Timeline coordination.\n',
    '`app/investigation-controller.js` owns evidence UI, local investigation import/export, Case Activity and Unified Timeline coordination.\n\n`app/exception-controller.js` owns recurring-failure rendering, fingerprint-filter actions and representative exception sample navigation/pinning.\n',
    'src README Exception controller'
)
src_readme_path.write_text(src_readme)

changelog = changelog_path.read_text()
entry = '''## 2.8.6 — 2026-09-16

### Exception Explorer application boundary
- Extracted Exception Explorer rendering, fingerprint view state and delegated UI events from the root application into `src/app/exception-controller.js`.
- Routed Exception navigation, filtering, sample opening and evidence pinning through explicit callbacks while keeping grouping and trend analysis in `src/analysis/`.
- Hardened representative-sample resolution to prefer stable entry IDs before array-index and deterministic fingerprint fallbacks, reducing restore/reopen sensitivity to stale positions.
- Normalized `exception:` / `fingerprint:` query replacement through tested pure helpers and added descriptive accessible names to generated action buttons.

### Maintainability and verification
- Removed legacy Exception dialog functions/listeners from `app.js` and added an isolated controller smoke test.
- Extended source-layout and permanent HTTP quality gates so the Exception controller is a required production asset.
- Preserved the local-first boundary: no network primitive, native escape hatch or new persistence surface was introduced.

'''
changelog = replace_exact(changelog, '## 2.8.5 — 2026-09-16\n', entry + '## 2.8.5 — 2026-09-16\n', 'CHANGELOG 2.8.6 entry')
changelog_path.write_text(changelog)

print('v2.8.6 Exception controller migration staged')
