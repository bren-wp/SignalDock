import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");

for (const token of [
  "workflow_run:",
  "- SignalDock CI",
  "- CodeQL",
  "contents: write",
  "checks: read",
  "group: release-${{ github.event.workflow_run.head_sha }}",
  "cancel-in-progress: false",
  "github.event.workflow_run.head_branch == 'main'",
  "github.event.workflow_run.head_sha",
  'git show "${SHA}^:VERSION"',
  'gh release view "$TAG"',
  "release $TAG is missing; retrying publication",
  "node tests/version-consistency-smoke.mjs",
  'check_state "quality-gate"',
  'check_state "Analyze JavaScript / TypeScript"',
  'gh release create "$TAG"',
  '--target "$SHA"',
  'git/ref/tags/${TAG}',
  "resolve_tag_sha",
  "CHANGELOG.md"
]) {
  assert.ok(source.includes(token), "release workflow missing required gate: " + token);
}

assert.equal(source.includes("secrets."), false, "release workflow must not require private repository secrets");
assert.ok(source.includes("GH_TOKEN: ${{ github.token }}"), "release workflow must use the built-in GitHub token");
assert.equal(/\n\s+push:/.test(source), false, "release workflow must not publish directly on arbitrary pushes");
assert.equal(/\n\s+pull_request:/.test(source), false, "release workflow must not publish from pull requests");

console.log("release-workflow-smoke PASS");

assert.equal(source.includes('commits/${TAG}'), false, "release workflow must not treat an API error body as a tag SHA");
