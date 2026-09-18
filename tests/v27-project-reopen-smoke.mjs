import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const app = read("app.js");
const elementRegistry = read("src/app/element-registry.js");
const html = read("index.html");
const css = read("styles.css");
const bridge = read("src/platform/desktop-bridge.js");
const projectController = read("src/app/project-controller.js");
const version = read("VERSION").trim();
const readme = read("README.md");
const changelog = read("CHANGELOG.md");

const featureVersionParts = version.split(".").map(Number);
assert.ok(featureVersionParts.length === 3 && featureVersionParts.every(Number.isFinite) && (featureVersionParts[0] > 2 || (featureVersionParts[0] === 2 && featureVersionParts[1] >= 7)), `expected SignalDock >= 2.7.x, got ${version}`);
assert.ok(new RegExp(`APP_VERSION\\s*=\\s*[\"']${version.replace(/\./g, '\\.') }[\"']`).test(app));
assert.ok(elementRegistry.includes("projectLinkFilesButton"), "missing element-registry token projectLinkFilesButton");
assert.ok(app.includes("SignalDockDesktopBridge.saveParts"), "missing app token SignalDockDesktopBridge.saveParts");
for (const token of ["linkAndLoadFiles", "reopenHistoryItem", "markHistoryReopened", "requestPermission: true", "forgetProjectHandles"]) {
  assert.ok(projectController.includes(token), `missing Project controller token ${token}`);
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
