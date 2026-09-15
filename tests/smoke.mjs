import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.window = globalThis;

for (const file of ["src/vendor/zip.js", "src/analysis/span-events.js", "src/core/parser.js", "src/core/query-engine.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const parserCases = [
  ["nested ECS JSON", JSON.stringify({ "@timestamp": "2026-09-12T20:00:00Z", log: { level: "error" }, service: { name: "api" }, message: "boom" }), (entry) => entry.level === "ERROR" && entry.service === "api" && entry.timestampMs],
  ["Docker", "2026-09-12T20:00:00.123Z stderr F failed to connect timeout", (entry) => entry.service === "stderr" && entry.level === "ERROR"],
  ["Apache", '127.0.0.1 - - [12/Sep/2026:22:00:00 +0200] "GET /private HTTP/1.1" 500 120', (entry) => entry.level === "ERROR" && entry.service === "http"],
  ["syslog", "Sep 12 22:00:00 host sshd[991]: Failed password for root", (entry) => entry.service === "sshd" && entry.level === "ERROR"],
  ["logfmt", 'time=2026-09-12T20:00:00Z level=warn service=worker msg="retrying job"', (entry) => entry.level === "WARN" && entry.service === "worker"],
  ["multiline", "2026-09-12T20:00:00Z ERROR [api] Exception happened\n  at foo.js:1:2\n  at bar.js:2:3", (entry) => entry.level === "ERROR" && entry.message.includes("at foo.js")]
];

for (const [name, text, check] of parserCases) {
  const entries = globalThis.SignalDockParser.parseText(text, "test.log");
  assert(entries.length === 1, `${name}: expected one entry, received ${entries.length}`);
  assert(check(entries[0]), `${name}: parsed entry did not match expectation`);
  console.log(`PASS ${name}`);
}

const queryEntries = globalThis.SignalDockParser.parseText([
  JSON.stringify({ timestamp: "2026-09-12T20:00:00Z", level: "error", service: "auth worker", message: "token timeout" }),
  JSON.stringify({ timestamp: "2026-09-12T20:10:00Z", level: "info", service: "api", message: "health ok" }),
  JSON.stringify({ timestamp: "2026-09-12T20:20:00Z", level: "warn", service: "auth worker", message: "token expiring" })
].join("\n"), "query.ndjson");

const parsedQuery = globalThis.SignalDockQueryEngine.parseSmartQuery('level:error,warn service:"auth worker" -health has:timestamp');
const queryResult = globalThis.SignalDockQueryEngine.filterIndexes(queryEntries, {
  parsed: parsedQuery,
  level: "",
  source: "",
  timeRange: "",
  sortMode: "oldest",
  showUnknown: true,
  referenceTime: Date.parse("2026-09-12T20:20:00Z")
});
assert(queryResult.indexes.length === 2, `smart query: expected two matches, received ${queryResult.indexes.length}`);
console.log("PASS smart query");

const exceptionQueryEntries = queryEntries.map((entry, index) => Object.assign({}, entry, { exceptionFingerprint: index === 0 ? "ex-deadbeef" : "" }));
const exceptionQuery = globalThis.SignalDockQueryEngine.filterIndexes(exceptionQueryEntries, { query: "exception:ex-deadbeef has:exception", showUnknown: true });
assert(exceptionQuery.indexes.length === 1 && exceptionQuery.indexes[0] === 0, "exception fingerprint query should match one entry");
console.log("PASS exception fingerprint query");


const correlationEntries = globalThis.SignalDockParser.parseText([
  JSON.stringify({ timestamp: "2026-09-12T20:00:00Z", level: "error", service: { name: "worker" }, trace: { id: "trace-abc-123" }, job_id: "job-77", message: "connect ETIMEDOUT" }),
  JSON.stringify({ timestamp: "2026-09-12T20:00:01Z", level: "info", service: { name: "worker" }, trace_id: "trace-abc-123", jobId: "job-77", message: "retrying" }),
  JSON.stringify({ timestamp: "2026-09-12T20:00:02Z", level: "info", service: { name: "api" }, trace_id: "different", message: "healthy" })
].join("\n"), "correlation.ndjson");
assert(correlationEntries[0].correlations.trace === "trace-abc-123", "correlation parser: trace id missing");
assert(correlationEntries[0].correlations.job === "job-77", "correlation parser: job id missing");
const related = globalThis.SignalDockQueryEngine.relatedIndexes(correlationEntries, correlationEntries[0].correlations, 20);
assert(related.length === 2 && related.includes(1), `correlation engine: expected two related entries, got ${related.length}`);
console.log("PASS correlation extraction + matching");

const textCorrelation = globalThis.SignalDockParser.parseText("2026-09-12T20:00:03Z ERROR [worker] failed job_id=job-88 trace_id=trace-text-9 user_id=user-3", "plain.log")[0];
assert(textCorrelation.correlations.job === "job-88" && textCorrelation.correlations.trace === "trace-text-9" && textCorrelation.correlations.user === "user-3", "plain correlation extraction failed");
console.log("PASS plain-text correlation extraction");

const traceEntry = globalThis.SignalDockParser.parseText(JSON.stringify({
  "@timestamp": "2026-09-12T20:30:00Z",
  log: { level: "info" },
  service: { name: "checkout" },
  trace: { id: "trace-waterfall-1" },
  span: { id: "span-child-1" },
  parent_span_id: "span-root-1",
  event: { duration: 12500000, name: "charge-card" },
  message: "charge completed"
}), "trace.ndjson")[0];
assert(traceEntry.correlations.trace === "trace-waterfall-1" && traceEntry.correlations.span === "span-child-1", "trace metadata: trace/span extraction failed");
assert(traceEntry.traceMeta.parentSpan === "span-root-1", "trace metadata: parent span extraction failed");
assert(Math.abs(traceEntry.traceMeta.durationMs - 12.5) < 0.001, `trace metadata: expected 12.5 ms duration, got ${traceEntry.traceMeta.durationMs}`);
console.log("PASS trace/span waterfall metadata");
const longDurationEntry = globalThis.SignalDockParser.parseText(JSON.stringify({ timestamp: "2026-09-12T20:30:00Z", level: "info", service: "batch", message: "long task", trace_id: "long-trace", span_id: "long-span", duration_ms: 1000000 }), "duration.ndjson")[0];
assert(longDurationEntry.traceMeta.durationMs === 1000000, `duration units: duration_ms must stay milliseconds, got ${longDurationEntry.traceMeta.durationMs}`);
console.log("PASS explicit duration unit handling");

const spanEventEntry = globalThis.SignalDockParser.parseText(JSON.stringify({
  timestamp: "2026-09-12T20:31:00Z", level: "error", service: "api", trace_id: "trace-events", span_id: "span-events", message: "request failed",
  events: [{ name: "exception", timeUnixNano: 1789245060123000000, attributes: [{ key: "exception.type", value: { stringValue: "TimeoutError" } }] }]
}), "events.ndjson")[0];
assert(spanEventEntry.traceMeta.events.length === 1 && spanEventEntry.traceMeta.events[0].name === "exception", "span events: event extraction failed");
assert(spanEventEntry.traceMeta.events[0].attributes["exception.type"] === "TimeoutError", "span events: attributes were not normalized");
console.log("PASS OpenTelemetry-style span events");

const otlpExport = { resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "checkout" } }, { key: "service.namespace", value: { stringValue: "payments" } }, { key: "deployment.environment.name", value: { stringValue: "production" } }] }, scopeSpans: [{ scope: { name: "http" }, spans: [{ traceId: "otlp-trace-1", spanId: "otlp-span-1", name: "GET /checkout", startTimeUnixNano: "1789245001100000000", endTimeUnixNano: "1789245001142000000", status: { code: "STATUS_CODE_ERROR", message: "checkout timeout" }, events: [{ name: "exception", timeUnixNano: "1789245001130000000", attributes: [{ key: "exception.type", value: { stringValue: "TimeoutError" } }] }] }] }] }] };
const otlpEntries = globalThis.SignalDockParser.parseText(JSON.stringify(otlpExport), "otlp.json");
assert(otlpEntries.length === 1 && otlpEntries[0].service === "checkout" && otlpEntries[0].correlations.trace === "otlp-trace-1", "OTLP export: span flatten failed");
assert(Math.round(otlpEntries[0].traceMeta.durationMs) === 42 && otlpEntries[0].traceMeta.events.length === 1, "OTLP export: duration/events failed");
assert(otlpEntries[0].dimensions.environment === "production" && otlpEntries[0].dimensions.namespace === "payments", "OTLP export: resource dimensions failed");
console.log("PASS OTLP JSON export flattening");

