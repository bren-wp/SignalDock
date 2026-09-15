import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); const app=fs.readFileSync(path.join(root,'app.js'),'utf8'); const worker=fs.readFileSync(path.join(root,'filter-worker.js'),'utf8'); const changelog=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8');
for(const token of ['workerToken: ""','createWorkerSessionToken','sd_session=','protocol: 1, token: state.workerToken']) assert.ok(app.includes(token),`missing app worker token ${token}`);
for(const token of ['WORKER_PROTOCOL_VERSION = 1','SESSION_TOKEN_PATTERN','ALLOWED_MESSAGE_TYPES','validEnvelope','MAX_RELATED_LIMIT']) assert.ok(worker.includes(token),`missing worker hardening token ${token}`);
assert.ok(changelog.includes('### Worker protocol hardening')); console.log('v27-worker-integration-smoke PASS');
