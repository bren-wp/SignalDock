(function (root) {
  "use strict";

  const SCHEMA = "signaldock.case";
  const VERSION = 3;
  const LEGACY_VERSIONS = new Set([1, 2, 3]);
  const MAX_ACTIVITY = 3000;
  const MAX_FINDINGS = 500;
  const MAX_MILESTONES = 200;
  const MAX_ATTACHMENTS = 200;
  const MAX_EVIDENCE_LINKS = 128;
  const STATUSES = ["open", "investigating", "monitoring", "resolved"];
  const SEVERITIES = ["none", "sev4", "sev3", "sev2", "sev1"];

  function clean(value, max = 4000) {
    return String(value ?? "").trim().slice(0, max);
  }

  function cleanTags(input) {
    const source = Array.isArray(input) ? input : String(input || "").split(/[;,]/);
    const out = [];
    const seen = new Set();
    for (const value of source) {
      const tag = clean(value, 48).toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}._:@/-]/gu, "");
      if (!tag || seen.has(tag)) continue;
      seen.add(tag); out.push(tag);
      if (out.length >= 24) break;
    }
    return out;
  }

  function cleanEvidenceIds(input) {
    const source = Array.isArray(input) ? input : [];
    const out = [];
    const seen = new Set();
    for (const value of source) {
      const id = clean(value, 96);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= MAX_EVIDENCE_LINKS) break;
    }
    return out;
  }

  function empty(title = "Local investigation") {
    const now = new Date().toISOString();
    return {
      schema: SCHEMA,
      version: VERSION,
      id: `case-${Date.now().toString(36)}`,
      title: clean(title, 120) || "Local investigation",
      status: "open",
      severity: "none",
      summary: "",
      hypothesis: "",
      impact: "",
      nextSteps: "",
      createdAt: now,
      updatedAt: now,
      findings: [],
      milestones: [],
      attachments: [],
      activity: [{ id: `activity-${Date.now().toString(36)}`, type: "case.created", label: "Case created", detail: "", at: now, findingId: "", evidenceId: "" }]
    };
  }


  function normalizeActivity(input, index = 0) {
    const src = input && typeof input === "object" ? input : {};
    return {
      id: clean(src.id || `activity-${index + 1}`, 96),
      type: clean(src.type || "case.note", 64),
      label: clean(src.label || src.type || "Case activity", 180),
      detail: clean(src.detail || "", 4000),
      at: clean(src.at || new Date().toISOString(), 64),
      findingId: clean(src.findingId || "", 96),
      evidenceId: clean(src.evidenceId || "", 96)
    };
  }

  function appendActivity(caseFile, type, options = {}) {
    const target = normalize(caseFile);
    const event = normalizeActivity({
      id: `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      label: options.label || type,
      detail: options.detail || "",
      at: options.at || new Date().toISOString(),
      findingId: options.findingId || "",
      evidenceId: options.evidenceId || ""
    }, target.activity.length);
    target.activity.push(event);
    if (target.activity.length > MAX_ACTIVITY) target.activity = target.activity.slice(-MAX_ACTIVITY);
    target.updatedAt = event.at;
    return target;
  }

  function normalizeMilestone(input, index = 0) {
    const src = input && typeof input === "object" ? input : {};
    return {
      id: clean(src.id || `milestone-${index + 1}`, 96),
      title: clean(src.title || `Milestone ${index + 1}`, 180),
      note: clean(src.note || "", 4000),
      status: ["planned", "reached", "blocked"].includes(src.status) ? src.status : "planned",
      at: clean(src.at || new Date().toISOString(), 64),
      createdAt: clean(src.createdAt || new Date().toISOString(), 64)
    };
  }

  function normalizeAttachment(input, index = 0) {
    const src = input && typeof input === "object" ? input : {};
    return {
      id: clean(src.id || `attachment-${index + 1}`, 96),
      name: clean(src.name || `Attachment ${index + 1}`, 240),
      type: clean(src.type || "application/octet-stream", 160),
      size: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Number(src.size) || 0)),
      lastModified: Math.max(0, Number(src.lastModified) || 0),
      note: clean(src.note || "", 2000),
      addedAt: clean(src.addedAt || new Date().toISOString(), 64),
      metadataOnly: true
    };
  }

  function normalizeFinding(input, index = 0) {
    const src = input && typeof input === "object" ? input : {};
    return {
      id: clean(src.id || `finding-${index + 1}`, 96),
      title: clean(src.title || `Finding ${index + 1}`, 180),
      body: clean(src.body || "", 12000),
      state: ["open", "confirmed", "dismissed"].includes(src.state) ? src.state : "open",
      tags: cleanTags(src.tags || []),
      evidenceIds: cleanEvidenceIds(src.evidenceIds),
      createdAt: clean(src.createdAt || new Date().toISOString(), 64),
      updatedAt: clean(src.updatedAt || new Date().toISOString(), 64)
    };
  }

  function normalize(input) {
    const src = input && typeof input === "object" ? input : {};
    const base = empty(src.title || "Local investigation");
    return {
      schema: SCHEMA,
      version: VERSION,
      id: clean(src.id || base.id, 96),
      title: clean(src.title || base.title, 120) || base.title,
      status: STATUSES.includes(src.status) ? src.status : "open",
      severity: SEVERITIES.includes(src.severity) ? src.severity : "none",
      summary: clean(src.summary || "", 6000),
      hypothesis: clean(src.hypothesis || "", 8000),
      impact: clean(src.impact || "", 8000),
      nextSteps: clean(src.nextSteps || "", 8000),
      createdAt: clean(src.createdAt || base.createdAt, 64),
      updatedAt: clean(src.updatedAt || base.updatedAt, 64),
      findings: (Array.isArray(src.findings) ? src.findings : []).slice(0, MAX_FINDINGS).map(normalizeFinding),
      milestones: (Array.isArray(src.milestones) ? src.milestones : []).slice(0, MAX_MILESTONES).map(normalizeMilestone),
      attachments: (Array.isArray(src.attachments) ? src.attachments : []).slice(0, MAX_ATTACHMENTS).map(normalizeAttachment),
      activity: (Array.isArray(src.activity) ? src.activity : []).slice(-MAX_ACTIVITY).map(normalizeActivity)
    };
  }

  function updateMeta(caseFile, patch = {}) {
    const target = normalize(caseFile);
    ["title", "summary", "hypothesis", "impact", "nextSteps"].forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
      const max = key === "title" ? 120 : key === "summary" ? 6000 : 8000;
      target[key] = clean(patch[key], max);
    });
    if (Object.prototype.hasOwnProperty.call(patch, "status") && STATUSES.includes(patch.status)) target.status = patch.status;
    if (Object.prototype.hasOwnProperty.call(patch, "severity") && SEVERITIES.includes(patch.severity)) target.severity = patch.severity;
    target.updatedAt = new Date().toISOString();
    return target;
  }

  function addFinding(caseFile, patch = {}) {
    const target = normalize(caseFile);
    if (target.findings.length >= MAX_FINDINGS) throw new Error(`Case is limited to ${MAX_FINDINGS} findings.`);
    const now = new Date().toISOString();
    const finding = normalizeFinding({
      id: `finding-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: patch.title || `Finding ${target.findings.length + 1}`,
      body: patch.body || "",
      state: patch.state || "open",
      tags: patch.tags || [],
      evidenceIds: patch.evidenceIds || [],
      createdAt: now,
      updatedAt: now
    }, target.findings.length);
    target.findings.push(finding);
    target.updatedAt = now;
    return { caseFile: target, finding };
  }

  function updateFinding(caseFile, id, patch = {}) {
    const target = normalize(caseFile);
    const finding = target.findings.find((item) => item.id === id);
    if (!finding) return target;
    if (Object.prototype.hasOwnProperty.call(patch, "title")) finding.title = clean(patch.title, 180);
    if (Object.prototype.hasOwnProperty.call(patch, "body")) finding.body = clean(patch.body, 12000);
    if (Object.prototype.hasOwnProperty.call(patch, "state") && ["open", "confirmed", "dismissed"].includes(patch.state)) finding.state = patch.state;
    if (Object.prototype.hasOwnProperty.call(patch, "tags")) finding.tags = cleanTags(patch.tags);
    if (Object.prototype.hasOwnProperty.call(patch, "evidenceIds")) finding.evidenceIds = cleanEvidenceIds(patch.evidenceIds);
    finding.updatedAt = new Date().toISOString();
    target.updatedAt = finding.updatedAt;
    return target;
  }

  function removeFinding(caseFile, id) {
    const target = normalize(caseFile);
    target.findings = target.findings.filter((item) => item.id !== id);
    target.updatedAt = new Date().toISOString();
    return target;
  }

  function addMilestone(caseFile, patch = {}) {
    const target = normalize(caseFile);
    if (target.milestones.length >= MAX_MILESTONES) throw new Error(`Case is limited to ${MAX_MILESTONES} milestones.`);
    const milestone = normalizeMilestone({ ...patch, id: `milestone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString() }, target.milestones.length);
    target.milestones.push(milestone); target.updatedAt = new Date().toISOString();
    return { caseFile: target, milestone };
  }

  function updateMilestone(caseFile, id, patch = {}) {
    const target = normalize(caseFile); const item = target.milestones.find((value) => value.id === id); if (!item) return target;
    if (Object.prototype.hasOwnProperty.call(patch, "title")) item.title = clean(patch.title, 180);
    if (Object.prototype.hasOwnProperty.call(patch, "note")) item.note = clean(patch.note, 4000);
    if (Object.prototype.hasOwnProperty.call(patch, "status") && ["planned", "reached", "blocked"].includes(patch.status)) item.status = patch.status;
    if (Object.prototype.hasOwnProperty.call(patch, "at")) item.at = clean(patch.at, 64);
    target.updatedAt = new Date().toISOString(); return target;
  }

  function removeMilestone(caseFile, id) { const target = normalize(caseFile); target.milestones = target.milestones.filter((item) => item.id !== id); target.updatedAt = new Date().toISOString(); return target; }

  function addAttachmentMetadata(caseFile, fileLike = {}, note = "") {
    const target = normalize(caseFile);
    if (target.attachments.length >= MAX_ATTACHMENTS) throw new Error(`Case is limited to ${MAX_ATTACHMENTS} attachment metadata items.`);
    const item = normalizeAttachment({ id: `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: fileLike.name || "Local file", type: fileLike.type || "application/octet-stream", size: fileLike.size || 0, lastModified: fileLike.lastModified || 0, note, addedAt: new Date().toISOString() }, target.attachments.length);
    const duplicate = target.attachments.find((value) => value.name === item.name && value.size === item.size && value.lastModified === item.lastModified);
    if (duplicate) return { caseFile: target, attachment: duplicate, added: false };
    target.attachments.push(item); target.updatedAt = new Date().toISOString(); return { caseFile: target, attachment: item, added: true };
  }

  function updateAttachment(caseFile, id, patch = {}) {
    const target = normalize(caseFile); const item = target.attachments.find((value) => value.id === id); if (!item) return target;
    if (Object.prototype.hasOwnProperty.call(patch, "note")) item.note = clean(patch.note, 2000);
    target.updatedAt = new Date().toISOString(); return target;
  }

  function removeAttachment(caseFile, id) { const target = normalize(caseFile); target.attachments = target.attachments.filter((item) => item.id !== id); target.updatedAt = new Date().toISOString(); return target; }

  function pruneEvidenceLinks(caseFile, evidenceItems = []) {
    const target = normalize(caseFile);
    const valid = new Set((evidenceItems || []).map((item) => item?.id).filter(Boolean));
    let changed = false;
    target.findings.forEach((finding) => {
      const next = finding.evidenceIds.filter((id) => valid.has(id));
      if (next.length !== finding.evidenceIds.length) { finding.evidenceIds = next; changed = true; }
    });
    if (changed) target.updatedAt = new Date().toISOString();
    return target;
  }

  function summarize(caseFile, evidenceItems = []) {
    const target = normalize(caseFile);
    const evidenceIds = new Set((evidenceItems || []).map((item) => item?.id).filter(Boolean));
    const linked = new Set();
    target.findings.forEach((finding) => finding.evidenceIds.forEach((id) => { if (evidenceIds.has(id)) linked.add(id); }));
    return {
      findings: target.findings.length,
      confirmed: target.findings.filter((item) => item.state === "confirmed").length,
      open: target.findings.filter((item) => item.state === "open").length,
      linkedEvidence: linked.size,
      milestones: target.milestones.length,
      reachedMilestones: target.milestones.filter((item) => item.status === "reached").length,
      attachments: target.attachments.length,
      status: target.status,
      severity: target.severity
    };
  }

  function merge(baseCase, incomingCase) {
    const base = normalize(baseCase); const incoming = normalize(incomingCase);
    const out = normalize(base);
    const mergeById = (target, source, max) => { const ids = new Set(target.map((item) => item.id)); for (const item of source) { if (target.length >= max) break; if (ids.has(item.id)) continue; ids.add(item.id); target.push(item); } };
    mergeById(out.findings, incoming.findings, MAX_FINDINGS);
    mergeById(out.milestones, incoming.milestones, MAX_MILESTONES);
    const attachmentKeys = new Set(out.attachments.map((item) => `${item.name}|${item.size}|${item.lastModified}`));
    for (const item of incoming.attachments) { if (out.attachments.length >= MAX_ATTACHMENTS) break; const key = `${item.name}|${item.size}|${item.lastModified}`; if (attachmentKeys.has(key)) continue; attachmentKeys.add(key); out.attachments.push(item); }
    mergeById(out.activity, incoming.activity, MAX_ACTIVITY);
    out.activity = out.activity.slice(-MAX_ACTIVITY).sort((a,b)=>String(a.at).localeCompare(String(b.at)));
    if ((!out.summary || out.summary.length < 16) && incoming.summary) out.summary = incoming.summary;
    if ((!out.hypothesis || out.hypothesis.length < 8) && incoming.hypothesis) out.hypothesis = incoming.hypothesis;
    if ((!out.impact || out.impact.length < 8) && incoming.impact) out.impact = incoming.impact;
    if ((!out.nextSteps || out.nextSteps.length < 8) && incoming.nextSteps) out.nextSteps = incoming.nextSteps;
    out.updatedAt = new Date().toISOString();
    return out;
  }

  function exportJson(caseFile) { return JSON.stringify(normalize(caseFile), null, 2); }

  function importJson(text) {
    const parsed = JSON.parse(String(text || ""));
    if (parsed?.schema !== SCHEMA || !LEGACY_VERSIONS.has(parsed?.version)) throw new Error("Unsupported SignalDock case file.");
    return normalize(parsed);
  }

  function exportMarkdown(caseFile, investigation) {
    const target = normalize(caseFile);
    const evidence = Array.isArray(investigation?.items) ? investigation.items : [];
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));
    const lines = [
      `# ${target.title}`,
      "",
      `- Status: **${target.status}**`,
      `- Severity: **${target.severity}**`,
      `- Updated: ${target.updatedAt}`,
      "",
      "## Summary",
      "",
      target.summary || "No summary yet.",
      "",
      "## Hypothesis",
      "",
      target.hypothesis || "No hypothesis yet.",
      "",
      "## Impact",
      "",
      target.impact || "No impact statement yet.",
      "",
      "## Next steps",
      "",
      target.nextSteps || "No next steps yet.",
      "",
      "## Findings",
      ""
    ];
    if (!target.findings.length) lines.push("No findings yet.", "");
    target.findings.forEach((finding, index) => {
      lines.push(`### ${index + 1}. ${finding.title}`, "", `State: **${finding.state}**`);
      if (finding.tags.length) lines.push(`Tags: ${finding.tags.map((tag) => `\`${tag}\``).join(", ")}`);
      lines.push("", finding.body || "No finding notes.", "");
      const linked = finding.evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean);
      if (linked.length) {
        lines.push("Linked evidence:");
        linked.forEach((item) => lines.push(`- ${item.level} · ${item.service || "—"} · ${item.message || "(empty message)"}`));
        lines.push("");
      }
    });
    if (target.milestones.length) {
      lines.push("## Milestones", "");
      [...target.milestones].sort((a, b) => String(a.at).localeCompare(String(b.at))).forEach((item) => lines.push(`- ${item.at || ""} — **${item.title}** (${item.status})${item.note ? ` — ${item.note}` : ""}`));
      lines.push("");
    }
    if (target.attachments.length) {
      lines.push("## Local attachment references", "", "SignalDock stores attachment metadata only; file contents are not embedded in the case.", "");
      target.attachments.forEach((item) => lines.push(`- **${item.name}** · ${item.type || "unknown"} · ${Number(item.size || 0).toLocaleString()} bytes${item.note ? ` — ${item.note}` : ""}`));
      lines.push("");
    }
    if (target.activity.length) {
      lines.push("## Activity history", "");
      [...target.activity].sort((a, b) => String(a.at).localeCompare(String(b.at))).forEach((item) => lines.push(`- ${item.at || ""} — **${item.label || item.type || "Case activity"}**${item.detail ? ` — ${item.detail}` : ""}`));
      lines.push("");
    }
    return lines.join("\n");
  }

  root.SignalDockCaseWorkspace = { SCHEMA, VERSION, STATUSES, SEVERITIES, MAX_FINDINGS, MAX_MILESTONES, MAX_ATTACHMENTS, MAX_ACTIVITY, empty, normalize, normalizeActivity, normalizeMilestone, normalizeAttachment, appendActivity, updateMeta, addFinding, updateFinding, removeFinding, addMilestone, updateMilestone, removeMilestone, addAttachmentMetadata, updateAttachment, removeAttachment, merge, pruneEvidenceLinks, summarize, exportJson, importJson, exportMarkdown };
}(typeof self !== "undefined" ? self : window));