const dimensionEntry = globalThis.SignalDockParser.parseText(JSON.stringify({
  "@timestamp": "2026-09-12T20:35:00Z",
  log: { level: "info" },
  service: { name: "payments", namespace: "checkout" },
  deployment: { environment: { name: "production" } },
  message: "dimension test"
}), "dimension.ndjson")[0];
assert(dimensionEntry.dimensions.environment === "production" && dimensionEntry.dimensions.namespace === "checkout", `dimension extraction failed: ${JSON.stringify(dimensionEntry.dimensions)}`);
const dimensionQuery = globalThis.SignalDockQueryEngine.filterIndexes([dimensionEntry], { query: "env:production namespace:checkout", showUnknown: true });
assert(dimensionQuery.indexes.length === 1, "environment/namespace query should match extracted dimensions");
console.log("PASS environment/namespace dimensions + query");

const accessProfile = globalThis.SignalDockParser.parseText('127.0.0.1 - - [12/Sep/2026:22:00:00 +0200] "GET /profile HTTP/1.1" 404 42', "access.log", "access")[0];
assert(accessProfile.service === "http" && accessProfile.level === "WARN", "access parser profile failed");
const syslogProfileMismatch = globalThis.SignalDockParser.parseText('127.0.0.1 - - [12/Sep/2026:22:00:00 +0200] "GET /profile HTTP/1.1" 404 42', "access.log", "syslog")[0];
assert(syslogProfileMismatch.service === "—", "fixed syslog profile should not parse an access line as HTTP");
console.log("PASS parser profiles");

