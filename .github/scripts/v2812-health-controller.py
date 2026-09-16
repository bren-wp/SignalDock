from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)

def remove_function(text, name, label):
    pattern = re.compile(rf'\n  function {re.escape(name)}\([^\n]*\) \{{.*?\n  \}}\n', re.S)
    text, count = pattern.subn('\n', text, count=1)
    if count != 1:
        raise SystemExit(f'{label}: expected function {name} once, got {count}')
    return text

# VERSION
write('VERSION', '2.8.12\n')

# app.js
app = read('app.js')
app = replace_once(app, 'const APP_VERSION = "2.8.11";', 'const APP_VERSION = "2.8.12";', 'app version')
app = replace_once(app, '  let serviceTrendsController = null;\n', '  let serviceTrendsController = null;\n  let healthController = null;\n', 'health controller declaration')
app = replace_once(app, '      health: openHealth,', '      health: () => healthController?.open(),', 'health nav')

init_marker = '''    serviceTrendsController.bind();\n'''
init_insert = '''    serviceTrendsController.bind();\n    if (!window.SignalDockHealthController?.create) throw new Error("SignalDock Observed Health controller is unavailable.");\n    healthController = window.SignalDockHealthController.create({\n      state,\n      el,\n      formatDuration,\n      toast,\n      filterByServiceValue,\n      closeCompetingDialogs,\n      showDialogSafely,\n      setActiveNav\n    });\n    healthController.bind();\n'''
app = replace_once(app, init_marker, init_insert, 'health controller initialization')

for fn in ['openHealth', 'closeHealth', 'renderHealth', 'onHealthClick']:
    app = remove_function(app, fn, 'health function removal')

listeners = '''    el.closeHealthButton?.addEventListener("click", closeHealth);\n    el.healthResetButton?.addEventListener("click", () => { state.healthScopeFiltered = false; renderHealth(false); });\n    el.healthTableBody?.addEventListener("click", onHealthClick);\n'''
app = replace_once(app, listeners, '', 'health listener removal')
write('app.js', app)

# index.html
html = read('index.html')
html = replace_once(html,
    '  <script src="src/app/service-trends-controller.js" defer></script>\n',
    '  <script src="src/app/service-trends-controller.js" defer></script>\n  <script src="src/app/health-controller.js" defer></script>\n',
    'health controller script')
write('index.html', html)

# source layout test
source_test = read('tests/source-layout-smoke.mjs')
source_test = replace_once(source_test,
    '  "src/app/service-trends-controller.js",\n',
    '  "src/app/service-trends-controller.js",\n  "src/app/health-controller.js",\n',
    'source layout controller')
write('tests/source-layout-smoke.mjs', source_test)

# UI foundations test
ui = read('tests/ui-foundations-smoke.mjs')
ui = replace_once(ui,
    'const serviceTrendsController = fs.readFileSync(path.join(root, "src/app/service-trends-controller.js"), "utf8");\n',
    'const serviceTrendsController = fs.readFileSync(path.join(root, "src/app/service-trends-controller.js"), "utf8");\nconst healthController = fs.readFileSync(path.join(root, "src/app/health-controller.js"), "utf8");\n',
    'ui health read')
ui = replace_once(ui,
    'for (const token of ["selectScope", "normalizeSplit", "No log entries match the current filters", "Filter to target service", "serviceTrendsScopeFiltered"]) {\n  if (!serviceTrendsController.includes(token)) throw new Error(`Missing Service Trends controller foundation token: ${token}`);\n}\n',
    'for (const token of ["selectScope", "normalizeSplit", "No log entries match the current filters", "Filter to target service", "serviceTrendsScopeFiltered"]) {\n  if (!serviceTrendsController.includes(token)) throw new Error(`Missing Service Trends controller foundation token: ${token}`);\n}\nfor (const token of ["selectScope", "No log entries match the current filters", "Filter logs to observed service", "healthScopeFiltered", "health-status--"]) {\n  if (!healthController.includes(token)) throw new Error(`Missing Observed Health controller foundation token: ${token}`);\n}\n',
    'ui health foundation')
write('tests/ui-foundations-smoke.mjs', ui)

