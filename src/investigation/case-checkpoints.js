(function (root) {
  "use strict";
  const SCHEMA = "signaldock.case-checkpoints", VERSION = 1, MAX = 40;
  function clean(value, max = 4000) { return String(value ?? "").trim().slice(0, max); }
  function cleanEvidenceIds(input) {
    const source = Array.isArray(input) ? input : [];
    const out = [];
    for (const value of source) {
      const id = clean(value, 96);
      if (!id) continue;
      out.push(id);
      if (out.length >= 5000) break;
    }
    return out;
  }
  function evidenceIds(investigation) {
    const items = Array.isArray(investigation?.items) ? investigation.items : [];
    const out = [];
    for (const item of items) {
      const id = clean(item?.id, 96);
      if (!id) continue;
      out.push(id);
      if (out.length >= 5000) break;
    }
    return out;
  }
  function normalizeOne(checkpoint, index = 0) {
    const source = checkpoint && typeof checkpoint === "object" ? checkpoint : {};
    return { id: clean(source.id || `checkpoint-${index + 1}`, 96), label: clean(source.label || `Checkpoint ${index + 1}`, 160), note: clean(source.note || "", 3000), createdAt: clean(source.createdAt || new Date().toISOString(), 64), caseFile: source.caseFile && typeof source.caseFile === "object" ? source.caseFile : {}, evidenceIds: cleanEvidenceIds(source.evidenceIds) };
  }
  function normalizeList(input) { return (Array.isArray(input) ? input : []).slice(-MAX).map(normalizeOne); }
  function snapshotCase(caseFile) {
    const value = root.SignalDockCaseWorkspace?.normalize?.(caseFile) || caseFile || {};
    return { ...value, findings: (value.findings || []).slice(-300), milestones: (value.milestones || []).slice(-100), attachments: (value.attachments || []).slice(-100), activity: (value.activity || []).slice(-100) };
  }
  function create(caseFile, investigation, options = {}) { return normalizeOne({ id: `checkpoint-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, label: options.label || `Checkpoint ${new Date().toLocaleString()}`, note: options.note || "", createdAt: new Date().toISOString(), caseFile: snapshotCase(caseFile), evidenceIds: evidenceIds(investigation) }); }
  function add(list, checkpoint) { const out = normalizeList(list); out.push(normalizeOne(checkpoint, out.length)); return out.slice(-MAX); }
  function remove(list, id) { return normalizeList(list).filter((item) => item.id !== id); }
  function collectionIds(value, fallbackPrefix) { return (Array.isArray(value) ? value : []).map((item, index) => clean(item?.id || item?.fingerprint || item?.name || `${fallbackPrefix}-${index}`, 160)).filter(Boolean); }
  function setDiff(beforeIds, afterIds) {
    const before = beforeIds instanceof Set ? beforeIds : new Set(beforeIds);
    const after = afterIds instanceof Set ? afterIds : new Set(afterIds);
    return {
      added: [...after].filter((id) => !before.has(id)),
      removed: [...before].filter((id) => !after.has(id))
    };
  }
  function collectionDiff(before, after, fallbackPrefix) {
    return setDiff(collectionIds(before, fallbackPrefix), collectionIds(after, fallbackPrefix));
  }
  function fieldDiff(before, after, fields) {
    const out = {};
    for (const field of fields) {
      const oldValue = clean(before?.[field], 4000); const newValue = clean(after?.[field], 4000);
      if (oldValue !== newValue) out[field] = { before: oldValue, after: newValue };
    }
    return out;
  }
  function diff(checkpoint, currentCase, investigation) {
    const before = normalizeOne(checkpoint); const after = root.SignalDockCaseWorkspace?.normalize?.(currentCase) || currentCase || {};
    const evidence = setDiff(before.evidenceIds, evidenceIds(investigation));
    const evidenceAdded = evidence.added; const evidenceRemoved = evidence.removed;
    const findings = collectionDiff(before.caseFile?.findings, after?.findings, "finding");
    const milestones = collectionDiff(before.caseFile?.milestones, after?.milestones, "milestone");
    const attachments = collectionDiff(before.caseFile?.attachments, after?.attachments, "attachment");
    const fields = fieldDiff(before.caseFile, after, ["status", "severity", "hypothesis", "impact", "nextSteps"]);
    const changedSections = Object.keys(fields).length + Number(findings.added.length + findings.removed.length > 0) + Number(milestones.added.length + milestones.removed.length > 0) + Number(attachments.added.length + attachments.removed.length > 0) + Number(evidenceAdded.length + evidenceRemoved.length > 0);
    return { statusChanged: before.caseFile?.status !== after?.status, severityChanged: before.caseFile?.severity !== after?.severity, findingsDelta: (after?.findings?.length || 0) - (before.caseFile?.findings?.length || 0), milestonesDelta: (after?.milestones?.length || 0) - (before.caseFile?.milestones?.length || 0), attachmentsDelta: (after?.attachments?.length || 0) - (before.caseFile?.attachments?.length || 0), evidenceAdded, evidenceRemoved, fields, findings, milestones, attachments, summary: { changedSections, evidenceChanges: evidenceAdded.length + evidenceRemoved.length, findingChanges: findings.added.length + findings.removed.length, milestoneChanges: milestones.added.length + milestones.removed.length, attachmentChanges: attachments.added.length + attachments.removed.length } };
  }
  root.SignalDockCaseCheckpoints = { SCHEMA, VERSION, MAX, normalizeList, create, add, remove, diff };
}(typeof self !== "undefined" ? self : window));
