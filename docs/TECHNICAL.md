# SignalDock

## Application controller boundary

The root `app.js` remains the public workspace entrypoint, but feature-owned UI behavior is progressively moving into zero-build controllers under `src/app/`. Controllers receive the shared state object, element registry and the narrow cross-feature actions they need through a factory call; they do not own a second application state or introduce a framework/bundler dependency.

`query-library-controller.js` owns Query Library rendering, event listeners, local import/export actions, folder management and bulk selection. Its event binding is idempotent and exposes teardown for deterministic lifecycle management. Domain persistence and normalization remain in `src/core/query-library.js`, so UI coordination and Query Library data rules stay separate.

`baseline-controller.js` owns Baseline Compare and Baseline History UI coordination, while aggregate snapshot normalization/comparison remains in `src/investigation/baseline-manager.js`. Project naming/attachment, filter application and autosave are injected callbacks so the controller does not reach into Project Manager implementation details.

`project-controller.js` owns Project Manager rendering, CRUD actions and explicit link/relink/reopen/forget orchestration. File parsing and workspace restore remain injected application callbacks, while filesystem access is limited to the existing `src/platform/desktop-bridge.js` capability facade. Portable project export/duplication rules remain in `src/investigation/project-manager.js`.

`inspector-controller.js` owns the selected-log Inspector UI, Details/Context/Correlations/Trace/Raw/JSON tab rendering, representative context navigation and inspector-local filter actions. Worker request/response orchestration remains in `app.js` through narrow callbacks, while trace analysis stays in the existing `src/analysis/` modules.

`settings-controller.js` owns Settings form synchronization, preference persistence and saved custom-parser profile UI. Parser execution remains in the root application and `src/core/parser-profiles.js`; recovery, worker and filesystem capabilities are not exposed to the Settings controller.

`command-navigation-controller.js` owns workspace navigation state, Command Palette definitions/rendering, keyboard interaction and dialog-to-navigation reset behavior. Feature execution stays behind injected root callbacks, so the controller receives no parser, worker, network, storage or filesystem capability.

`recovery-diagnostics-controller.js` owns recovery-banner state, autosave scheduling/status, recovery UI actions, diagnostics rendering and support-detail copy orchestration. IndexedDB persistence, search-cache operations, workspace restoration and browser capability detection stay in the root/platform boundary and are supplied only through narrow callbacks.

`saved-views-controller.js` owns the legacy quick Saved Views UI lifecycle: naming, bounded state updates, rendering, apply/delete actions and listener ownership. Loading/persisting view JSON, generating IDs, prompting and executing filter work remain root-injected callbacks so the controller receives no storage, worker, filesystem or network capability.

`import-live-tail-controller.js` owns file-input and drag/drop listeners, import progress/state coordination, parsed-entry append state and the Live Tail lifecycle. Parser execution, File System Access picker/handle reads, Project Manager persistence, worker synchronization and recovery autosave remain root-injected callbacks; the controller never receives those capabilities directly.

`investigation-controller.js` owns Investigation evidence rendering/actions, local import/export, Case Activity and Unified Case Timeline coordination. Investigation and Case domain modules remain authoritative for normalization and bounded evidence/case data; log selection, inspector refresh, Case Workspace refresh and autosave are injected callbacks.

`exception-controller.js` owns Exception Explorer rendering, deterministic fingerprint query coordination and representative-sample actions. Grouping and trend classification remain in `src/analysis/exception-groups.js` and `src/analysis/exception-trends.js`; log filtering, evidence pinning and selected-log navigation are injected callbacks. Sample resolution prefers stable entry IDs before index and fingerprint fallbacks so restored workspaces do not depend on stale array positions.

`trace-explorer-controller.js` owns distributed Trace Explorer rendering, two-trace comparison selection/dialog coordination and representative trace-sample navigation. Trace inventory and A/B comparison calculations remain in `src/analysis/trace-explorer.js` and `src/analysis/trace-compare.js`; filtering, inspector rendering and dialog coordination are injected callbacks. Sample navigation prefers a stable entry ID before index and explicit trace-ID fallbacks.

`trace-outlier-controller.js` owns Trace Outliers rendering, filtered/all-log scope selection and trace-opening actions. Robust scoring remains in `src/analysis/trace-outliers.js`; query filtering, selected-log navigation, inspector rendering and dialog coordination are injected callbacks. A zero-result active filter remains an empty scope instead of silently falling back to all loaded logs, and rendered actions retain stable entry IDs with index/trace fallbacks.

`service-map-controller.js` owns Service Map SVG/list rendering, grouping controls, filtered/all-log scope selection and topology-filter actions. Explicit parent-span topology aggregation and deterministic layout remain in `src/analysis/service-map.js`; query mutation, dialog coordination and performance recording are injected callbacks. Resetting to all logs remains sticky when grouping changes, and zero-result filtered scopes remain explicitly empty.

`service-matrix-controller.js` owns Service Matrix rendering, filtered/all-log scope selection and service-filter actions. Dependency aggregation and bounded latency statistics remain in `src/analysis/service-matrix.js`; service filtering and dialog coordination are injected callbacks. Empty filtered results remain an explicit empty matrix instead of silently falling back to the all-log cache.

`service-heatmap-controller.js` owns Dependency Heatmap rendering, filtered/all-log scope selection and target-service filter actions. Time bucketing and explicit parent-span dependency aggregation remain in `src/analysis/service-heatmap.js`; service filtering and dialog coordination are injected callbacks. Empty filtered results remain an explicit empty heatmap instead of silently falling back to all loaded logs.

