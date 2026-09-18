import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const context = { self: {}, window: {} };
context.self = context;
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL("../src/analysis/trace-regression.js", import.meta.url), "utf8"), context);

const traceSet = (signature, traces, p95DurationMs, errorRate = 0, services = [signature]) => ({
  signature,
  services,
  traces,
  p95DurationMs,
  errorRate
});

const baseline = {
  traceSets: [
    traceSet("regressed", 10, 100, 0.01),
    traceSet("stable", 20, 200, 0.02),
    traceSet("improved", 30, 300, 0.10),
    traceSet("missing", 40, 400, 0.03)
  ]
};
const current = {
  traceSets: [
    traceSet("regressed", 12, 150, 0.08),
    traceSet("stable", 21, 220, 0.03),
    traceSet("improved", 31, 200, 0.02),
    traceSet("new", 5, 80, 0)
  ]
};

const result = context.SignalDockTraceRegression.compare(current, baseline);
assert.deepEqual(
  Array.from(result.rows, (row) => row.status),
  ["regressed", "new", "stable", "improved", "missing"]
);
assert.equal(result.summary.sets, 5);
assert.equal(result.summary.regressed, 1);
assert.equal(result.summary.improved, 1);
assert.equal(result.summary.newSets, 1);
assert.equal(result.summary.missing, 1);

const regressed = result.rows.find((row) => row.signature === "regressed");
assert.equal(regressed.currentTraces, 12);
assert.equal(regressed.baselineTraces, 10);
assert.equal(regressed.countDelta, 2);
assert.equal(regressed.p95Delta, 50);
assert.ok(regressed.errorRateDelta > 0);

const missingLatency = context.SignalDockTraceRegression.compare(
  { traceSets: [traceSet("untimed", 3, 120, 0.01)] },
  { traceSets: [traceSet("untimed", 3, null, 0.01)] }
);
assert.equal(missingLatency.rows[0].p95Delta, null, "missing baseline latency must stay unknown");
assert.equal(missingLatency.rows[0].status, "stable", "missing latency alone must not create a regression label");

const source = fs.readFileSync(new URL("../src/analysis/trace-regression.js", import.meta.url), "utf8");
assert.equal((source.match(/rows\.filter\(/g) || []).length, 0, "trace regression summary must not rescan rows with filter()");
assert.equal(source.includes("cur.map("), false, "trace regression must not build temporary current-map arrays");
assert.equal(source.includes("base.map("), false, "trace regression must not build temporary baseline-map arrays");

console.log("trace-regression-smoke PASS");
