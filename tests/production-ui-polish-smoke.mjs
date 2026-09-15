import fs from "node:fs";
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

const featureVersionParts = version.split(".").map(Number);
assert.ok(featureVersionParts.length === 3 && featureVersionParts.every(Number.isFinite) && (featureVersionParts[0] > 2 || (featureVersionParts[0] === 2 && featureVersionParts[1] >= 7)), `expected SignalDock >= 2.7.x, got ${version}`);
assert.ok(new RegExp(`APP_VERSION\\s*=\\s*[\"']${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\"']`).test(app));
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
assert.ok(technical.includes(`Current version: **${version}**.`));

const defs = new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
const missing = new Set();
for (const match of css.matchAll(/var\((--[a-zA-Z0-9-]+)([^)]*)\)/g)) {
  const hasFallback = match[2].includes(",");
  if (!defs.has(match[1]) && !hasFallback) missing.add(match[1]);
}
assert.deepEqual([...missing].sort(), [], `undefined CSS variables without fallbacks: ${[...missing].join(", ")}`);
console.log("production-ui-polish-smoke PASS");