`service-trends-controller.js`, `health-controller.js` owns Dependency Trends rendering, filtered/all-log scope selection, comparison split controls and target-service filter actions. Period edge aggregation, trend classification and before/after deltas remain in `src/analysis/service-trends.js`; service filtering and dialog coordination are injected callbacks. Empty filtered results remain explicit empty comparisons and split values are normalized to the supported 10–90% range.

`case-checkpoint-controller.js` owns Case Checkpoint rendering and create/remove/restore UI actions. Checkpoint snapshots/diffs remain in `src/investigation/case-checkpoints.js`, while the controller receives Case Workspace refresh and autosave as narrow callbacks. Case Workspace rendering also refreshes checkpoint diffs so restored sessions and later edits remain visually synchronized.

`case-workspace-controller.js` owns findings, milestones and metadata-only attachment rendering plus their delegated UI events. The Case Workspace domain module remains authoritative for normalization, bounds and metadata-only attachment records. Cross-feature effects such as selected-entry lookup, activity recording, workspace refresh and autosave are injected callbacks rather than hidden global dependencies.


**Private observability on your machine.**

SignalDock is a local-first log inspection workspace for developers. It opens log files directly in the browser, parses and filters them on the device, and never uploads log contents to a backend.

Current version: **2.8.19**.

## Highlights

- SignalDock brand system with local SVG logo, favicon and icon sprite
- Baseline History UI with bounded local aggregate snapshots, active-project association, import/export and baseline-to-baseline comparison
- Project Manager v2 history UI for recent workspace/dataset/baseline/case metadata, duplicate and archive controls
- Query Library v3 multi-select bulk operations and local usage metadata
- Stable Query Library bulk controls and Baseline History controls are authored directly in `index.html`; application boot only binds behavior and never synthesizes these permanent surfaces at runtime
- Rich Case Checkpoint diffs across case fields and bounded investigation collections
- Two-pass Trace Explorer aggregation with bounded UI windows and exact global summary counters
- Bounded Service Matrix latency retention using exact small samples and compact histograms for high-volume edges
- IndexedDB-backed local File System Access handle registry; handle keys are stripped from portable project exports
- Project Reopen UI for explicit link/load, relink, reopen and capability removal flows
- `src/platform/desktop-bridge.js` capability facade isolates future native shell integration from domain/UI code
- Sequential File System Access workspace writes and post-success recent-history recording
- Runtime dialog/focus/mobile accessibility hardening without external dependencies
- Session-bound Dedicated Worker protocol with cryptographic per-worker tokens, protocol versioning and allowlisted/bounded message envelopes
- Cross-dataset `.sdbaseline` snapshots with aggregate-only service/dependency/trace metrics; raw log entries are never embedded in baseline files
- Baseline comparison surfaces service entry/error/p95 deltas, explicit dependency call/error/p95 deltas and trace-set regressions while keeping the canonical imported datasets separate
- Bounded Case Checkpoints preserve local case state + evidence IDs for investigation waypoints without duplicating raw logs
- Metadata-only local Project Manager for naming investigations, tracking the active project, last saved workspace reference and baseline label without storing log contents in project records
- Extended local file/storage adapter with guarded text reads and File System Access open/save capability detection for future desktop/file adapters
- Desktop-style workspace with sidebar, source navigation, file tabs and right-side inspector
- JSON, JSONL, NDJSON, LOG, TXT and ZIP support
- Multi-file import and drag-and-drop
- Streaming parsing for large `.log`, `.txt`, `.jsonl` and `.ndjson` files
- Format detection for structured JSON/ECS-style fields, standard OTLP JSON exports, Docker, Apache/Nginx access logs, syslog, logfmt and multiline stack traces
- Correlation extraction for trace, span, request, correlation, job, session and user identifiers
- Smart query syntax with text, exclusion, `any:`, level/source/service/message operators, timestamps, correlation identifiers and guarded regular expressions
- Worker-side local full-text index for safely indexable queries on large datasets, with automatic semantic-preserving linear fallback
- Bucketed disk-backed IndexedDB search index: cold-start workers restore a small manifest and load only the 3-gram buckets required by the current safe query instead of rehydrating the whole token map
- Time-window filtering relative to the newest timestamp in the loaded logs
- Original / newest / oldest sorting
- Activity timeline without duplicating the full timestamped result set in memory
- Index-first filtered results to reduce memory overhead on large datasets
- Progressive rendering for 500 / 1000-row pages plus browser-native `content-visibility`/containment for offscreen table rows
- Inspector with Details, Context, Correlated, Trace, Raw and normalized JSON views
- Trace/span waterfall with parent-span hierarchy, duration bars and service/error summary
- Span flame view built only from explicit timestamp + duration span metadata; duration-less events are never fabricated into spans
- OpenTelemetry-style span-event extraction with event names, timestamps and bounded attributes shown inside the Trace inspector
- Case + Investigation workspace with status/severity, hypothesis, impact, next steps, evidence-linked findings, deterministic exception fingerprints, evidence timeline, `.sdbundle` handoff, case JSON/Markdown reports and `.sdsession`/recovery persistence
- Explicit `.sdsession` workspace save/restore for portable local analysis sessions
- IndexedDB crash/restart recovery snapshots for eligible workspaces, with user-controlled restore/dismiss/clear actions
- Chunked IndexedDB recovery format for larger resumable sessions, with 4 MB chunks and backward-compatible legacy snapshot restore
- Service map derived only from explicit trace/span parent relationships, with clickable service filters and error-aware edges
- Service-to-service latency/error matrix with explicit call counts, error rates and median/p95/max duration only where child-span duration data actually exists
- Service dependency heatmap buckets explicit parent-span edges across real timestamps so call/error concentration can be inspected through time without inventing topology
- A/B Trace Comparison for two explicit trace IDs with services, spans, errors, events, duration, average span time and parent-coverage deltas
- Distributed Trace Explorer inventory with per-trace services, span count, errors, span events, observed duration and explicit parent-link coverage
- Case Activity History persisted with the local case/workspace: status/severity changes, evidence actions and finding lifecycle events remain auditable without a remote backend
- Local Query Library for named reusable smart queries + filters, tags/descriptions and explicit JSON import/export independent of the lighter Saved Views shortcuts
- Dependency period comparison for explicit service edges with before/after calls, errors, error-rate and p95 deltas
- Robust local trace-outlier ranking from measured duration deviation, explicit errors and service breadth
- Unified Case Timeline combining evidence, milestones and case activity with evidence-to-log navigation
- Query Library search/folder filtering and inline folder management without browser prompt dialogs
- Shared local storage adapter for export/save capabilities with File System Access support when available and browser-download fallback
- Query Library schema v2 adds local folders and favorites with automatic migration from the v1 local-storage format
- Case Workspace schema v3 adds investigation milestones plus metadata-only local attachment references; attachment bytes are never embedded or uploaded
- Investigation imports now merge cross-workspace evidence with deterministic duplicate suppression instead of replacing the active evidence notebook
- Service-map grouping by service, environment, namespace, environment + service or namespace + service
- Local critical-chain analysis with explicit/partial parent-span coverage reporting
- Ctrl/Cmd+K command palette for keyboard-first workspace actions
- Reusable named custom parser-profile library with local JSON import/export
- Optional desktop Windowed table mode that limits DOM rows for very large result sets, with compressed logical scroll scaling for million-row navigation
- Built-in local performance diagnostics for parser, filter, table-render and topology timings plus long-task and heap visibility where supported
- Built-in parser profiles: Auto, NLog/text, JSON/NDJSON, Apache/Nginx access, syslog, logfmt and custom named-group regex
- Bundled parser-plugin registry with a CEF security-event parser and a CSP-safe extension API for trusted local/bundled parsers
- Environment/namespace extraction plus `env:` / `namespace:` query operators and deterministic recurring-failure filtering through `exception:` / `fingerprint:`
- Deterministic recurring-exception grouping with normalized dynamic values, representative samples and local fingerprint filtering
- OpenTelemetry resource/schema/scope metadata preserved into the Trace inspector alongside span attributes
- Observed Health matrix derived only from loaded local evidence: service error/warning rates, recurring exceptions, trace duration summaries and recent-vs-previous error deltas without uptime claims
- Exception Trends compare recent and previous local observation windows and label recurring fingerprints as spiking, rising, stable or falling without predictive/ML claims
- Trace Quality summary reports parent-link coverage, root/orphan spans, error spans, timed spans, span events, instrumentation scopes and resource sets
- Nearby-entry, related-service and correlation exploration
- Pagination with 50 / 100 / 250 / 500 / 1000 entries per page
- JSON export for normal result sets and NDJSON export for very large result sets
- Saved views stored only in local browser storage
- Optional background Web Worker filtering/correlation for large datasets when served over HTTP(S)
- Local Live Tail using the File System Access API in supported Chromium-based browsers
- Automatic main-thread fallback when opened directly with `file://`
- Local ZIP extraction with safety limits
- Content Security Policy with network connections disabled
- No analytics, telemetry, account system, backend or CDN dependency


