# SignalDock Brand System

## Core identity

**Name:** SignalDock  
**Positioning:** Private observability on your machine.  
**Primary idea:** logs dock locally, stay under the developer's control, and become easier to inspect without a cloud ingestion pipeline.

## Messaging hierarchy

Primary headline:

> Private observability on your machine.

Supporting statements:

- Your logs. Your machine. Your control.
- Observe locally. Build freely.
- Logs tell the real story. Yours should stay yours.
- No cloud required. No data leaves your machine.

Avoid claims about native desktop installers, remote infrastructure ingestion, alert delivery, remote trace ingestion or cloud tracing until those features actually ship. SignalDock may describe local file follow mode as experimental Live Tail and may describe the shipped Trace view as a local trace/span waterfall for identifiers already present in imported logs.

## Logo

The SignalDock mark uses three geometric layers:

1. an upper diamond representing a signal/data surface,
2. stacked lower rails representing a dock or local data layers,
3. a central vertical anchor representing local control.

The mark should remain geometric and technical. Do not introduce mascots, frogs or cartoon styling.

## Color tokens

| Token | Hex | Usage |
|---|---|---|
| Midnight Navy | `#08111D` | Main app background |
| Deep Navy | `#050B13` | Deep background / overlays |
| Graphite | `#0D1724` | Panels |
| Slate | `#132235` | Elevated surfaces |
| Border | `#213248` | Borders / separators |
| Cyan | `#15D8F2` | Primary accent / focus |
| Blue | `#2A8CFF` | Gradient support |
| Emerald | `#10B981` | Local/private/success states |
| Amber | `#F59E0B` | Warning |
| Red | `#EF4444` | Error / fatal |
| Violet | `#8B5CF6` | Trace |
| Text | `#EDF5FB` | Primary text |
| Muted | `#91A4BA` | Secondary text |

## Typography

SignalDock uses system fonts in the shipped browser app to avoid remote font requests.

Preferred visual system:

- UI / headings: Inter when bundled locally; otherwise system sans-serif.
- Logs / code: JetBrains Mono when bundled locally; otherwise system monospace.

No Google Fonts or remote font CDN should be required.

## UI principles

- Dense enough for professional log work, but not terminal-hostile.
- Cyan communicates active focus and navigation.
- Emerald is reserved for local/private/success assurances.
- Severity colors remain conventional and readable.
- Raw logs use monospace typography.
- Inspector context stays visible beside the log table on desktop.
- Mobile uses a bottom inspector sheet rather than squeezing the desktop layout.
- Imported log contents must always be rendered as text, never injected HTML.


## Analysis language

- Use **Correlated** for locally matched trace/request/job/session/user identifiers; do not imply a remote tracing backend.
- Use **Live Tail (experimental)** only for explicitly selected local files followed through supported browser filesystem APIs.
- Large-dataset messaging should emphasize index-first results, streaming parsing, progressive rendering and optional local workers rather than claiming unlimited file sizes.
- `.sdsession` is a portable local workspace format, not an account sync or cloud backup feature.
- Parser profiles are deterministic local import modes; do not market them as AI format detection.

## Recovery and parser language

- Describe IndexedDB recovery as **local recovery** or **crash/restart recovery**, never cloud backup or sync.
- Recovery is optional, bounded and user-clearable; imported content may be present in the local recovery snapshot when autosave is enabled.
- Custom parser profiles are deterministic regular expressions with named groups; do not describe them as AI parsing or learned schemas.
- Trace service summaries are local navigation aids over imported trace metadata, not a distributed tracing backend or service topology collector.

## Service topology

SignalDock topology views use the existing cyan/emerald interaction language. Error-bearing services or dependencies may use the established red critical-state token, but the map should stay analytical rather than decorative. Dependency lines must represent explicit parent-span evidence; do not visually imply relationships that SignalDock did not detect.

## Diagnostics language

Performance diagnostics are described as local runtime diagnostics, never telemetry. Copyable diagnostics must exclude imported log message/raw payload content by default.

## Product interaction principles

SignalDock v2.3 reinforces the following interaction rules:

