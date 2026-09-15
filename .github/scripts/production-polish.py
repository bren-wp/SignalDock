from pathlib import Path
import re


def replace_exact(text, old, new, label, expected=1):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


# Version
Path("VERSION").write_text("2.7.2\n")

# Production-facing markup and copy.
index_path = Path("index.html")
index = index_path.read_text()
for old, new, label in [
    ('title="No file uploads. No backend. No telemetry."', 'title="Your files stay on this device. No uploads or telemetry."', "local badge tooltip"),
    ('<em>BETA</em>', '', "live tail beta badge"),
    ('title="Manage local SignalDock project metadata"', 'title="Manage local projects and workspaces"', "project nav tooltip"),
    ('placeholder="Search logs… level:error trace:abc any:timeout,retry re:/ECONNRESET/i"', 'placeholder="Search logs by message, service, trace, level…"', "search placeholder"),
    ('<small>No cloud. No uploads. No telemetry.</small>', '<small>Files stay on this device. Nothing is uploaded.</small>', "privacy copy"),
    ('>Clear recovery snapshot</button>', '>Clear saved recovery</button>', "recovery action"),
    ('>Clear search cache</button>', '>Clear local search cache</button>', "cache action"),
    ('<div class="diagnostics-card__head"><div><span>PERFORMANCE</span><strong id="diagnosticsTitle">Local diagnostics</strong></div><button class="button button--ghost button--small" id="copyDiagnosticsButton" type="button">Copy diagnostics</button></div>', '<div class="diagnostics-card__head"><div><span>DEVICE STATUS</span><strong id="diagnosticsTitle">Performance &amp; storage</strong></div><button class="button button--ghost button--small" id="copyDiagnosticsButton" type="button">Copy support details</button></div>', "diagnostics heading"),
    ('Diagnostics stay local and contain timing, dataset and browser capability metadata only.', 'Support details stay on this device and include performance, dataset size and browser capability information.', "diagnostics note"),
    ('<div class="case-activity__head"><div><span>ATTACHMENT REFERENCES</span><strong>Local file metadata</strong></div><div><button class="button button--ghost button--small" id="addCaseAttachmentButton" type="button">Add local file reference</button>', '<div class="case-activity__head"><div><span>REFERENCED FILES</span><strong>Files connected to this case</strong></div><div><button class="button button--ghost button--small" id="addCaseAttachmentButton" type="button">Add file reference</button>', "attachment heading"),
    ('SignalDock stores filename/type/size/time metadata only — attachment bytes are never embedded or uploaded.', 'SignalDock stores file details only. Referenced file contents are never copied into the case or uploaded.', "attachment note"),
    ('Checkpoints store the normalized case state plus evidence IDs, not copies of log data.', 'Checkpoints save case details and evidence references without copying your logs.', "checkpoint note"),
    ('<header class="query-library-head"><div><span>LOCAL PROJECT METADATA</span><strong>Projects &amp; workspaces</strong><small>Organize investigation metadata locally without copying log contents into project records.</small></div>', '<header class="query-library-head"><div><span>LOCAL PROJECTS</span><strong>Projects &amp; workspaces</strong><small>Keep investigations, linked files and workspaces organized on this device.</small></div>', "project heading"),
    ('Checking local reopen capability…', 'Checking local file access…', "project capability loading"),
    ('Project records contain metadata only. Persistent reopen links are local capabilities on this device and are stripped from project exports.', 'Project details stay on this device. Linked file access is never included in exported project files.', "project footer"),
]:
    index = replace_exact(index, old, new, label)
if "BETA" in index:
    raise SystemExit("production markup still contains BETA")
index_path.write_text(index)

# Shared visual tokens and responsive fixes.
css_path = Path("styles.css")
css = css_path.read_text()
css = replace_exact(
    css,
    "  --row-h: 46px;\n}",
    "  --row-h: 46px;\n  --border: var(--line);\n  --border-soft: var(--line-soft);\n  --accent: var(--cyan);\n  --primary: var(--cyan);\n  --danger: var(--red);\n  --surface-soft: rgba(13,23,36,.72);\n  --focus-ring: #67e8f9;\n}",
    "theme token aliases",
)
css = replace_exact(
    css,
    '  overflow: hidden;\n}\nbutton, input, select { font: inherit; }',
    '  overflow: hidden;\n  -webkit-font-smoothing: antialiased;\n  text-rendering: optimizeLegibility;\n}\nbutton, input, select { font: inherit; }',
    "body rendering polish",
)
css = replace_exact(
    css,
    ".app-frame { height: 100vh; min-height: 680px; display: grid; grid-template-rows: 64px 1fr; }",
    ".app-frame { height: 100vh; height: 100dvh; min-height: 680px; display: grid; grid-template-rows: 64px 1fr; }",
    "dynamic viewport",
)
css = replace_exact(
    css,
    ".query-library-item{grid-template-columns:auto minmax(0,1fr) auto}",
    ".query-library-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto}",
    "query library grid",
)
css = replace_exact(
    css,
    "  .nav-list { display: none; }",
    "  .nav-list { display: flex; grid-column: 1 / -1; overflow-x: auto; padding-bottom: 2px; scroll-snap-type: x proximity; }\n  .nav-item { scroll-snap-align: start; }",
    "phone navigation",
)