## Production UI and UX standards

SignalDock user-facing copy avoids implementation-stage labels and internal runtime terminology. Shared CSS design tokens are defined once at the root and newer feature surfaces use semantic aliases instead of undeclared variables. Navigation remains reachable at phone widths, active navigation exposes `aria-current`, dialogs retain keyboard-focus hardening, and reduced-motion/coarse-pointer rules remain first-class.

The production regression suite checks for unresolved CSS custom properties, hidden phone navigation, release-stage labels in the interface and accidental reintroduction of implementation terminology.

- Inspector tabs use a roving-tab keyboard model with Arrow/Home/End navigation, command-palette combobox semantics are exposed to assistive technology, and dialog focus return works for both pointer and keyboard activation.
- Permanent Query Library bulk and Baseline History controls are static document structure, so accessibility relationships and control presence can be audited before JavaScript runs.

## Cross-dataset baselines and local projects

SignalDock v2.4 can capture the current all-log or filtered scope as a compact `.sdbaseline`. The file stores aggregate service metrics, explicit parent-span dependency metrics and grouped trace-set summaries only. It does **not** contain raw log records. Load a different dataset, import the baseline, then use **Baseline Compare** to inspect observed deltas. Trace-set labels such as `regressed` are deterministic threshold labels over measured p95/error-rate changes; they are not causal or statistical-significance claims.

Case Checkpoints are bounded investigation waypoints. They keep normalized Case Workspace fields plus evidence IDs and intentionally cap copied case history. They are useful for restoring case state before/after an investigation step, but they are not immutable forensic snapshots or a chain-of-custody mechanism.

The Project Manager stores small local metadata records (name, description, active project, last workspace filename and baseline label) in browser storage. Project records never contain imported log bytes or attachment content and are not account sync.

## Local full-text index

When SignalDock is served over HTTP(S) and the background worker is available, datasets above the internal threshold build a bounded local 3-gram candidate index inside `filter-worker.js`. The index accelerates queries only when doing so preserves the existing substring/query semantics.

