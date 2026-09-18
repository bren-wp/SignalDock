import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

let capturedBlob = null;
let clickedDownload = "";
globalThis.window = globalThis;
globalThis.URL = {
  createObjectURL(blob) { capturedBlob = blob; return "blob:signaldock-test"; },
  revokeObjectURL() {}
};
globalThis.document = {
  body: { appendChild() {} },
  createElement(tag) {
    if (tag === "a") {
      return {
        href: "",
        download: "",
        click() { clickedDownload = this.download; },
        remove() {}
      };
    }
    if (tag === "textarea") {
      return { value: "", setAttribute() {}, className: "", select() {}, remove() {} };
    }
    return {};
  },
  execCommand() { return true; }
};

vm.runInThisContext(fs.readFileSync(path.join(root, "src/core/utils.js"), "utf8"), { filename: "src/core/utils.js" });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rows = Array.from({ length: 5001 }, (_, index) => ({ index, message: `row-${index}` }));
globalThis.SignalDockUtils.downloadNdjson("rows.ndjson", rows, 2000);
assert(clickedDownload === "rows.ndjson", "NDJSON export filename mismatch");
assert(capturedBlob instanceof Blob, "NDJSON export must create a Blob");
assert(capturedBlob.type === "application/x-ndjson;charset=utf-8", "NDJSON export MIME type mismatch");

const text = await capturedBlob.text();
const lines = text.trimEnd().split("\n");
assert(lines.length === 5001, "NDJSON export lost rows across chunk boundaries");
assert(JSON.parse(lines[0]).index === 0, "NDJSON first row mismatch");
assert(JSON.parse(lines[2000]).index === 2000, "NDJSON middle chunk boundary mismatch");
assert(JSON.parse(lines.at(-1)).index === 5000, "NDJSON final row mismatch");
assert(text.endsWith("\n"), "NDJSON export must end with a newline");

const source = fs.readFileSync(path.join(root, "src/core/utils.js"), "utf8");
assert(!source.includes("rows.slice(i, i + chunkSize).map"), "NDJSON exporter must not duplicate chunk row references");

console.log("utils-smoke PASS");