# Remove release-history markers from shipped styles while preserving useful labels.
def semantic_comment(match):
    label = match.group(1).strip()
    label = re.sub(r"^(?:SignalDock\s+)?v\d+\.\d+\s*(?:[—-]\s*)?", "", label).strip()
    return f"/* {label} */" if label else ""

css = re.sub(r"/\*\s*((?:SignalDock\s+)?v\d+\.\d+[^*]*?)\s*\*/", semantic_comment, css)

polish = """

/* Production interaction polish */
::selection { color: #f8fdff; background: rgba(21,216,242,.28); }
:where(button, input, select, textarea) { transition: border-color .14s ease, background-color .14s ease, color .14s ease, opacity .14s ease, box-shadow .14s ease; }
:where(button, input, select, textarea):disabled { cursor: not-allowed; opacity: .5; }
html[data-input-modality="keyboard"] :where(button, a, input, select, textarea, [tabindex]):focus-visible { outline-color: var(--focus-ring); box-shadow: 0 0 0 3px rgba(103,232,249,.12); }
:where(.source-list, .saved-list, .file-tabs, .nav-list, .query-library-list, .investigation-list, .case-unified-timeline__list) { overscroll-behavior: contain; }
@media (hover: hover) and (pointer: fine) {
  :where(.button, .icon-button, .nav-item, .source-button, .saved-button, .file-tab):not(:disabled):hover { filter: brightness(1.06); }
}
@media (max-width: 480px) {
  .sidebar__primary { gap: 8px; }
  .nav-list { scrollbar-width: thin; }
  .nav-item { min-height: 44px; }
  .project-toolbar, .baseline-toolbar { grid-template-columns: 1fr; }
  .project-toolbar label, .baseline-toolbar label { grid-column: auto; }
}
"""
if "/* Production interaction polish */" in css:
    raise SystemExit("production polish block already present")
css += polish
css_path.write_text(css)

# Deduplicate navigation state handling and synchronize accessibility state.
app_path = Path("app.js")
app = app_path.read_text()
app = replace_exact(app, '  const APP_VERSION = "2.7.1";', '  const APP_VERSION = "2.7.2";', "app version")
app = replace_exact(
    app,
    '  const paletteEngine = () => window.SignalDockCommandPalette;\n\n  document.addEventListener("DOMContentLoaded", init);',
    '  const paletteEngine = () => window.SignalDockCommandPalette;\n\n  function setActiveNav(target) {\n    document.querySelectorAll("[data-nav]").forEach((item) => {\n      const active = item.dataset.nav === target;\n      item.classList.toggle("is-active", active);\n      if (active) item.setAttribute("aria-current", "page");\n      else item.removeAttribute("aria-current");\n    });\n  }\n\n  document.addEventListener("DOMContentLoaded", init);',
    "active nav helper",
)
app = replace_exact(app, '    bindEvents();\n    initFilterWorker();', '    bindEvents();\n    setActiveNav("logs");\n    initFilterWorker();', "initial nav state")
app = replace_exact(
    app,
    '      document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item === button));\n      const target = button.dataset.nav;',
    '      const target = button.dataset.nav;\n      setActiveNav(target);',
    "nav click state",
)
reset = 'document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "logs"));'
reset_count = app.count(reset)
if reset_count < 8:
    raise SystemExit(f"expected repeated nav reset blocks, found {reset_count}")
app = app.replace(reset, 'setActiveNav("logs");')
app = app.replace("Persistent file linking is unavailable in this runtime", "File linking is unavailable in this browser")
app = replace_exact(
    app,
    'if (el.projectCapabilityMeta) el.projectCapabilityMeta.textContent = bridgeCaps.persistentHandles ? `${bridgeCaps.mode === "native" ? "Native" : "Browser"} capability mode · persistent local reopen available · links never leave this device` : `${bridgeCaps.mode === "native" ? "Native" : "Browser"} capability mode · metadata-only history in this runtime`;',
    'if (el.projectCapabilityMeta) el.projectCapabilityMeta.textContent = bridgeCaps.persistentHandles ? "Linked files can be reopened on this device. File access never leaves SignalDock." : "Project history stays local, but linked files may need to be selected again.";',
    "project capability copy",
)
app = app.replace("Metadata-only local project", "Local project")
app_path.write_text(app)

# Patch-release assertions that intentionally track the current 2.7 release.
for gate in Path("tests").glob("v27-*.mjs"):
    text = gate.read_text().replace("2.7.1", "2.7.2").replace("2\\.7\\.1", "2\\.7\\.2")
    gate.write_text(text)

