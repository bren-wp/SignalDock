from pathlib import Path
import re


def replace_exact(text, old, new, label, expected=1):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


# Version.
Path("VERSION").write_text("2.7.4\n")

# Move stable Query Library and Baseline History controls into static HTML.
index_path = Path("index.html")
html = index_path.read_text()
query_list = '      <div class="query-library-list" id="queryLibraryList"><div class="case-findings__empty">No reusable queries saved yet.</div></div>'
query_static = '''      <div class="query-library-bulkbar" id="queryLibraryBulkBar" role="group" aria-label="Bulk query actions">
        <strong id="queryLibraryBulkCount" aria-live="polite">0 selected</strong>
        <button class="button button--ghost button--small" id="queryLibraryBulkSelectVisible" type="button" disabled>Select visible</button>
        <select id="queryLibraryBulkFolder" aria-label="Bulk destination folder"><option value="General">General</option></select>
        <button class="button button--ghost button--small" id="queryLibraryBulkMove" type="button" disabled>Move</button>
        <button class="button button--ghost button--small" id="queryLibraryBulkFavorite" type="button" disabled>Favorite</button>
        <button class="button button--ghost button--small" id="queryLibraryBulkUnfavorite" type="button" disabled>Unfavorite</button>
        <button class="button button--ghost button--small" id="queryLibraryBulkExport" type="button" disabled>Export selected</button>
        <button class="button button--ghost button--small" id="queryLibraryBulkDelete" type="button" disabled>Delete selected</button>
        <button class="button button--ghost button--small" id="queryLibraryBulkClear" type="button" disabled>Clear selection</button>
      </div>
''' + query_list
html = replace_exact(html, query_list, query_static, "static query library bulkbar")

baseline_toolbar = '      <div class="baseline-toolbar"><label><span>Baseline name</span><input id="baselineName" type="text" maxlength="120" placeholder="Production before deploy"></label><button class="button button--primary button--small" id="captureBaselineButton" type="button">Capture all logs</button><button class="button button--ghost button--small" id="captureFilteredBaselineButton" type="button">Capture filtered</button><button class="button button--ghost button--small" id="exportBaselineButton" type="button">Export .sdbaseline</button><button class="button button--ghost button--small" id="importBaselineButton" type="button">Import baseline</button><input id="baselineFileInput" type="file" accept=".sdbaseline,.json" hidden></div>'
baseline_static = baseline_toolbar + '''
      <section class="baseline-history" aria-labelledby="baselineHistoryTitle">
        <div class="baseline-history__head">
          <div><span>LOCAL BASELINE HISTORY</span><strong id="baselineHistoryTitle">Saved aggregate snapshots</strong></div>
          <div>
            <button class="button button--ghost button--small" id="baselineHistoryExportButton" type="button">Export history</button>
            <button class="button button--ghost button--small" id="baselineHistoryImportButton" type="button">Import history</button>
            <input id="baselineHistoryFileInput" type="file" accept=".json,.sdbaselines" hidden>
          </div>
        </div>
        <div class="baseline-history__compare">
          <label><span>Baseline</span><select id="baselineCompareBase"><option value="">Choose saved baseline…</option></select></label>
          <label><span>Current snapshot</span><select id="baselineCompareCurrent"><option value="">Choose saved baseline…</option></select></label>
          <button class="button button--primary button--small" id="compareSavedBaselinesButton" type="button" disabled>Compare saved baselines</button>
        </div>
        <div class="baseline-history__list" id="baselineHistoryList"><div class="case-findings__empty">No saved baselines yet.</div></div>
      </section>'''
html = replace_exact(html, baseline_toolbar, baseline_static, "static baseline history")
index_path.write_text(html)

# app.js now binds stable static elements instead of synthesizing them at boot.
app_path = Path("app.js")
app = app_path.read_text()
app = replace_exact(app, '  const APP_VERSION = "2.7.3";', '  const APP_VERSION = "2.7.4";', "app version")

