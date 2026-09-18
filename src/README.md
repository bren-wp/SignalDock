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

`app/settings-controller.js` owns Settings UI synchronization, local preference persistence and saved parser-profile management while parser execution remains outside the controller.

`app/command-navigation-controller.js` owns workspace navigation, Command Palette UI/keyboard behavior and navigation reset listeners while feature actions remain root-injected callbacks.

`app/recovery-diagnostics-controller.js` owns recovery/autosave UI orchestration and diagnostics rendering while persistence, search-cache, workspace-restore and browser capabilities remain root-injected callbacks.

`app/saved-views-controller.js` owns quick Saved Views naming, rendering, apply/delete behavior and UI listeners while JSON persistence, prompt/ID generation and filter execution remain root-injected callbacks.

`app/import-live-tail-controller.js` owns file import/drag-drop UI orchestration, parsed-entry append state and Live Tail lifecycle while parser, File System Access, Project Manager, worker and recovery capabilities remain root-injected callbacks.

`app/dataset-filter-controller.js` owns normalized filter-index/summary state, filter request/application orchestration and filter/source UI listeners while Query Engine, worker dispatch, analysis modules and performance timing remain root-injected callbacks.

`app/table-view-controller.js` owns paged/windowed rendering, pagination, virtual spacers, row DOM and table listeners while viewport calculation, formatting, selection and performance timing remain root-injected callbacks.

`app/workspace-controller.js` owns workspace/view snapshots, save/restore orchestration and workspace UI shortcuts while serialization, file I/O, Desktop Bridge/Project handle capabilities and domain normalization remain root-injected callbacks.

`app/dataset-overview-controller.js` owns dataset metrics, source navigation, active-source UI state and timeline rendering while filter/index state, formatting and all privileged capabilities remain outside the controller.

`app/filter-worker-controller.js` owns main-thread worker lifecycle plus authenticated index/filter/correlation/trace routing. Token generation and Worker construction remain root-injected, and the worker script remains authoritative for validation and bounds.

`app/related-context-controller.js` owns correlation/trace request sequencing and worker-to-main fallback orchestration while Query Engine execution, worker dispatch, Inspector rendering and profiling remain injected callbacks.

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


app/dataset-session-controller.js owns filtered export and loaded-dataset clearing while download, recovery, worker synchronization and domain factories remain injected.
