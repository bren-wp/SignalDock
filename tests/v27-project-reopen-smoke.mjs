import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const app = read("app.js");
const html = read("index.html");
const css = read("styles.css");
const bridge = read("src/platform/desktop-bridge.js");
const version = read("VERSION").trim();
const readme = read("README.md");
const changelog = read("CHANGELOG.md");

assert.equal(version, "2.7.1");
assert.match(app, /APP_VERSION\s*=\s*["']2\.7\.1["']/);
for (const token of ["projectLinkFilesButton", "linkAndLoadProjectFiles", "reopenProjectHistoryItem", "markHistoryReopened", "SignalDockDesktopBridge.saveParts"]) {
  assert.ok(app.includes(token), `missing app token ${token}`);
}
for (const token of ["src/platform/desktop-bridge.js", "projectLinkFilesButton", "projectCapabilityMeta"]) {
  assert.ok(html.includes(token), `missing html token ${token}`);
}
for (const selector of [".project-capability", ".project-history-item", ".project-link-state", ".project-link-state.is-linked"]) {
  assert.ok(css.includes(selector), `missing project reopen style ${selector}`);
}
assert.ok(bridge.includes("forgetProjectHandles"));
assert.ok(readme.includes("real Project Reopen workflow"));
assert.ok(changelog.includes("## 2.7.0 — 2026-09-15"));
console.log("v27-project-reopen-smoke PASS");