query_binding = '      queryLibraryDialog: $("queryLibraryDialog"), queryLibraryName: $("queryLibraryName"), queryLibraryFolder: $("queryLibraryFolder"), queryLibraryTags: $("queryLibraryTags"), queryLibraryDescription: $("queryLibraryDescription"), queryLibraryFavorite: $("queryLibraryFavorite"), queryLibrarySaveButton: $("queryLibrarySaveButton"), queryLibraryExportButton: $("queryLibraryExportButton"), queryLibraryImportButton: $("queryLibraryImportButton"), queryLibraryFileInput: $("queryLibraryFileInput"), queryLibraryList: $("queryLibraryList"), closeQueryLibraryButton: $("closeQueryLibraryButton"), queryLibrarySearch: $("queryLibrarySearch"), queryLibraryFolderFilter: $("queryLibraryFolderFilter"), queryLibraryManageFolder: $("queryLibraryManageFolder"), queryLibraryRenameFolder: $("queryLibraryRenameFolder"), queryLibraryRenameFolderButton: $("queryLibraryRenameFolderButton"), queryLibraryDeleteFolderButton: $("queryLibraryDeleteFolderButton"),'
query_binding_static = query_binding[:-1] + ', queryLibraryBulkCount: $("queryLibraryBulkCount"), queryLibraryBulkFolder: $("queryLibraryBulkFolder"), queryLibraryBulkSelectVisible: $("queryLibraryBulkSelectVisible"), queryLibraryBulkFavorite: $("queryLibraryBulkFavorite"), queryLibraryBulkUnfavorite: $("queryLibraryBulkUnfavorite"), queryLibraryBulkMove: $("queryLibraryBulkMove"), queryLibraryBulkExport: $("queryLibraryBulkExport"), queryLibraryBulkDelete: $("queryLibraryBulkDelete"), queryLibraryBulkClear: $("queryLibraryBulkClear"),'
app = replace_exact(app, query_binding, query_binding_static, "query library static bindings")

baseline_binding = '      baselineChangeCount: $("baselineChangeCount"), baselineDialog: $("baselineDialog"), baselineMeta: $("baselineMeta"), baselineName: $("baselineName"), captureBaselineButton: $("captureBaselineButton"), captureFilteredBaselineButton: $("captureFilteredBaselineButton"), exportBaselineButton: $("exportBaselineButton"), importBaselineButton: $("importBaselineButton"), baselineFileInput: $("baselineFileInput"), baselineSummary: $("baselineSummary"), baselineServiceBody: $("baselineServiceBody"), baselineDependencyBody: $("baselineDependencyBody"), baselineTraceBody: $("baselineTraceBody"), closeBaselineButton: $("closeBaselineButton"),'
baseline_binding_static = baseline_binding[:-1] + ', baselineHistoryList: $("baselineHistoryList"), baselineHistoryExportButton: $("baselineHistoryExportButton"), baselineHistoryImportButton: $("baselineHistoryImportButton"), baselineHistoryFileInput: $("baselineHistoryFileInput"), baselineCompareBase: $("baselineCompareBase"), baselineCompareCurrent: $("baselineCompareCurrent"), compareSavedBaselinesButton: $("compareSavedBaselinesButton"),'
app = replace_exact(app, baseline_binding, baseline_binding_static, "baseline static bindings")

foundation_bindings = '''
    ensureFoundationUi();
    Object.assign(el, {
      queryLibraryBulkCount: $("queryLibraryBulkCount"), queryLibraryBulkFolder: $("queryLibraryBulkFolder"), queryLibraryBulkSelectVisible: $("queryLibraryBulkSelectVisible"), queryLibraryBulkFavorite: $("queryLibraryBulkFavorite"), queryLibraryBulkUnfavorite: $("queryLibraryBulkUnfavorite"), queryLibraryBulkMove: $("queryLibraryBulkMove"), queryLibraryBulkExport: $("queryLibraryBulkExport"), queryLibraryBulkDelete: $("queryLibraryBulkDelete"), queryLibraryBulkClear: $("queryLibraryBulkClear"),
      baselineHistoryList: $("baselineHistoryList"), baselineHistoryExportButton: $("baselineHistoryExportButton"), baselineHistoryImportButton: $("baselineHistoryImportButton"), baselineHistoryFileInput: $("baselineHistoryFileInput"), baselineCompareBase: $("baselineCompareBase"), baselineCompareCurrent: $("baselineCompareCurrent"), compareSavedBaselinesButton: $("compareSavedBaselinesButton")
    });
'''
app = replace_exact(app, foundation_bindings, "", "remove late foundation bindings")

foundation_pattern = re.compile(r'\n  function ensureFoundationUi\(\) \{.*?\n  \}\n\n  function openQueryLibrary\(\) \{', re.S)
app, count = foundation_pattern.subn('\n  function openQueryLibrary() {', app)
if count != 1:
    raise SystemExit(f"ensureFoundationUi removal: expected 1 match, found {count}")

app = replace_exact(
    app,
    '    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); icon.setAttribute("class", "icon");\n    const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", "assets/icons.svg#terminal"); icon.appendChild(use); iconWrap.appendChild(icon);',
    '    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); icon.setAttribute("class", "icon"); icon.setAttribute("aria-hidden", "true");\n    const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", "assets/icons.svg#terminal"); icon.appendChild(use); iconWrap.appendChild(icon);',
    "empty table decorative icon",
)
app_path.write_text(app)

