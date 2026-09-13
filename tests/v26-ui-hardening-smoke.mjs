import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'ui-hardening.js'), 'utf8');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

const required = [
  [html, 'ui-hardening.js'],
  [app, 'buildWindow'],
  [app, 'summary?.traces'],
  [css, 'SignalDock v2.6 accessibility and mobile hardening'],
  [css, 'prefers-reduced-motion'],
  [ui, 'aria-labelledby'],
  [ui, 'trapTab'],
  [ui, 'has-coarse-pointer'],
  [readme, 'bounded Trace Explorer result windows'],
  [readme, 'local File System Access handle registry foundation'],
  [changelog, '## 2.6.0 — 2026-09-13']
];
for (const [haystack, token] of required) {
  if (!haystack.includes(token)) throw new Error(`Missing v2.6 integration token: ${token}`);
}
if (version !== '2.6.0') throw new Error(`Expected VERSION 2.6.0, found ${version}`);
if (!/APP_VERSION\s*=\s*["']2\.6\.0["']/.test(app)) throw new Error('app.js is not wired to v2.6.0');
if (!html.includes('<script src="ui-hardening.js" defer></script>')) throw new Error('ui-hardening.js is not loaded as a local deferred script');

console.log('v26-ui-hardening-smoke PASS');
