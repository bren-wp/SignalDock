import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const source = fs.readFileSync(path.join(root, "src/app/health-controller.js"), "utf8");

assert.ok(html.includes('src/app/health-controller.js'), "Health controller must load from index.html");
assert.ok(app.includes('SignalDockHealthController.create'), "app must initialize Health controller");
assert.ok(app.includes('healthController.bind()'), "app must bind Health controller");
assert.ok(app.includes('health: () => healthController?.open()'), "navigation must delegate to Health controller");
for (const token of ['function openHealth()', 'function renderHealth(', 'function onHealthClick(']) {
  assert.ok(!app.includes(token), `legacy Health implementation remains in app.js: ${token}`);
}
for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', '.invoke(', 'localStorage', 'sessionStorage']) {
  assert.ok(!source.includes(forbidden), `Health controller must remain local-only: ${forbidden}`);
}
assert.ok(!source.includes("scope.indexes.map("), "Health controller must not materialize a filtered entry copy");
assert.ok(source.includes("SignalDockServiceHealth.analyze(state.entries, { indexes: scope.indexes })"), "Health controller must delegate filtered scope by indexes");

const context = { self: {} };
vm.runInNewContext(source, context, { filename: 'health-controller.js' });
const controllerApi = context.self.SignalDockHealthController;
assert.ok(controllerApi?.create, "Health controller global API missing");
const emptyScope = controllerApi.selectScope([{}, {}], [], true);
assert.equal(emptyScope.filtered, true, "zero-result filtered scope must remain filtered");
assert.ok(Array.isArray(emptyScope.indexes), "zero-result filtered scope must retain an indexes array");
assert.equal(emptyScope.indexes.length, 0, "zero-result filtered scope must remain empty");
const allScope = controllerApi.selectScope([{}, {}], [0, 1], true);
assert.equal(allScope.filtered, false, "full filtered result should reuse all-log scope");
assert.equal(allScope.indexes, null, "all-log scope should not allocate indexes");

console.log("health-controller-smoke PASS");
