import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const websitePages = ["index.html", "privacy.html", "security.html"].map((name) => [
  name,
  fs.readFileSync(path.join(root, "website", name), "utf8")
]);

const escaped = version.replace(/\./g, "\\.");
if (!new RegExp(`APP_VERSION\\s*=\\s*["']${escaped}["']`).test(app)) {
  throw new Error(`app.js APP_VERSION does not match VERSION ${version}`);
}
if (!readme.includes(`version-${version}-`) || !readme.includes(`SignalDock v${version}`)) {
  throw new Error(`README version markers do not match VERSION ${version}`);
}
for (const [name, html] of websitePages) {
  if (!html.includes(`v${version}`)) throw new Error(`website/${name} does not match VERSION ${version}`);
}
if (!websitePages[0][1].includes(`SignalDock v${version}`)) {
  throw new Error(`website/index.html product version does not match VERSION ${version}`);
}

console.log(`version-consistency-smoke PASS (${version})`);