- simple text terms of three or more supported characters can be narrowed through the 3-gram index while preserving substring matches
- exact indexed service/source/environment/namespace/correlation values can participate in candidate narrowing
- regex, exclusions, date-bound operators, unsupported substrings and other ambiguous cases automatically use the existing linear filter path
- every indexed candidate is still passed through the normal query engine before it appears in results
- the index has hard unique-token and posting-count safety caps; a truncated index is never used for filtering
- Settings diagnostics reports index state, index-key count, indexed/linear mode and candidate count

SignalDock v2.0 can also persist the most recent compatible candidate index as a **bucketed disk-backed IndexedDB cache**. A small manifest keeps the structured exact-match maps while the 3-gram postings are distributed across deterministic local buckets. On cold restore, the worker validates the dataset fingerprint and can load only the bucket(s) required by the current safe query instead of rehydrating the whole token map into memory. Final matches still pass through the canonical query engine. Regex, exclusions, date bounds and unsupported/ambiguous expressions continue to use the linear path. If IndexedDB is unavailable, the fingerprint differs, a required bucket is missing/corrupt, safety caps are exceeded or validation fails, SignalDock rebuilds/falls back normally. The cache is local, optional and user-clearable.

## Span flame view

The Trace inspector adds a compact flame-style span view above the detailed waterfall. It includes only entries that have an explicit span id, valid timestamp and explicit non-null duration. Parent-span relationships determine depth. Log events that have no duration remain available in the regular trace list but are intentionally excluded from the flame view.

## OpenTelemetry span events

Structured spans may contain OpenTelemetry-style `events`, `span.events`, `otel.events` or `otel.span.events` arrays. Standard OTLP JSON export envelopes (`resourceSpans → scopeSpans → spans`) are flattened locally into normal SignalDock trace entries before inspection. SignalDock preserves bounded span events plus OTLP resource attributes, resource schema URL, instrumentation scope name/version/schema and span attributes into trace metadata. The Trace inspector renders this Resource & Scope context separately from span events. Events remain events: they are not promoted into synthetic spans and do not affect the flame chart unless the parent span itself has explicit duration metadata.

## Investigation notebook

The **Case & Investigation** workspace lets you pin selected log entries as evidence, attach notes/tags and organize the analysis around a user-authored case. The case stores status, severity, hypothesis, impact, next steps and evidence-linked findings with open/confirmed/dismissed state. SignalDock does not silently convert logs into conclusions; case content exists only because the user writes or imports it.

Investigation remains schema v2 and still imports v1 files. Each newly pinned evidence item can retain a bounded local snapshot of its raw payload, correlations, trace metadata and environment/namespace dimensions, and exception-like evidence records receive the same deterministic failure fingerprint used by the Exceptions view. The evidence timeline can be exported as JSON, human-readable Markdown or a self-contained `.sdbundle`; v2 bundles can also carry the Case Workspace while v1 bundle import remains supported. Case and Investigation state are embedded in `.sdsession` workspaces and eligible local IndexedDB recovery snapshots. These exports are debugging/handoff artifacts, not forensic chain-of-custody guarantees.

## Exception groups

SignalDock includes a local recurring-failure analyzer. Error/fatal and exception-like entries are normalized into deterministic fingerprints derived from exception type, service, message and stack-head data. Dynamic timestamps, UUIDs, long hex identifiers, IP addresses, filesystem paths, quoted payload values and numbers are normalized before hashing so repeated instances of the same failure are grouped more reliably.

The **Exceptions** workspace shows occurrence count, severity, top service/source, first/last observation and representative samples. `exception:<fingerprint>` / `fingerprint:<fingerprint>` filters are first-class smart-query operators, and `has:exception` matches entries that received a local fingerprint. Fingerprints are debugging/grouping aids only; they are not cryptographic evidence identifiers.

## Exception trends

SignalDock v2.0 compares recurring exception groups across two adjacent local observation windows derived from the timestamps present in the loaded dataset. Groups are labeled **spiking**, **rising**, **stable** or **falling** based on recent-versus-previous occurrence counts. This is descriptive trend analysis over imported evidence, not anomaly prediction or forecasting. Trend rows continue to link back to the deterministic exception fingerprint and normal local filters.

## Observed service health

The **Observed Health** view summarizes what the currently loaded logs actually show per service: total entries, error/fatal and warning rates, recurring exception-group count, trace-duration median/p95 where explicit durations exist, recent-versus-previous error counts, source count and observed environment/namespace dimensions. Status labels such as critical/degraded/watch/quiet are evidence summaries, **not** uptime, availability, SLO or live-health guarantees. “Quiet” means only that no concerning signal was observed in the analyzed local dataset.

## Case workspace

The Case Workspace adds user-authored structure around the Investigation notebook: case status/severity, hypothesis, impact, next steps and bounded findings linked to pinned evidence. Case JSON and Markdown exports are explicit local actions. The enriched Markdown report can include an observed-dataset appendix with service concerns and spiking exception groups; those sections are derived from the loaded local dataset and are clearly separated from user-authored findings.

## Trace quality

The Trace inspector includes a local quality/completeness summary for the selected trace: span/event counts, root spans, orphan spans, parent-link coverage, error spans, timed spans, OpenTelemetry span-event count, instrumentation scopes and resource sets. These metrics help distinguish a complete trace from partial evidence before interpreting the waterfall, flame or critical-chain views.

## Parser plugin API

