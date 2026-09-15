import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const version = read('VERSION').trim();
const app = read('app.js');
const html = read('index.html');
const worker = read('filter-worker.js');
const bridge = read('desktop-bridge.js');
const projects = read('project-manager.js');
const storage = read('storage-adapter.js');
const changelog = read('CHANGELOG.md');
const workflows = fs.readdirSync(path.join(root, '.github', 'workflows'));

assert.equal(version, '2.7.0');
assert.match(app, /APP_VERSION\s*=\s*["']2\.7\.0["']/);
for (const token of ['projectLinkFilesButton', 'linkAndLoadProjectFiles', 'reopenProjectHistoryItem', 'SignalDockDesktopBridge.saveParts', 'createWorkerSessionToken', 'workerToken: ""']) assert.ok(app.includes(token), `missing app token: ${token}`);
for (const token of ['desktop-bridge.js', 'projectLinkFilesButton', 'projectCapabilityMeta']) assert.ok(html.includes(token), `missing HTML token: ${token}`);
for (const token of ['WORKER_PROTOCOL_VERSION = 1', 'SESSION_TOKEN_PATTERN', 'ALLOWED_MESSAGE_TYPES', 'validEnvelope', 'MAX_RELATED_LIMIT', 'self.addEventListener("message"']) assert.ok(worker.includes(token), `missing worker token: ${token}`);
for (const token of ['pickFiles', 'saveParts', 'reopenFile', 'forgetProjectHandles']) assert.ok(bridge.includes(token), `missing desktop bridge capability: ${token}`);
for (const token of ['VERSION = 4', 'markHistoryReopened', 'portableProject', 'unlinkHistoryHandle']) assert.ok(projects.includes(token), `missing project capability: ${token}`);
for (const token of ['persistentHandles', 'removeProjectHandles', 'handleStatus', 'saveParts']) assert.ok(storage.includes(token), `missing storage capability: ${token}`);
assert.ok(changelog.includes('## 2.7.0 — 2026-09-15'));
assert.ok(changelog.includes('### Worker protocol hardening'));
assert.equal(workflows.some((name) => /^v27-.*(?:pass|retry|final)\.yml$/.test(name)), false, `temporary v2.7 workflow remains: ${workflows.join(', ')}`);

console.log('v27-final-gate PASS');
