import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const html=fs.readFileSync(path.join(root,"website","index.html"),"utf8");
const css=fs.readFileSync(path.join(root,"website","styles.css"),"utf8");
const version=fs.readFileSync(path.join(root,"VERSION"),"utf8").trim();

assert.equal(version,"2.8.28");
for(const token of [
  '<meta name="application-name" content="SignalDock">',
  '<meta name="robots" content="index,follow,max-image-preview:large">',
  '<meta name="referrer" content="strict-origin-when-cross-origin">',
  'property="og:title"',
  'name="twitter:card"',
  'class="skip-link"',
  'id="security"',
  'id="formats"',
  'SignalDock v2.8.28',
  "connect-src 'none'",
  "script-src 'none'"
]) assert.ok(html.includes(token),"website token missing: "+token);

assert.ok(!/<script\b/i.test(html),"marketing site must remain script-free");
assert.ok(!/\sstyle\s*=/i.test(html),"marketing site must not use inline styles");
assert.ok(css.includes(".skip-link"));
assert.ok(css.includes(":focus-visible"));
assert.ok(css.includes("overflow-x:auto"));
assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
assert.ok(!/\.site-header nav\s*\{[^}]*display\s*:\s*none/is.test(css),"responsive website nav must remain reachable");
assert.ok((html.match(/class="feature-grid"/g)||[]).length===1);
assert.ok((html.match(/<article>/g)||[]).length>=20,"website should retain substantial feature/security content");
console.log("website-production-smoke PASS");