- **Fast without pretending:** indexed search is used only where it preserves query semantics; fallbacks are explicit.
- **Keyboard first, not keyboard only:** Ctrl/Cmd+K accelerates common actions while every command remains available in the visible UI.
- **Evidence before inference:** critical-chain and topology views use explicit imported trace/span relationships and label incomplete evidence.
- **Observed is not guaranteed:** Observed Health summarizes loaded evidence; never present it as uptime, availability, SLO compliance or live monitoring.
- **Trends are descriptive:** spiking/rising/stable/falling exception labels compare local observation windows and are not forecasts or anomaly-model outputs.
- **Dense data, bounded DOM:** the optional Windowed table mode reduces visible DOM weight without changing the underlying local result set.
- **Disk acceleration stays semantic:** bucketed local index reads may reduce candidate work, but the canonical query engine remains the final authority.
- **Reusable local configuration:** parser-profile libraries stay in the browser or user-exported JSON rather than requiring accounts or remote configuration storage.
- **Cases are user-authored:** hypotheses, impact, findings and status exist only because the user writes/imports them; SignalDock never silently creates incident conclusions.
- **Events stay events:** OpenTelemetry span events are displayed as evidence attached to spans and are never stylized as fabricated duration-bearing spans.
- **Fingerprints are debugging aids:** exception fingerprints group normalized recurring failures; do not describe them as cryptographic or legal evidence identifiers.
- **Portable evidence is explicit:** `.sdbundle`, case JSON and Markdown reports exist only when the user exports them; local evidence is never uploaded automatically.

## Search-cache language

The v2.0 IndexedDB search cache is described as a **bucketed local disk-backed candidate index**, never cloud indexing or synchronization. It keeps at most the active/most-recent compatible dataset cache, stores 3-gram postings in deterministic bounded local buckets, validates the dataset fingerprint and can load only query-relevant buckets on cold restore. It is optional and user-clearable. Search results still pass through the canonical query engine; unsafe/unsupported expressions use linear filtering.

## Investigation language

Use **Case Workspace**, **Investigation**, **evidence**, **findings**, **hypothesis**, **notes**, **tags** and **evidence bundle**. Case fields are user-authored local working material. Do not imply automated incident conclusions, AI diagnosis or legal/forensic chain-of-custody guarantees. Markdown/JSON/`.sdbundle` exports are user-triggered local handoff artifacts.

Use **Observed Health** for the service evidence matrix. Never shorten it to claims such as “healthy service”, “uptime” or “availability” unless those facts are explicitly present in imported telemetry. “Quiet” means no concerning signal was observed in the selected local dataset.

Use **Exception groups**, **fingerprints** and **Exception Trends** for recurring-failure analysis. Describe fingerprints as deterministic normalized grouping keys, not security hashes, signatures, identities or forensic proof. Describe spiking/rising/stable/falling only as recent-vs-previous local observation comparisons, never predictions.

### v2.1 product language

Use **Case Activity History** for the bounded chronological record of local workspace actions. It is an operational debugging audit trail, not a cryptographic or forensic chain-of-custody guarantee.

Use **Service Matrix** for explicit service-to-service edge statistics derived from real parent-span relationships. Never label an edge as latency/SLA data when duration metadata is absent; untimed edges should remain untimed.

Use **Trace Explorer** for dataset-level trace inventory. Parent-link coverage must remain visible so incomplete traces are not presented as complete distributed traces.

Use **Query Library** for reusable local queries and filter presets with explicit import/export. Do not imply account sync, shared cloud libraries or collaboration unless those capabilities actually exist.

### v2.2 product language

Use **Dependency Heatmap** only for timestamped explicit parent-span edges. Cell intensity represents observed calls; do not imply throughput or service health beyond the imported dataset.

Use **Trace Comparison** for descriptive A/B inspection of two imported trace IDs. Positive/negative metric deltas are measurements, not automatic regression or root-cause conclusions.

Case **attachment references** are metadata-only local references. Never imply that SignalDock copied, embedded, uploaded or preserved the referenced file contents.

### v2.3 product language

Use **Dependency Trends** for descriptive before/after comparisons over two adjacent observation periods from the loaded dataset. Labels such as rising, falling, degrading or improving describe only those windows; they are not forecasts.

Use **Trace Outliers** for robust local ranking based on measured duration deviation, explicit errors and service breadth. Never call the ranking AI anomaly detection, automated root-cause analysis or proof of regression.

Use **Case Timeline** for the merged chronological view of user-authored case activity, milestones and pinned evidence. It is a debugging workflow timeline, not a forensic audit ledger.

Use **local storage adapter** for browser file-save/download capabilities. It is an implementation abstraction for user-triggered local reads/exports, not cloud storage or sync.


## v2.4 analysis language

- **Baseline Compare** means comparing compact aggregate observations from two explicitly chosen local datasets. Do not call the result a statistically proven regression or root cause.
- A **trace regression set** is a deterministic service-set grouping whose measured p95/error-rate crossed documented thresholds; it is not an ML anomaly or causal diagnosis.
- A **Case Checkpoint** is a bounded local investigation waypoint. Do not describe it as immutable evidence, source-control history or forensic chain of custody.
- **Projects** are metadata-only local organizers. Do not imply cloud projects, team sync, remote workspaces or storage of imported log contents.
- `.sdbaseline` files contain aggregate metrics only and should be described as portable local comparison summaries, not sanitized copies of the source logs.
