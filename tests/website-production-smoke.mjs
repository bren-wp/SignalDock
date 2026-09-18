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

assert.equal(version, "2.8.29");

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
  'id="security"',
  'id="formats"',
  'id="faq"',
  'SignalDock v2.8.29',
  'href="privacy.html"',
  'href="security.html"'
]) assert.ok(home.includes(token), "homepage token missing: " + token);

assert.ok((home.match(/<details>/g) || []).length >= 6, "FAQ should expose at least six script-free questions");
assert.ok(home.includes("Does SignalDock upload my logs?"));
assert.ok(privacy.includes("No telemetry endpoint"));
assert.ok(privacy.includes("Explicit exports"));
assert.ok(security.includes("Authenticated worker protocol"));
assert.ok(security.includes("No generic native bridge"));

for (const token of [
  ".skip-link", ":focus-visible", "overflow-x:auto",
  "@media (prefers-reduced-motion: reduce)", ".faq-grid", ".faq-grid details", ".faq-grid summary"
]) assert.ok(css.includes(token), "website CSS token missing: " + token);

assert.ok(!/\.site-header nav\s*\{[^}]*display\s*:\s*none/is.test(css), "responsive website nav must remain reachable");
console.log("website-production-smoke PASS");
