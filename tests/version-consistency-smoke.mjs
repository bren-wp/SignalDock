import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = read("VERSION").trim();

assert.match(version, /^\d+\.\d+\.\d+$/, "VERSION must be Semantic Versioning x.y.z");

const escaped = version.replace(/\./g, "\\.");
const app = read("app.js");
const readme = read("README.md");
const website = read("website/index.html");
const privacy = read("website/privacy.html");
const security = read("website/security.html");
const technical = read("docs/TECHNICAL.md");
const changelog = read("CHANGELOG.md");

assert.match(app, new RegExp(`APP_VERSION\\s*=\\s*["']${escaped}["']`), "app.js APP_VERSION must match VERSION");
assert.ok(readme.includes(`version-${version}-`), "README version badge must match VERSION");
assert.ok(readme.includes(`SignalDock v${version}`), "README release copy must match VERSION");
assert.ok(website.includes(`Current stable release SignalDock version ${version}`), "website release aria-label must match VERSION");
assert.ok(website.includes(`<strong>v${version}</strong>`), "website release badge must match VERSION");
assert.ok(website.includes(`SignalDock v${version}`), "website release copy must match VERSION");
assert.ok(privacy.includes(`v${version} · local-first · zero telemetry`), "Privacy footer must match VERSION");
assert.ok(security.includes(`v${version} · local-first · capability-bounded`), "Security footer must match VERSION");
assert.ok(technical.includes(`Current version: **${version}**.`), "technical current version must match VERSION");
assert.match(changelog, new RegExp(`^## ${escaped} — \\d{4}-\\d{2}-\\d{2}$`, "m"), "CHANGELOG must contain the current release heading");

console.log(`version-consistency-smoke PASS (${version})`);