# Dedicated controller smoke test
health_test = '''import fs from "node:fs";\nimport path from "node:path";\nimport vm from "node:vm";\nimport assert from "node:assert/strict";\nimport { fileURLToPath } from "node:url";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");\nconst html = fs.readFileSync(path.join(root, "index.html"), "utf8");\nconst app = fs.readFileSync(path.join(root, "app.js"), "utf8");\nconst source = fs.readFileSync(path.join(root, "src/app/health-controller.js"), "utf8");\n\nassert.ok(html.includes('src/app/health-controller.js'), "Health controller must load from index.html");\nassert.ok(app.includes('SignalDockHealthController.create'), "app must initialize Health controller");\nassert.ok(app.includes('healthController.bind()'), "app must bind Health controller");\nassert.ok(app.includes('health: () => healthController?.open()'), "navigation must delegate to Health controller");\nfor (const token of ['function openHealth()', 'function renderHealth(', 'function onHealthClick(']) {\n  assert.ok(!app.includes(token), `legacy Health implementation remains in app.js: ${token}`);\n}\nfor (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', '.invoke(', 'localStorage', 'sessionStorage']) {\n  assert.ok(!source.includes(forbidden), `Health controller must remain local-only: ${forbidden}`);\n}\n\nconst context = { self: {} };\nvm.runInNewContext(source, context, { filename: 'health-controller.js' });\nconst controllerApi = context.self.SignalDockHealthController;\nassert.ok(controllerApi?.create, "Health controller global API missing");\nconst emptyScope = controllerApi.selectScope([{}, {}], [], true);\nassert.equal(emptyScope.filtered, true, "zero-result filtered scope must remain filtered");\nassert.ok(Array.isArray(emptyScope.indexes), "zero-result filtered scope must retain an indexes array");\nassert.equal(emptyScope.indexes.length, 0, "zero-result filtered scope must remain empty");\nconst allScope = controllerApi.selectScope([{}, {}], [0, 1], true);\nassert.equal(allScope.filtered, false, "full filtered result should reuse all-log scope");\nassert.equal(allScope.indexes, null, "all-log scope should not allocate indexes");\n\nconsole.log("health-controller-smoke PASS");\n'''
write('tests/health-controller-smoke.mjs', health_test)

# README version + feature note
readme = read('README.md').replace('2.8.11', '2.8.12')
needle = '- Dependency trend comparison keeps period-delta orchestration in a dedicated application controller while explicit parent-span period analysis stays in the analysis layer.\n'
if needle in readme and 'Observed Health orchestration now lives' not in readme:
    readme = readme.replace(needle, needle + '- Observed Health orchestration now lives in a dedicated application controller with exact filtered-scope semantics while health scoring remains in the analysis layer.\n', 1)
write('README.md', readme)

# Changelog
changelog = read('CHANGELOG.md')
section = '''## 2.8.12 — 2026-09-16\n\n### Observed Health application boundary\n- Extracted Observed Health rendering, dialog lifecycle, scope reset and service-filter actions from the root application into `src/app/health-controller.js`.\n- Kept service health scoring, error/warning rates, exception counts and recent-vs-previous error windows in `src/analysis/service-health.js`; filtering and dialog coordination remain injected callbacks.\n- Fixed filtered-scope semantics so an active query with zero matching entries produces an empty health result instead of silently displaying all-log service health.\n- Added service-specific accessible names to generated Health filter actions and bounded rendered service rows without changing health scoring semantics.\n\n### Maintainability and verification\n- Removed legacy Observed Health functions and event listeners from `app.js`, with idempotent event ownership moved into the controller.\n- Added isolated controller coverage for zero-result scope behavior, local-only constraints, load order and application integration.\n- Extended source-layout, UI-foundation and permanent HTTP quality gates without changing persistence, parser, worker, network policy or the zero-build deployment model.\n\n'''
if '## 2.8.12 — 2026-09-16' not in changelog:
    changelog = changelog.replace('# Changelog\n\n', '# Changelog\n\n' + section, 1)
write('CHANGELOG.md', changelog)

# Technical/version docs
technical = read('docs/TECHNICAL.md').replace('2.8.11', '2.8.12')
if 'health-controller.js' not in technical:
    technical = technical.replace('`service-trends-controller.js`', '`service-trends-controller.js`, `health-controller.js`', 1)
write('docs/TECHNICAL.md', technical)

layout = read('docs/SOURCE-LAYOUT.md')
if 'health-controller.js' not in layout:
    layout = layout.replace('service-trends-controller.js', 'service-trends-controller.js`, `health-controller.js', 1)
write('docs/SOURCE-LAYOUT.md', layout)

src_readme = read('src/README.md')
if 'health-controller.js' not in src_readme:
    src_readme = src_readme.replace('- `app/service-trends-controller.js`', '- `app/service-trends-controller.js`\n- `app/health-controller.js`', 1)
write('src/README.md', src_readme)

print('v2.8.12 Observed Health controller migration staged')
