import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = new Map();
const ctx = {
  self: {
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    }
  }
};
vm.createContext(ctx);
for (const file of ['trace-explorer.js', 'service-matrix.js', 'storage-adapter.js', 'project-manager.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}

const traceEntries = [];
for (let trace = 0; trace < 40; trace += 1) {
  for (let span = 0; span < 12; span += 1) {
    traceEntries.push({
      service: `svc-${span % 5}`,
      level: span === 11 && trace % 3 === 0 ? 'ERROR' : 'INFO',
      timestampMs: 1000 + trace * 100 + span,
      correlations: { trace: `trace-${trace}`, span: `span-${trace}-${span}` },
      traceMeta: { durationMs: span + 1, parentSpan: span ? `span-${trace}-${span - 1}` : '' }
    });
  }
}
const traceApi = ctx.self.SignalDockTraceExplorer;
const fullTraces = traceApi.build(traceEntries);
assert.equal(fullTraces.summary.traces, 40);
assert.equal(fullTraces.summary.uniqueSpans, 480);
assert.equal(fullTraces.rows.find((row) => row.traceId === 'trace-0').parentCoverage, 1);
const windowed = traceApi.buildWindow(traceEntries, null, { limit: 9 });
assert.equal(windowed.rows.length, 9);
assert.equal(windowed.summary.traces, 40);
assert.equal(windowed.summary.truncated, true);

const matrixEntries = [{ service: 'gateway', level: 'INFO', correlations: { trace: 't', span: 'root' }, traceMeta: { parentSpan: '', durationMs: 1 } }];
for (let i = 0; i < 300; i += 1) {
  matrixEntries.push({ service: 'db', level: 'INFO', correlations: { trace: `t-${i}`, span: `child-${i}` }, traceMeta: { parentSpan: 'root', durationMs: i + 1 } });
}
const matrix = ctx.self.SignalDockServiceMatrix.build(matrixEntries);
const edge = matrix.rows.find((row) => row.source === 'gateway' && row.target === 'db');
assert.ok(edge);
assert.equal(edge.calls, 300);
assert.equal(edge.timed, 300);
assert.equal(edge.maxMs, 300);
assert.equal(edge.latencyApproximate, true);
assert.equal(matrix.summary.approximateLatencyEdges, 1);

const storageApi = ctx.self.SignalDockStorageAdapter;
assert.equal(storageApi.capabilities().persistentHandles, false);
assert.match(storageApi.handleRef('Payments Prod', 'file', 'dataset 1'), /^Payments-Prod:file:dataset-1$/);

const projectsApi = ctx.self.SignalDockProjectManager;
let created = projectsApi.create([], { name: 'Payments' });
let projects = projectsApi.touchDataset(created.projects, created.project.id, { id: 'd1', name: 'prod.ndjson', size: 123, handleRef: 'local:file:d1', handleKind: 'file' });
assert.equal(projects[0].recentDatasets[0].reopenable, true);
projects = projectsApi.unlinkHistoryHandle(projects, created.project.id, 'recentDatasets', 'd1');
assert.equal(projects[0].recentDatasets[0].reopenable, false);
projects = projectsApi.linkHistoryHandle(projects, created.project.id, 'recentDatasets', 'd1', 'local:file:d1', 'file');
const exported = JSON.parse(projectsApi.exportJson(projects, created.project.id));
assert.ok(projectsApi.VERSION >= 3, 'Project schema must retain the v3 local-handle foundation or a compatible successor.');
assert.equal(exported.version, projectsApi.VERSION);
assert.equal('handleRef' in exported.projects[0].recentDatasets[0], false);
assert.equal('reopenable' in exported.projects[0].recentDatasets[0], false);

console.log('v26-foundations-smoke PASS');