`src/core/parser-plugins.js` provides a small registry for trusted parsers bundled with SignalDock or added directly to a controlled local build. Plugins expose `id`, `test()` and `parse()` functions and participate only in Auto mode. Plugin failures are isolated so the normal parser chain continues.

SignalDock ships with a CEF (Common Event Format) plugin as the first concrete extension. The application does **not** dynamically load arbitrary JavaScript plugins from URLs or user-selected script files; that would undermine the CSP/local-first security model.

## Service map

The **Service map** view aggregates the current result set by service and uses explicit `span_id` / `parent_span_id` relationships to create directed dependencies. SignalDock intentionally does not infer dependencies from timing or co-occurrence alone.

The map shows:

- service entry counts
- error-bearing services and edges
- explicit cross-service parent-span calls
- unique trace counts
- aggregate duration where span duration metadata exists

Clicking a service turns the topology investigation into a normal `service:` query filter. Up to 24 services are rendered in the topology canvas at once; the underlying statistics still report the full service count.

## Local performance diagnostics

Settings now includes a local diagnostics panel. It keeps a bounded rolling window of timing samples for parsing, filtering, table rendering, correlation/trace lookup and service-map generation. Where browser support exists it also reports long tasks and JavaScript heap usage.

The **Copy support details** action exports only local performance and browser-capability information; it does not include log messages or raw log payloads.

## Chunked recovery

Recovery snapshots are stored in IndexedDB as a small manifest plus 4 MB blob chunks instead of one monolithic database record. This reduces the risk of large single-record writes and raises the automatic recovery guard to 500,000 entries / approximately 350 MB while preserving explicit restore, dismiss and clear controls. Older single-record snapshots remain readable.

## Run

No build step is required.

### Recommended

Serve the folder with a small local static server so the background worker can be used for large result sets:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

### Direct file mode

Opening `index.html` directly also works in modern browsers. SignalDock detects `file://` mode and uses its main-thread filtering fallback because browsers commonly restrict worker loading from local file origins.

## Smart query

Free text searches the message, source, service, extracted correlation identifiers and a bounded representation of the raw payload. Multiple positive terms use AND matching.

Examples:

```text
timeout worker
"invalid signature"
level:error timeout
level:error,warn service:auth
source:api-server.log request
service:"auth worker" -health
any:timeout,retry,failed
trace:4bf92f3577b34da6
job:job-77 service:worker
has:timestamp after:2026-09-12T10:00:00
before:2026-09-12T18:00:00 message:timeout
re:/ETIMEDOUT|ECONNRESET/i
message~:/token.*expired/i
```

Supported operators:

- `level:error,warn`
- `source:<text>` or `file:<text>`
- `service:<text>` or `app:<text>`
- `message:<text>` or `msg:<text>`
- `any:<term1,term2,...>` — OR matching across the searchable entry text
- `trace:`, `span:`, `request:`, `correlation:`, `job:`, `session:` and `user:`
- `after:<date-or-timestamp>` / `since:<date-or-timestamp>`
- `before:<date-or-timestamp>`
- `has:timestamp`, `has:service`, `has:source`, `has:message`, `has:level` and correlation fields such as `has:trace`
- `re:/pattern/i` — regex across searchable entry text
- `message~:/pattern/i`, `service~:/pattern/i`, `source~:/pattern/i`
- `-term` excludes matching entries
- quoted phrases preserve spaces

Regex patterns are capped at 256 characters, unsupported flags are rejected, and obvious nested-quantifier patterns are blocked before execution. Regex processing stays local.

Dropdown filters and query operators can be combined.

## Correlation analysis

SignalDock extracts commonly used identifiers from structured and plain-text logs:

```text
trace.id / trace_id / traceId
span.id / span_id / spanId
request.id / request_id / requestId
correlation.id / correlation_id / correlationId
job.id / job_id / jobId
session.id / session_id / sessionId
user.id / user_id / userId
```

The **Correlated** inspector tab searches for entries sharing at least one detected identifier. On large datasets the search can run in the existing background worker. Clicking an identifier turns it into a smart-query filter. SignalDock also summarizes how many related entries matched each detected identifier, so mixed trace/job/request clusters are easier to understand.

## Trace waterfall

When a selected entry contains a trace ID, the **Trace** inspector view groups entries sharing that trace and renders a local waterfall. SignalDock uses:

- `trace.id` / `trace_id` / `traceId`
- `span.id` / `span_id` / `spanId`
- parent-span fields such as `parent_span_id` and `parentSpanId`
- span names / operation names when present
- `duration_ms`, `durationMs`, `span.duration_ms`, or OpenTelemetry `event.duration`

OpenTelemetry `event.duration` is interpreted as nanoseconds and converted to milliseconds. Trace lookup can run in the background worker on large datasets. The visualizer stays entirely local and uses SVG geometry rather than external chart libraries. It also summarizes the busiest services in the trace, error counts and aggregate duration; service summaries can be clicked to turn the trace investigation into a service filter.

## Critical-chain trace analysis

The Trace inspector now adds a critical-chain summary when timestamped span data is available. SignalDock follows explicit `span_id` / `parent_span_id` relationships and chooses the parent branch whose descendants finish latest. It reports:

- trace wall-clock latency
- number of spans on the selected chain
- parent-link coverage
- longest measured span on the chain
- whether the result is based on a complete or partial loaded span tree

When parent spans referenced by loaded entries are missing, SignalDock marks the result as partial. It does not invent missing ancestry.

## Windowed table mode

Paged mode remains the default. On desktop-sized layouts with wrapped messages disabled, the result footer can switch to **Windowed** mode. SignalDock then renders only the visible row range plus overscan while preserving the full result scroll range. This reduces DOM pressure when inspecting very large filtered sets. Narrow/mobile layouts and wrapped-message mode automatically use the paged renderer.

