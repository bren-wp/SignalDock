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

`app/inspector-controller.js` owns selected-log Inspector rendering, tabs, context/correlation/trace surfaces and Inspector-local actions while worker orchestration remains in the root application.

`app/investigation-controller.js` owns evidence UI, local investigation import/export, Case Activity and Unified Timeline coordination.

`app/exception-controller.js` owns recurring-failure rendering, fingerprint-filter actions and representative exception sample navigation/pinning.

`app/trace-explorer-controller.js` owns Trace Explorer inventory rendering, A/B comparison selection/dialog UI and representative trace-sample navigation.

`app/trace-outlier-controller.js` owns Trace Outliers rendering, scope selection and trace-opening coordination while robust ranking stays in `analysis/trace-outliers.js`.

`app/service-map-controller.js` owns Service Map rendering, grouping, scope reset and topology-filter event coordination while topology aggregation/layout stays in `analysis/service-map.js`.

`app/service-matrix-controller.js` owns Service Matrix rendering, filtered-scope selection and service-filter coordination while dependency aggregation stays in `analysis/service-matrix.js`.

`app/service-heatmap-controller.js` owns Dependency Heatmap rendering, filtered-scope selection and target-service filter coordination while time bucketing stays in `analysis/service-heatmap.js`.

`app/service-trends-controller.js` owns Dependency Trends rendering, split/window controls, filtered-scope selection and target-service filter coordination while period comparison stays in `analysis/service-trends.js`.

`app/case-checkpoint-controller.js` owns Case Checkpoint UI rendering and create/remove/restore event coordination.

`app/case-workspace-controller.js` owns findings, milestones and metadata-only attachment UI coordination.
