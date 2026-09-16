# SignalDock source layout

Runtime modules are grouped by responsibility while the public entrypoints stay at repository root for zero-build static hosting compatibility.

- `app/` — feature-level controllers that coordinate UI, state and domain modules through explicit factory boundaries.
- `core/` — parsing, query/search, workspace, persistence and local performance primitives.
- `analysis/` — trace, service, span and exception analysis.
- `investigation/` — projects, baselines, cases, checkpoints and evidence workflows.
- `platform/` — browser/native storage capability boundaries.
- `ui/` — reusable UI behavior and accessibility hardening.
- `vendor/` — vendored local-only runtime code.

`index.html`, `app.js`, `styles.css` and `filter-worker.js` remain root public entrypoints intentionally. New modules should be placed in the narrowest matching `src/` area rather than added to repository root.

`app/baseline-controller.js` owns Baseline Compare/History UI coordination.

`app/project-controller.js` owns Project Manager UI and explicit reopen/link orchestration.

`app/investigation-controller.js` owns evidence UI, local investigation import/export, Case Activity and Unified Timeline coordination.

`app/exception-controller.js` owns recurring-failure rendering, fingerprint-filter actions and representative exception sample navigation/pinning.

`app/case-checkpoint-controller.js` owns Case Checkpoint UI rendering and create/remove/restore event coordination.

`app/case-workspace-controller.js` owns findings, milestones and metadata-only attachment UI coordination.
