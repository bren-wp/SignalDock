import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowDir = path.join(root, ".github", "workflows");
const workflowFiles = fs.readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

function shellBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*\|\s*$/);
    if (!match) continue;
    const keyIndent = match[1].length;
    const raw = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (!line.trim()) {
        raw.push(line);
        cursor += 1;
        continue;
      }
      const indent = line.match(/^(\s*)/)[1].length;
      if (indent <= keyIndent) break;
      raw.push(line);
      cursor += 1;
    }
    const nonBlank = raw.filter((line) => line.trim());
    if (!nonBlank.length) continue;
    const contentIndent = Math.min(...nonBlank.map((line) => line.match(/^(\s*)/)[1].length));
    const script = raw
      .map((line) => line.trim() ? line.slice(contentIndent) : "")
      .join("\n")
      .replace(/\$\{\{[^\n]*?\}\}/g, "gha");
    blocks.push({ line: index + 1, script });
    index = cursor - 1;
  }
  return blocks;
}

let checked = 0;
for (const file of workflowFiles) {
  const source = fs.readFileSync(path.join(workflowDir, file), "utf8");
  for (const block of shellBlocks(source)) {
    const result = spawnSync("bash", ["-n"], { input: block.script, encoding: "utf8" });
    assert.equal(
      result.status,
      0,
      `${file} run block near line ${block.line} has invalid bash syntax:\n${result.stderr || result.stdout}`
    );
    checked += 1;
  }
}

assert.ok(checked > 0, "expected at least one multiline shell workflow block");
console.log(`workflow-shell-syntax-smoke PASS (${checked} blocks)`);
