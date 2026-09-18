(function (root) {
  "use strict";

  function clean(value, max = 1200) { return String(value ?? "").trim().slice(0, max); }
  function timeValue(value) { const ms = Date.parse(String(value || "")); return Number.isFinite(ms) ? ms : null; }

  function build(caseFile = {}, investigation = {}, options = {}) {
    const rows = [];
    let activityCount = 0;
    let milestoneCount = 0;
    let evidenceCount = 0;

    for (const item of Array.isArray(caseFile.activity) ? caseFile.activity : []) {
      const ms = timeValue(item.at);
      if (ms === null) continue;
      rows.push({ id: `activity:${item.id || ms}`, type: "activity", at: item.at, timestampMs: ms, title: clean(item.title || item.type || "Case activity", 180), detail: clean(item.detail || "", 1200), state: clean(item.type || "activity", 80), evidenceId: clean(item.evidenceId || "", 96) });
      activityCount += 1;
    }
    for (const item of Array.isArray(caseFile.milestones) ? caseFile.milestones : []) {
      const at = item.at || item.createdAt;
      const ms = timeValue(at);
      if (ms === null) continue;
      rows.push({ id: `milestone:${item.id || ms}`, type: "milestone", at, timestampMs: ms, title: clean(item.title || "Milestone", 180), detail: clean(item.note || "", 1200), state: clean(item.status || "planned", 48) });
      milestoneCount += 1;
    }
    for (const item of Array.isArray(investigation.items) ? investigation.items : []) {
      const at = item.timestamp || item.addedAt;
      const ms = Number(item.timestampMs);
      const parsed = Number.isFinite(ms) ? ms : timeValue(at);
      if (parsed === null) continue;
      rows.push({ id: `evidence:${item.id || parsed}`, type: "evidence", at: at || new Date(parsed).toISOString(), timestampMs: parsed, title: clean(item.message || "Evidence", 240), detail: clean([item.level, item.service, item.source].filter(Boolean).join(" · "), 500), state: clean(item.level || "INFO", 48), evidenceId: clean(item.id || "", 96) });
      evidenceCount += 1;
    }

    rows.sort((a, b) => a.timestampMs - b.timestampMs || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
    const limit = Math.max(10, Number(options.limit) || 1000);
    return {
      items: rows.slice(-limit),
      summary: {
        total: rows.length,
        activity: activityCount,
        milestones: milestoneCount,
        evidence: evidenceCount,
        startMs: rows[0]?.timestampMs ?? null,
        endMs: rows.at(-1)?.timestampMs ?? null
      }
    };
  }

  root.SignalDockCaseTimeline = { build };
}(typeof self !== "undefined" ? self : window));