# Dedicated production UI regression coverage.
production_test = r'''import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();
const html = read("index.html");
const css = read("styles.css");
const app = read("app.js");
const technical = read("docs/TECHNICAL.md");

assert.equal(version, "2.7.2");
assert.match(app, /APP_VERSION\s*=\s*["']2\.7\.2["']/);
assert.ok(!html.includes("BETA"), "production UI must not expose beta labels");
assert.ok(!html.includes("LOCAL PROJECT METADATA"), "project UI still exposes implementation terminology");
assert.ok(!app.includes("capability mode"), "project UI still exposes capability-mode implementation copy");
assert.ok(!app.includes("metadata-only history in this runtime"), "project UI still exposes runtime implementation copy");
assert.ok(css.includes("--border: var(--line);"));
assert.ok(css.includes("--surface-soft: rgba(13,23,36,.72);"));
assert.ok(css.includes(".query-library-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto}"));
assert.ok(!css.includes(".nav-list { display: none; }"), "mobile navigation must remain reachable");
assert.match(app, /function setActiveNav\(target\)/);
assert.match(app, /setAttribute\("aria-current", "page"\)/);
assert.ok(!/\/\*\s*(?:SignalDock\s+)?v\d+\.\d+/.test(css), "release-number CSS comments should not ship in production styles");
assert.ok(technical.includes("Current version: **2.7.2**."));

const defs = new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
const missing = new Set();
for (const match of css.matchAll(/var\((--[a-zA-Z0-9-]+)([^)]*)\)/g)) {
  const hasFallback = match[2].includes(",");
  if (!defs.has(match[1]) && !hasFallback) missing.add(match[1]);
}
assert.deepEqual([...missing].sort(), [], `undefined CSS variables without fallbacks: ${[...missing].join(", ")}`);
console.log("production-ui-polish-smoke PASS");
'''
Path("tests/production-ui-polish-smoke.mjs").write_text(production_test)

# Documentation and release notes.
readme_path = Path("README.md")
readme_path.write_text(readme_path.read_text().replace("2.7.1", "2.7.2"))

technical_path = Path("docs/TECHNICAL.md")
technical = technical_path.read_text()
technical = replace_exact(technical, "Current version: **2.7.1**.", "Current version: **2.7.2**.", "technical version")
technical = technical.replace("- Experimental local Live Tail using the File System Access API in supported Chromium-based browsers", "- Local Live Tail using the File System Access API in supported Chromium-based browsers")
technical = technical.replace(
    "The **Copy diagnostics** action exports only technical runtime metadata and timing/capability information; it does not include log messages or raw log payloads.",
    "The **Copy support details** action exports only local performance and browser-capability information; it does not include log messages or raw log payloads.",
)
production_section = '''
## Production UI and UX standards

SignalDock user-facing copy avoids implementation-stage labels and internal runtime terminology. Shared CSS design tokens are defined once at the root and newer feature surfaces use semantic aliases instead of undeclared variables. Navigation remains reachable at phone widths, active navigation exposes `aria-current`, dialogs retain keyboard-focus hardening, and reduced-motion/coarse-pointer rules remain first-class.

The production regression suite checks for unresolved CSS custom properties, hidden phone navigation, release-stage labels in the interface and accidental reintroduction of implementation terminology.
'''
if "## Production UI and UX standards" not in technical:
    technical = technical.replace("\n## Cross-dataset baselines and local projects", production_section + "\n## Cross-dataset baselines and local projects", 1)
technical_path.write_text(technical)

changelog_path = Path("CHANGELOG.md")
changelog = changelog_path.read_text()
if "## 2.7.2 — 2026-09-15" in changelog:
    raise SystemExit("2.7.2 changelog already present")
release = '''

## 2.7.2 — 2026-09-15

### Production UI and UX
- Fixed undeclared shared CSS tokens that caused borders, surfaces and accent styles to be dropped on newer analysis and investigation views.
- Restored full navigation access on phone-width layouts instead of hiding workspace navigation below 480 px.
- Fixed Query Library selection layout by applying the grid display mode its column rules require.
- Removed the visible Live Tail beta badge and replaced internal project/capability wording with production-facing copy.
- Added consistent disabled, focus, selection, overscroll and fine-pointer interaction polish while preserving reduced-motion behavior.

### Maintainability and accessibility
- Deduplicated active-navigation state handling behind one helper and added `aria-current` synchronization.
- Removed release-number comments from production CSS while retaining semantic section labels.
- Added a production UI regression test covering CSS variables, mobile navigation, production copy and accessibility state.
- Updated user-facing diagnostics wording and technical documentation for the production UI standards.
'''
changelog_path.write_text(changelog.replace("# Changelog\n", "# Changelog\n" + release, 1))
