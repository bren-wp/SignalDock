(function (root) {
  "use strict";

  const VERSION = 1;
  const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

  function create(options = {}) {
    const {
      state,
      el,
      ownerDocument = el?.caseFileInput?.ownerDocument || root.document,
      pruneEvidenceLinks,
      summarizeCase,
      exportCaseJsonText,
      exportCaseMarkdownText,
      importCaseJsonText,
      normalizeInvestigation,
      analyzeServiceHealth,
      saveTextExport,
      readCaseText,
      renderCaseSurfaces,
      renderWorkspace,
      renderCheckpoints,
      recordCaseActivity,
      scheduleViewAutosave,
      scheduleDatasetAutosave,
      formatDuration,
      todayStamp,
      toast
    } = options;

    if (!state || !el || !ownerDocument) throw new Error("Case File controller requires state, elements and document.");
    const required = {
      pruneEvidenceLinks,
      summarizeCase,
      exportCaseJsonText,
      exportCaseMarkdownText,
      importCaseJsonText,
      normalizeInvestigation,
      analyzeServiceHealth,
      saveTextExport,
      readCaseText,
      renderCaseSurfaces,
      renderWorkspace,
      renderCheckpoints,
      recordCaseActivity,
      scheduleViewAutosave,
      scheduleDatasetAutosave,
      formatDuration,
      todayStamp,
      toast
    };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== "function") throw new Error(`Case File controller requires ${name}().`);
    }

    const listeners = [];
    let bound = false;

    function listen(target, type, handler) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }

    function persist() {
      scheduleViewAutosave();
      if (state.settings?.autosave !== false) scheduleDatasetAutosave();
    }

    function syncFormFromState() {
      if (el.investigationTitle) el.investigationTitle.value = state.investigation?.title || "";
      if (el.investigationSummary) el.investigationSummary.value = state.investigation?.summary || "";
      if (el.caseStatus) el.caseStatus.value = state.caseFile?.status || "open";
      if (el.caseSeverity) el.caseSeverity.value = state.caseFile?.severity || "none";
      if (el.caseHypothesis) el.caseHypothesis.value = state.caseFile?.hypothesis || "";
      if (el.caseImpact) el.caseImpact.value = state.caseFile?.impact || "";
      if (el.caseNextSteps) el.caseNextSteps.value = state.caseFile?.nextSteps || "";
    }

    function renderCaseWorkspace(rebuild = true) {
      if (!state.caseFile) return false;
      state.caseFile = pruneEvidenceLinks(state.caseFile, state.investigation?.items || []);
      const summary = summarizeCase(state.caseFile, state.investigation?.items || []);
      if (el.caseWorkspaceStats) {
        el.caseWorkspaceStats.textContent =
          `${summary.findings} findings · ${summary.confirmed} confirmed · ${summary.linkedEvidence} linked evidence`;
      }
      renderCaseSurfaces();
      renderWorkspace(rebuild);
      renderCheckpoints();
      return true;
    }

    async function exportCaseJson() {
      if (!state.caseFile) return { mode: "empty" };
      const name = `signaldock-case-${todayStamp()}.sdcase`;
      const text = exportCaseJsonText(state.caseFile);
      try {
        const saved = await saveTextExport({ name, text, mime: "application/json;charset=utf-8" });
        if (saved?.mode === "cancelled") {
          toast("Case workspace export cancelled.");
          return saved;
        }
        toast("Case workspace exported.");
        return saved || { mode: "saved", name };
      } catch (error) {
        toast(`Could not export case workspace: ${error?.message || error}`, "error", 6500);
        return { mode: "error", error };
      }
    }

    function buildMarkdownReport() {
      let report = exportCaseMarkdownText(state.caseFile, state.investigation);
      const health = state.healthData || analyzeServiceHealth(state.entries);
      const trend = state.exceptionTrends;
      report += `\n\n## Observed dataset context\n\n- Entries: ${state.entries.length.toLocaleString()}\n- Services: ${(state.summary?.services || []).length.toLocaleString()}\n- Error/Fatal entries: ${(state.summary?.errors || 0).toLocaleString()}\n- Warning entries: ${(state.summary?.warnings || 0).toLocaleString()}\n- Exception fingerprints: ${(state.exceptionGroups || []).length.toLocaleString()}\n`;

      const concerning = (health?.rows || [])
        .filter((row) => row.status === "critical" || row.status === "degraded")
        .slice(0, 12);
      if (concerning.length) {
        report += "\n### Observed service concerns\n\n";
        for (const row of concerning) {
          const duration = row.p95DurationMs === null ? "" : `; p95 span ${formatDuration(row.p95DurationMs)}`;
          report += `- **${row.service}** — ${row.status}; ${(row.errorRate * 100).toFixed(1)}% error rate; ${row.exceptionGroups} exception groups${duration}\n`;
        }
      }

      const spiking = [...(trend?.groups?.values?.() || [])]
        .filter((row) => row.trend === "spiking")
        .sort((a, b) => b.recent - a.recent)
        .slice(0, 12);
      if (spiking.length) {
        report += "\n### Spiking exception fingerprints\n\n";
        for (const row of spiking) {
          report += `- \`${row.fingerprint}\` — ${row.recent} recent vs ${row.previous} previous-window occurrences\n`;
        }
      }

      report += "\n> Observed health and trend sections are derived only from the logs included in this local SignalDock dataset.\n";
      return report;
    }

    async function exportCaseMarkdown() {
      if (!state.caseFile) return { mode: "empty" };
      const name = `signaldock-case-${todayStamp()}.md`;
      const text = buildMarkdownReport();
      try {
        const saved = await saveTextExport({ name, text, mime: "text/markdown;charset=utf-8" });
        if (saved?.mode === "cancelled") {
          toast("Case report export cancelled.");
          return saved;
        }
        toast("Case report exported as Markdown.");
        return saved || { mode: "saved", name };
      } catch (error) {
        toast(`Could not export case report: ${error?.message || error}`, "error", 6500);
        return { mode: "error", error };
      }
    }

    async function importCaseFile(file) {
      if (!file) return false;
      const size = Math.max(0, Number(file.size) || 0);
      if (size > MAX_IMPORT_BYTES) {
        toast("Case file exceeds the 32 MB safety limit.", "error", 6500);
        return false;
      }

      try {
        const text = await readCaseText(file, MAX_IMPORT_BYTES);
        state.caseFile = importCaseJsonText(text);
        state.caseFile = pruneEvidenceLinks(state.caseFile, state.investigation?.items || []);

        recordCaseActivity("case.imported", "Case file imported", file.name || "Imported case");
        state.investigation = normalizeInvestigation(Object.assign({}, state.investigation, {
          title: state.caseFile.title || state.investigation?.title || "Investigation",
          summary: state.caseFile.summary || state.investigation?.summary || ""
        }));

        syncFormFromState();
        renderCaseWorkspace(true);
        persist();
        const findings = state.caseFile?.findings?.length || 0;
        toast(`Imported case with ${findings} finding${findings === 1 ? "" : "s"}.`);
        return true;
      } catch (error) {
        toast(`Could not import case: ${error?.message || error}`, "error", 6500);
        return false;
      }
    }

    async function onCaseFileChange(event) {
      const input = event?.target || el.caseFileInput;
      const file = input?.files?.[0];
      try {
        if (file) await importCaseFile(file);
      } finally {
        if (input) input.value = "";
      }
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(el.exportCaseMarkdownButton, "click", () => { void exportCaseMarkdown(); });
      listen(el.exportCaseJsonButton, "click", () => { void exportCaseJson(); });
      listen(el.importCaseJsonButton, "click", () => el.caseFileInput?.click());
      listen(el.caseFileInput, "change", onCaseFileChange);
    }

    function destroy() {
      while (listeners.length) {
        const [target, type, handler] = listeners.pop();
        target.removeEventListener(type, handler);
      }
      bound = false;
    }

    return Object.freeze({
      VERSION,
      MAX_IMPORT_BYTES,
      bind,
      destroy,
      renderCaseWorkspace,
      exportCaseJson,
      exportCaseMarkdown,
      importCaseFile,
      buildMarkdownReport
    });
  }

  root.SignalDockCaseFileController = Object.freeze({ VERSION, MAX_IMPORT_BYTES, create });
}(typeof self !== "undefined" ? self : window));