# Regression coverage for static stable controls.
static_test = r'''import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const html = read("index.html");
const app = read("app.js");

assert.match(version, /^2\.7\.\d+$/);
for (const id of [
  "queryLibraryBulkBar", "queryLibraryBulkCount", "queryLibraryBulkFolder", "queryLibraryBulkSelectVisible",
  "queryLibraryBulkFavorite", "queryLibraryBulkUnfavorite", "queryLibraryBulkMove", "queryLibraryBulkExport",
  "queryLibraryBulkDelete", "queryLibraryBulkClear", "baselineHistoryList", "baselineHistoryExportButton",
  "baselineHistoryImportButton", "baselineHistoryFileInput", "baselineCompareBase", "baselineCompareCurrent",
  "compareSavedBaselinesButton"
]) assert.ok(html.includes(`id="${id}"`), `static foundation control missing from index.html: ${id}`);

assert.ok(html.includes('id="queryLibraryBulkBar" role="group" aria-label="Bulk query actions"'));
assert.ok(html.includes('class="baseline-history" aria-labelledby="baselineHistoryTitle"'));
assert.ok(html.includes('id="compareSavedBaselinesButton" type="button" disabled'));
assert.ok(!app.includes("function ensureFoundationUi()"), "stable UI must not be synthesized at runtime");
assert.ok(!app.includes("ensureFoundationUi();"), "runtime foundation initializer must stay removed");
assert.ok(!app.includes('bar.id = "queryLibraryBulkBar"'));
assert.ok(!app.includes('list.id = "baselineHistoryList"'));
for (const token of [
  'queryLibraryBulkCount: $("queryLibraryBulkCount")',
  'baselineHistoryList: $("baselineHistoryList")',
  'el.queryLibraryBulkSelectVisible?.addEventListener',
  'el.baselineHistoryExportButton?.addEventListener'
]) assert.ok(app.includes(token), `static control binding missing: ${token}`);
assert.ok(app.includes('icon.setAttribute("aria-hidden", "true")'));
console.log("static-foundation-ui-smoke PASS");
'''
Path("tests/static-foundation-ui-smoke.mjs").write_text(static_test)

# README and technical docs.
readme_path = Path("README.md")
readme = readme_path.read_text().replace("2.7.3", "2.7.4")
readme_path.write_text(readme)

technical_path = Path("docs/TECHNICAL.md")
technical = technical_path.read_text()
technical = replace_exact(technical, "Current version: **2.7.3**.", "Current version: **2.7.4**.", "technical version")
highlight_anchor = "- Query Library v3 multi-select bulk operations and local usage metadata\n"
highlight = "- Stable Query Library bulk controls and Baseline History controls are authored directly in `index.html`; application boot only binds behavior and never synthesizes these permanent surfaces at runtime\n"
if highlight not in technical:
    technical = replace_exact(technical, highlight_anchor, highlight_anchor + highlight, "technical static UI highlight")
production_anchor = "- Inspector tabs use a roving-tab keyboard model with Arrow/Home/End navigation, command-palette combobox semantics are exposed to assistive technology, and dialog focus return works for both pointer and keyboard activation.\n"
production_note = "- Permanent Query Library bulk and Baseline History controls are static document structure, so accessibility relationships and control presence can be audited before JavaScript runs.\n"
if production_note not in technical:
    technical = replace_exact(technical, production_anchor, production_anchor + production_note, "technical static UI production note")
technical_path.write_text(technical)

changelog_path = Path("CHANGELOG.md")
changelog = changelog_path.read_text()
if "## 2.7.4 — 2026-09-16" in changelog:
    raise SystemExit("2.7.4 changelog already present")
release = '''\n\n## 2.7.4 — 2026-09-16\n\n### Static production UI foundation\n- Moved Query Library bulk controls from boot-time DOM construction into the canonical `index.html` document structure.\n- Moved Baseline History import/export, saved-snapshot comparison and history list controls into static HTML.\n- Removed `ensureFoundationUi()` and its second-stage element binding pass; permanent controls are now bound with the rest of the application during normal initialization.\n- Added safe initial disabled states and explicit group/label semantics so the controls remain coherent before their first data render.\n\n### Maintainability and regression hardening\n- Added a regression gate that rejects reintroduction of runtime synthesis for stable Query Library/Baseline controls.\n- Marked the dynamically-created empty-table icon as decorative for assistive technology.\n- Updated production documentation and version metadata for the static UI boundary.\n'''
changelog = changelog.replace("# Changelog\n", "# Changelog\n" + release, 1)
changelog_path.write_text(changelog)

# Normalize touched files.
for name in [
    "VERSION", "index.html", "app.js", "README.md", "docs/TECHNICAL.md", "CHANGELOG.md",
    "tests/static-foundation-ui-smoke.mjs"
]:
    path = Path(name)
    lines = path.read_text().splitlines()
    path.write_text("\n".join(line.rstrip() for line in lines) + "\n")