## Command palette

Press **Ctrl/Cmd+K** to open the local command palette. It provides keyboard access to import, search, topology, workspace save, export, saved views, reset, table mode, Live Tail, Settings and clearing the active workspace. Command filtering is performed locally and does not contact a service.

## Saved parser profiles

Custom regex parser definitions can now be saved as named local profiles. Profiles can be updated, deleted and exported/imported as a small SignalDock JSON profile bundle. The active profile still goes through the same regex-length, flag and validity checks used by the one-off custom parser. Portable `.sdsession` workspaces continue to store the active regex itself so a session remains self-contained.

## Environment and namespace dimensions

SignalDock recognizes common environment and namespace fields such as `deployment.environment.name`, `environment`, `env`, `service.namespace`, `namespace` and Kubernetes namespace keys. These can be queried directly:

```text
env:production namespace:checkout
environment:staging service:api
ns:payments level:error
```

The Service Map can group explicit parent-span dependencies by these dimensions without inferring new edges.

## Workspace sessions

Use the bookmark button in the file strip or **Ctrl/Cmd + Shift + S** to save the current analysis as a `.sdsession` file. Re-open it through **Import logs** or drag-and-drop.

A workspace stores the normalized entries plus the current query, filters, sort mode, page size, selected entry, inspector tab and workspace-specific UI settings. It does not contact a server. Workspace files are validated against a SignalDock schema and have a 500 MB file safety limit plus a 2,000,000-entry restore limit.

## Parser profiles

The default **Auto detect** mode remains recommended. In Settings, a fixed profile can be selected for homogeneous datasets:

- NLog / level text
- JSON / NDJSON
- Apache / Nginx access
- Syslog
- Logfmt
- Custom regex profile

The custom profile accepts a bounded JavaScript regular expression with named groups such as `time`, `level`, `service` and `message`. Example:

```text
^(?<time>\S+)\s+\|\s+(?<level>\w+)\s+\|\s+(?<service>[^|]+?)\s+\|\s+(?<message>.*)$
```

Unmatched lines remain visible as plain text. Invalid custom expressions are rejected before import. The selected profile and custom expression are used for new imports and Live Tail parsing and are preserved in `.sdsession` workspaces.

## Local recovery autosave

When enabled, SignalDock can save a best-effort crash/restart recovery snapshot in the browser's IndexedDB. This is separate from portable `.sdsession` files and is never synchronized to a server.

- recovery is offered on the next launch instead of being restored silently
- the latest view/filter/selection state is stored separately from the larger dataset snapshot
- autosave is limited to 500,000 entries and an estimated/actual 350 MB snapshot safety threshold
- dataset snapshots are split into 4 MB IndexedDB chunks behind a small manifest instead of one monolithic record
- Settings shows whether the current workspace is eligible and the estimated snapshot size
- the recovery copy can be dismissed or permanently cleared by the user
- clearing all loaded logs also clears the local recovery snapshot

IndexedDB may be unavailable in some private/restricted browser contexts; SignalDock treats recovery as optional and never blocks ordinary log inspection when it is unavailable.

## Live Tail (experimental)

The **Live tail** navigation action can follow a local `.log`, `.txt`, `.jsonl` or `.ndjson` file as it grows when the browser exposes the File System Access API.

- no socket connection is opened
- the selected file stays on the local machine
- appended content is read through the file handle granted by the user
- unsupported browsers show a clear fallback message
- clicking Live tail again stops polling

This is browser-level live tail groundwork; native filesystem watchers are reserved for a future desktop package.

## Time filtering

The Last 15 minutes / 1 hour / 6 hours / 24 hours / 7 days filters are calculated relative to the **newest valid timestamp found in the loaded logs**, not the current system clock. This keeps archived log analysis predictable.

## Large-dataset behavior

SignalDock keeps filtered results as integer indexes rather than creating a second array of log-entry references. The timeline also iterates those indexes directly instead of first building a duplicate timestamped-results array.

For larger page sizes, table rows are appended in animation-frame batches so the UI remains responsive while a 500/1000-row page is drawn. Table rows also use browser-native layout/paint containment and `content-visibility` so offscreen rows can be skipped by supporting rendering engines. Windowed mode delegates row-range calculation to `src/core/virtual-viewport.js`; once the logical document would exceed a browser-friendly scroll range, SignalDock compresses only the invisible scroll pitch while keeping rendered rows at normal physical height. Filtering can move into `filter-worker.js` above the internal threshold when the application is served from HTTP(S), where the worker can additionally use the bounded local full-text index.

For exports above 50,000 rows, SignalDock produces NDJSON in chunks instead of a pretty-printed JSON array to reduce transient serialization overhead.

## Parser behavior

SignalDock recognizes common structured-field variations including nested keys such as:

```text
log.level
service.name
resource.service.name
@timestamp
event.created
error.message
exception.message
```

It also recognizes several common text formats and groups typical multiline stack-trace continuation lines into the preceding event.

Large line-oriented files are read as a stream once they cross the internal streaming threshold, reducing the temporary memory spike caused by reading the whole file as one giant string. Search indexing also avoids duplicating a plain-text raw line when it is already the displayed message and bounds raw structured search text per entry.

## Privacy model

SignalDock does not send log data anywhere. The shipped application uses no external scripts, styles, fonts, APIs, analytics or CDN resources.

The application CSP explicitly sets:

```text
connect-src 'none'
```

