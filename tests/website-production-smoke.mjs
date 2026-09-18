import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const websiteDir = path.join(root, "website");
const readWebsite = (name) => fs.readFileSync(path.join(websiteDir, name), "utf8");
const home = readWebsite("index.html");
const privacy = readWebsite("privacy.html");
const security = readWebsite("security.html");
const css = readWebsite("styles.css");
const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
const appHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(version, /^\d+\.\d+\.\d+$/);

for (const [name, html] of [["index.html", home], ["privacy.html", privacy], ["security.html", security]]) {
  assert.ok(html.includes('class="skip-link"'), name + " missing skip link");
  assert.ok(html.includes("script-src 'none'"), name + " missing script-src none");
  assert.ok(html.includes("connect-src 'none'"), name + " missing connect-src none");
  assert.ok(html.includes('rel="stylesheet" href="styles.css"'), name + " missing local stylesheet");
  assert.ok(!/<script\b/i.test(html), name + " must remain script-free");
  assert.ok(!/\sstyle\s*=/i.test(html), name + " must not use inline styles");
  assert.ok(!/(?:src|href)=["']https?:\/\//i.test(html), name + " must not use external runtime resources");
}

for (const token of [
  '<meta name="application-name" content="SignalDock">',
  'id="capabilities"',
  'id="runtime"',
  'id="security"',
  'id="formats"',
  'id="workflow"',
  'id="faq"',
  'SignalDock v2.8.33',
  '../docs/images/app-screenshot.png',
  'ACTUAL APPLICATION UI',
  'Current stable runtime',
  'Native installers',
  'Hosted backend / account sync',
  'Current main hardening',
  'href="privacy.html"',
  'href="security.html"'
]) assert.ok(home.includes(token), "homepage token missing: " + token);

assert.ok(!home.includes('class="mock-window"'), "homepage must use the real application screenshot instead of a hand-built UI mock");

assert.ok(home.includes(`SignalDock v${version}`), "homepage release copy must match VERSION");
assert.ok(home.includes(`<strong>v${version}</strong>`), "homepage release badge must match VERSION");

const runtimeClaims = [
  ["src/core/query-engine.js", "SMART QUERY LANGUAGE"],
  ["src/core/query-library.js", "Query Library"],
  ["src/core/search-cache.js", "search-cache"],
  ["src/analysis/trace-explorer.js", "Trace Explorer"],
  ["src/analysis/trace-outliers.js", "Trace Outliers"],
  ["src/analysis/service-map.js", "Service dependency analysis"],
  ["src/analysis/service-heatmap.js", "Dependency Heatmap"],
  ["src/analysis/service-health.js", "Observed Health"],
  ["src/investigation/baseline-manager.js", "Baselines &amp; regressions"],
  ["src/investigation/project-manager.js", "Projects &amp; reopen workflows"],
  ["src/investigation/case-workspace.js", "Case &amp; Investigation workspace"],
  ["src/investigation/case-checkpoints.js", "Case Checkpoints"],
  ["src/app/import-live-tail-controller.js", "Live Tail"],
  ["src/app/recovery-diagnostics-controller.js", "Recovery &amp; diagnostics"]
];
for (const [modulePath, websiteCopy] of runtimeClaims) {
  assert.ok(appHtml.includes(`<script src="${modulePath}" defer></script>`), "runtime module missing for website claim: " + modulePath);
  assert.ok(home.includes(websiteCopy), "website claim missing for loaded runtime module: " + websiteCopy);
}

assert.ok((home.match(/<details>/g) || []).length >= 10, "FAQ should expose at least ten script-free questions");
assert.ok(home.includes("Does SignalDock upload my logs?"));
assert.ok(privacy.includes("No telemetry endpoint"));
assert.ok(privacy.includes("Explicit exports"));
assert.ok(privacy.includes("Recovery snapshots"));
assert.ok(privacy.includes("Search cache"));
assert.ok(privacy.includes("File handles"));
assert.ok(security.includes("Authenticated worker protocol"));
assert.ok(security.includes("No generic native bridge"));
assert.ok(security.includes("CodeQL"));
assert.ok(security.includes("Trace Explorer"));
assert.ok(security.includes("Trace Outliers"));

for (const token of [
  ".skip-link", ":focus-visible", "overflow-x:auto",
  "@media (prefers-reduced-motion: reduce)", ".faq-grid", ".faq-grid details", ".faq-grid summary",
  ".product-shot", ".runtime-grid", ".status--on", ".status--conditional", ".status--off",
  ".hardening-note", ".format-groups--three", ".query-shell", ".query-code", ".query-operators"
]) assert.ok(css.includes(token), "website CSS token missing: " + token);

assert.ok(!css.includes(".mock-window"), "obsolete mock application CSS must be removed");

assert.ok(!/\.site-header nav\s*\{[^}]*display\s*:\s*none/is.test(css), "responsive website nav must remain reachable");
console.log("website-production-smoke PASS");