const customLine = "2026-09-12T23:10:11Z | ERROR | billing-worker | payment failed hard";
const customPattern = String.raw`^(?<time>\S+)\s+\|\s+(?<level>\w+)\s+\|\s+(?<service>[^|]+?)\s+\|\s+(?<message>.*)$`;
const customProfile = globalThis.SignalDockParser.parseText(customLine, "custom.log", "custom", { pattern: customPattern, flags: "i" })[0];
assert(customProfile.level === "ERROR" && customProfile.service === "billing-worker" && customProfile.message === "payment failed hard", "custom regex parser profile failed");
let invalidCustomRejected = false;
try { globalThis.SignalDockParser.normalizeCustomProfile({ pattern: "(?<message>[", flags: "i" }); } catch { invalidCustomRejected = true; }
assert(invalidCustomRejected, "invalid custom parser regex should be rejected");
console.log("PASS custom regex parser profile");

const regexQuery = globalThis.SignalDockQueryEngine.parseSmartQuery('level:error re:/ETIMEDOUT|ECONNRESET/i trace:trace-abc');
const regexResult = globalThis.SignalDockQueryEngine.filterIndexes(correlationEntries, {
  parsed: regexQuery, level: "", source: "", timeRange: "", sortMode: "original", showUnknown: true, referenceTime: 0
});
assert(regexResult.indexes.length === 1 && regexResult.indexes[0] === 0, `regex query: expected first entry only, got ${regexResult.indexes}`);
console.log("PASS regex + correlation query");

const invalidRegex = globalThis.SignalDockQueryEngine.parseSmartQuery('re:/([a-z/');
assert(invalidRegex.invalid.length === 1, "invalid regex should be reported instead of executed");
console.log("PASS invalid regex guard");
const expensiveRegex = globalThis.SignalDockQueryEngine.parseSmartQuery('re:/(a+)+$/');
assert(expensiveRegex.invalid.length === 1, "nested quantified regex should be rejected");
console.log("PASS expensive regex guard");

const anyQuery = globalThis.SignalDockQueryEngine.parseSmartQuery('any:healthy,retrying');
const anyResult = globalThis.SignalDockQueryEngine.filterIndexes(correlationEntries, { parsed: anyQuery, showUnknown: true });
assert(anyResult.indexes.length === 2, `any query: expected two entries, got ${anyResult.indexes.length}`);
console.log("PASS any query");

const largeLine = "2026-09-12T20:00:00Z INFO [api] Request completed successfully\n";
const repeated = largeLine.repeat(Math.ceil((5.4 * 1024 * 1024) / largeLine.length));
const largeFile = new File([repeated], "large.log", { type: "text/plain" });
let progress = 0;
const streamed = await globalThis.SignalDockParser.parseFile(largeFile, (value) => { progress = value; });
assert(streamed.length > 50000, `streaming parser: expected >50k entries, received ${streamed.length}`);
assert(progress === 1, `streaming parser: expected progress=1, received ${progress}`);
const largeFilterStarted = performance.now();
const largeFilter = globalThis.SignalDockQueryEngine.filterIndexes(streamed, { query: "level:info service:api", showUnknown: true });
const largeFilterMs = Math.round((performance.now() - largeFilterStarted) * 10) / 10;
assert(largeFilter.indexes.length === streamed.length, `large filter: expected ${streamed.length} matches, received ${largeFilter.indexes.length}`);
console.log(`PASS streaming parser + large filter (${streamed.length.toLocaleString()} entries · ${largeFilterMs} ms filter)`);

const zipBytes = fs.readFileSync(path.join(here, "fixtures", "parser-test.zip"));
const zipFile = new File([zipBytes], "parser-test.zip", { type: "application/zip" });
const zipped = await globalThis.SignalDockParser.parseFile(zipFile);
assert(zipped.length === 16, `ZIP parser: expected 16 entries, received ${zipped.length}`);
console.log("PASS ZIP parser");

console.log("SignalDock smoke tests passed.");