Saved views and UI preferences use `localStorage`; they contain filter/settings metadata, not imported log-file contents. Optional crash recovery uses IndexedDB and can contain normalized local log entries; it is bounded, user-clearable and remains inside the current browser profile.

## ZIP safety limits

To reduce the risk of malicious or accidental ZIP bombs:

- maximum 500 ZIP entries
- maximum 100 MB uncompressed per entry
- maximum 250 MB total uncompressed data
- encrypted ZIP entries are rejected
- Store and DEFLATE methods are supported

Plain non-ZIP files have a 750 MB safety limit.

## Project structure

```text
SignalDock/
├── index.html
├── styles.css
├── app.js
├── src/core/parser.js
├── src/core/parser-plugins.js
├── src/core/query-engine.js
├── src/core/search-index.js
├── src/core/search-cache.js
├── filter-worker.js
├── src/analysis/trace-analysis.js
├── src/analysis/trace-flame.js
├── src/analysis/span-events.js
├── src/core/virtual-viewport.js
├── src/analysis/service-map.js
├── src/analysis/service-matrix.js
├── src/analysis/service-heatmap.js
├── src/analysis/service-trends.js
├── src/investigation/baseline-manager.js
├── src/analysis/trace-regression.js
├── src/analysis/trace-explorer.js
├── src/analysis/trace-compare.js
├── src/analysis/trace-outliers.js
├── src/core/query-library.js
├── src/investigation/case-timeline.js
├── src/platform/storage-adapter.js
├── src/ui/command-palette.js
├── src/analysis/exception-groups.js
├── src/investigation/investigation.js
├── src/investigation/case-workspace.js
├── src/investigation/case-checkpoints.js
├── src/investigation/project-manager.js
├── src/analysis/service-health.js
├── src/analysis/exception-trends.js
├── src/analysis/trace-insights.js
├── src/core/parser-profiles.js
├── src/core/workspace.js
├── src/core/persistence.js
├── src/core/performance.js
├── src/core/utils.js
├── src/vendor/zip.js
├── assets/
│   ├── logo.svg
│   ├── favicon.svg
│   └── icons.svg
├── website/
│   ├── index.html
│   └── styles.css
├── sample/
│   ├── signal-demo.log
│   ├── signal-demo.ndjson
│   ├── signal-security.log
│   └── otel-export.json
├── tests/
│   ├── fixtures/
│   ├── smoke.mjs
│   ├── baseline-manager-smoke.mjs
│   ├── case-checkpoints-smoke.mjs
│   ├── project-manager-smoke.mjs
│   ├── worker-smoke.mjs
│   ├── workspace-smoke.mjs
│   ├── persistence-smoke.mjs
│   ├── persistence-integration.mjs
│   ├── service-map-smoke.mjs
│   ├── service-matrix-smoke.mjs
│   ├── service-heatmap-smoke.mjs
│   ├── service-trends-smoke.mjs
│   ├── trace-explorer-smoke.mjs
│   ├── trace-compare-smoke.mjs
│   ├── trace-outliers-smoke.mjs
│   ├── query-library-smoke.mjs
│   ├── case-timeline-smoke.mjs
│   ├── storage-adapter-smoke.mjs
│   ├── case-workspace-smoke.mjs
│   ├── investigation-merge-smoke.mjs
│   ├── trace-analysis-smoke.mjs
│   ├── trace-flame-smoke.mjs
│   ├── span-events-smoke.mjs
│   ├── otel-context-smoke.mjs
│   ├── exception-groups-smoke.mjs
│   ├── investigation-smoke.mjs
│   ├── search-index-smoke.mjs
│   ├── search-cache-smoke.mjs
│   ├── worker-indexed-smoke.mjs
│   ├── worker-cache-smoke.mjs
│   ├── virtual-viewport-smoke.mjs
│   ├── parser-plugins-smoke.mjs
│   ├── parser-profiles-smoke.mjs
│   ├── command-palette-smoke.mjs
│   ├── performance-smoke.mjs
│   └── static-audit.mjs
├── BRAND.md
├── CHANGELOG.md
├── LICENSE
└── VERSION
```

## Smoke tests

Node.js 22+ can run the automated checks:

```bash
node tests/smoke.mjs
node tests/baseline-manager-smoke.mjs
node tests/case-checkpoints-smoke.mjs
node tests/project-manager-smoke.mjs
node tests/worker-smoke.mjs
node tests/workspace-smoke.mjs
node tests/persistence-smoke.mjs
node tests/persistence-integration.mjs
node tests/service-map-smoke.mjs
node tests/service-matrix-smoke.mjs
node tests/service-heatmap-smoke.mjs
node tests/service-trends-smoke.mjs
node tests/trace-explorer-smoke.mjs
node tests/trace-compare-smoke.mjs
node tests/trace-outliers-smoke.mjs
node tests/query-library-smoke.mjs
node tests/case-timeline-smoke.mjs
node tests/storage-adapter-smoke.mjs
node tests/case-workspace-smoke.mjs
node tests/investigation-merge-smoke.mjs
node tests/trace-analysis-smoke.mjs
node tests/trace-flame-smoke.mjs
node tests/span-events-smoke.mjs
node tests/otel-context-smoke.mjs
node tests/exception-groups-smoke.mjs
node tests/investigation-smoke.mjs
node tests/search-index-smoke.mjs
node tests/search-cache-smoke.mjs
node tests/worker-indexed-smoke.mjs
node tests/worker-cache-smoke.mjs
node tests/virtual-viewport-smoke.mjs
node tests/parser-plugins-smoke.mjs
node tests/parser-profiles-smoke.mjs
node tests/command-palette-smoke.mjs
node tests/performance-smoke.mjs
node tests/static-audit.mjs
```

