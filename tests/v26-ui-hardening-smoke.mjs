import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/ui/ui-hardening.js"), "utf8");

const required = [
  [html, "src/ui/ui-hardening.js"],
  [css, "prefers-reduced-motion"],
  [css, "has-coarse-pointer"],
  [css, ":focus-visible"],
  [ui, "aria-labelledby"],
  [ui, "aria-modal"],
  [ui, "trapTab"],
  [ui, "has-coarse-pointer"]
];
for (const [haystack, token] of required) {
  if (!haystack.includes(token)) throw new Error(`Missing retained UI hardening behavior: ${token}`);
}
console.log("v26-ui-hardening-smoke PASS");
