import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "command-palette.js"), "utf8"), { filename: "command-palette.js" });
function assert(condition, message) { if (!condition) throw new Error(message); }
const commands = [
  { id: "import", title: "Import logs", keywords: "open files" },
  { id: "map", title: "Open service map", keywords: "topology dependencies" },
  { id: "settings", title: "Open settings", keywords: "preferences parser" }
];
assert(globalThis.SignalDockCommandPalette.filter(commands, "topology")[0].id === "map", "keyword ranking failed");
assert(globalThis.SignalDockCommandPalette.filter(commands, "sett")[0].id === "settings", "prefix ranking failed");
assert(globalThis.SignalDockCommandPalette.filter(commands, "xyz").length === 0, "unmatched command should be omitted");
console.log("PASS command palette ranking/filtering");