Coverage includes Case Workspace v3 milestones/attachment metadata/v1-v2 migration, unified case-timeline aggregation, service-to-service matrix, dependency-heatmap and dependency-period trend aggregation, distributed Trace Explorer summaries, trace comparison and robust trace-outlier ranking, Query Library v2 folders/favorites/search/folder-management/migration, Investigation evidence merge round-trips, structured ECS-like JSON, Docker, Apache access logs, syslog, logfmt, CEF security events, multiline stack traces, fixed/reusable custom parser profiles, the parser-plugin registry, environment/namespace metadata, trace/span/parent-span metadata, critical-chain and flame-layout honesty guards, smart queries, bounded full-text candidate indexing, bucketed disk-backed search-cache restore and selective-bucket candidate lookup, million-row viewport calculations, OpenTelemetry span-event/resource-scope normalization, Case/Investigation v2/evidence-bundle round-trips, exception-trend and observed-health analysis, exception fingerprint grouping/querying, correlation extraction/matching, command-palette ranking, regex guards, large streaming parsing/filtering, ZIP parsing, worker linear/indexed filtering plus correlation/trace protocol, grouped explicit service-map dependencies, workspace serialization/schema validation, chunked IndexedDB recovery, performance metrics, DOM-reference integrity, local asset integrity, legacy-brand checks, and checks against inline/external runtime code.

## Brand and marketing page

`BRAND.md` documents the SignalDock identity and UI rules. `website/index.html` is the static product landing page built from the same design system and links to the local application. It intentionally does not claim native installers that do not exist yet.

## Next development targets

Useful next stages include native Windows/macOS/Linux packaging, OS-native filesystem live tail, multi-segment disk-backed query execution beyond the current cache-restore layer, cross-workspace investigation merge tooling, richer exception trend charts, and deeper multi-process desktop ingestion without weakening SignalDock’s local-only privacy model.

## v2.1 investigation + trace workflow

SignalDock v2.1 adds a persistent **Case Activity History** to the existing Case Workspace. Discrete case status/severity changes, finding lifecycle operations and evidence pin/remove/import/clear actions are appended as bounded local events and survive case JSON, `.sdsession` and eligible recovery round-trips. The Markdown case report can include this chronological activity history. This is a debugging audit trail for the local workspace, not a cryptographic or forensic chain-of-custody guarantee.

The **Service Matrix** complements the visual Service Map with explicit edge statistics: source service, target service, call count, observed error rate, trace count and median/p95/max child-span duration where duration metadata actually exists. Cross-service rows are created only when a child span references an explicit parent span owned by another named service.

The **Distributed Trace Explorer** provides a dataset-level trace inventory using explicit trace IDs. Each trace summary includes service count, unique spans, errors, span events, observed start/end duration and parent-link coverage. Opening a trace routes back to the existing Trace inspector so waterfall, flame, critical-chain and resource/scope context remain a single consistent analysis path.

The **Query Library** stores reusable named query/filter combinations locally with optional descriptions and tags. It supports explicit JSON export/import and does not sync to a backend. Existing Saved Views remain available as lightweight shortcuts in the sidebar.
## v2.3 investigation + trend workflow

SignalDock v2.3 adds **Dependency Trends**, a descriptive comparison of explicit service-to-service parent-span edges across two adjacent timestamp windows. It can show new/disappeared/rising/falling/degrading/improving edges and before/after call, error and p95 changes. It does not forecast future behavior and does not synthesize missing dependency edges.

The new **Trace Outliers** workspace ranks traces locally from measured duration deviation, explicit error count and service breadth. Rankings include their reasons and are navigation aids, not automated root-cause or regression claims.

The **Case Timeline** combines timestamped pinned evidence, investigation milestones and case activity into one chronological view while preserving the existing focused evidence/activity views. Evidence timeline rows can navigate back to their original local log entry when that entry is still present in the workspace.

Query Library adds local search, folder filtering, inline folder rename/move management and per-query folder selectors. `src/platform/storage-adapter.js` centralizes local export capability detection and uses the browser File System Access save picker where supported, with a normal local download fallback. Neither path uploads content.

## v2.2 investigation + comparison workflow

SignalDock v2.2 adds a **Service Dependency Heatmap** alongside the existing Service Map and Service Matrix. Heatmap rows are built only from explicit child→parent span relationships and bucketed only when real timestamps exist. Cell intensity represents observed call volume; error-bearing buckets are marked separately. The view does not synthesize missing edges, timings or timestamps.

The **Trace Comparison** workflow allows exactly two explicit trace IDs from the Trace Explorer to be compared side-by-side. SignalDock reports measured differences in entry/span/service counts, errors, warnings, span events, observed trace duration, average timed-span duration and parent-link coverage. Service-set differences are shown explicitly so comparison remains descriptive rather than diagnostic inference.

**Query Library v2** adds folders and favorites while preserving named query/filter payloads, tags, descriptions and local JSON import/export. Existing v1 browser state and exported v1 library files are migrated into the v2 model with the default `General` folder.

**Case Workspace v3** adds bounded milestones and metadata-only local attachment references. A reference stores filename, MIME type, byte size, local last-modified timestamp and an optional user note; SignalDock never reads or embeds attachment file bytes through this feature. Investigation JSON/`.sdbundle` imports now merge evidence into the current notebook and skip deterministic duplicates, and imported case payloads are merged into the active case instead of blindly replacing it.

