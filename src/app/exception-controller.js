(function (root) {
  "use strict";

  const VERSION = 1;
  const FINGERPRINT_TOKEN = /(?:^|\s)(?:exception|fingerprint):([^\s]+)/i;
  const FINGERPRINT_TOKENS = /(?:^|\s)(?:exception|fingerprint):[^\s]+/gi;

  function extractFingerprint(query) {
    return String(query || "").match(FINGERPRINT_TOKEN)?.[1]?.toLowerCase() || "";
  }

  function composeFingerprintQuery(query, fingerprint) {
    const clean = String(query || "").replace(FINGERPRINT_TOKENS, " ").replace(/\s+/g, " ").trim();
    const token = String(fingerprint || "").trim().toLowerCase();
    if (!token) return clean;
    return `${clean}${clean ? " " : ""}exception:${token}`;
  }

  function create(options = {}) {
    const {
      state,
      el,
      getUtils,
      formatDuration,
      toast,
      applyFilters,
      selectEntry,
      entryRowIntoView,
      pinEvidence,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    } = options;

    if (!state || !el) throw new TypeError("Exception controller requires state and element registries.");
    for (const [name, value] of Object.entries({
      getUtils,
      formatDuration,
      toast,
      applyFilters,
      selectEntry,
      entryRowIntoView,
      pinEvidence,
      closeCompetingDialogs,
      showDialogSafely,
      setActiveNav
    })) {
      if (typeof value !== "function") throw new TypeError(`Exception controller requires ${name}().`);
    }
    if (!root.SignalDockExceptionGroups) throw new Error("SignalDock Exception Groups domain module is unavailable.");

    const doc = el.exceptionList?.ownerDocument || el.exceptionDialog?.ownerDocument || root.document;
    if (!doc) throw new Error("Exception controller requires a document.");

    let bound = false;
    const listeners = [];

    function listen(node, type, handler) {
      if (!node) return;
      node.addEventListener(type, handler);
      listeners.push([node, type, handler]);
    }

    function groups() {
      return Array.isArray(state.exceptionGroups) ? state.exceptionGroups : [];
    }

    function trendFor(fingerprint) {
      return state.exceptionTrends?.groups?.get?.(fingerprint) || null;
    }

    function shortSource(value) {
      return getUtils()?.shortSource?.(value) || String(value || "—");
    }

    function open() {
      if (!el.exceptionDialog) return;
      state.exceptionViewFingerprint = extractFingerprint(el.queryInput?.value || "");
      render();
      closeCompetingDialogs("exceptionDialog");
      showDialogSafely(el.exceptionDialog);
    }

    function close() {
      if (!el.exceptionDialog) return;
      if (typeof el.exceptionDialog.close === "function" && el.exceptionDialog.open) el.exceptionDialog.close();
      else el.exceptionDialog.removeAttribute("open");
      setActiveNav("logs");
    }

    function resetView() {
      state.exceptionViewFingerprint = "";
      render();
    }

    function renderSummary(allGroups) {
      if (!el.exceptionSummary) return;
      const summary = root.SignalDockExceptionGroups.summary(allGroups);
      el.exceptionSummary.replaceChildren();
      [["Groups", summary.groups], ["Occurrences", summary.occurrences], ["Errors", summary.errors], ["Fatal", summary.fatal]].forEach(([label, value]) => {
        const item = doc.createElement("div");
        const strong = doc.createElement("strong");
        strong.textContent = Number(value).toLocaleString();
        const span = doc.createElement("span");
        span.textContent = label;
        item.append(strong, span);
        el.exceptionSummary.appendChild(item);
      });
    }

    function renderTrend() {
      if (!el.exceptionTrend) return;
      const trend = state.exceptionTrends;
      el.exceptionTrend.replaceChildren();
      if (!trend?.groups?.size) {
        const empty = doc.createElement("div");
        empty.className = "exception-trend__empty";
        empty.textContent = "Timestamped recurring failures will show trend analysis here.";
        el.exceptionTrend.appendChild(empty);
        return;
      }
      const wrap = doc.createElement("div");
      wrap.className = "exception-trend__summary";
      [["Spiking", trend.summary.spiking], ["Rising", trend.summary.rising], ["Stable", trend.summary.stable], ["Falling", trend.summary.falling]].forEach(([label, value]) => {
        const chip = doc.createElement("span");
        chip.className = "exception-trend__chip";
        const strong = doc.createElement("strong");
        strong.textContent = Number(value).toLocaleString();
        chip.append(strong, doc.createTextNode(` ${label}`));
        wrap.appendChild(chip);
      });
      const windowChip = doc.createElement("span");
      windowChip.className = "exception-trend__chip";
      windowChip.textContent = `Comparison window: ${formatDuration(trend.windowMs)}`;
      wrap.appendChild(windowChip);
      el.exceptionTrend.appendChild(wrap);
    }

    function actionButton(group, action, label) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "button button--ghost button--small";
      button.dataset.exceptionAction = action;
      button.dataset.exceptionFingerprint = group.fingerprint;
      button.textContent = label;
      button.setAttribute("aria-label", `${label}: ${group.type || group.fingerprint}`);
      return button;
    }

    function renderGroup(group) {
      const card = doc.createElement("article");
      card.className = "exception-item";
      card.dataset.exceptionFingerprint = group.fingerprint;

      const head = doc.createElement("div");
      head.className = "exception-item__head";
      const identity = doc.createElement("div");
      const title = doc.createElement("strong");
      title.textContent = group.type || "Exception-like failure";
      const code = doc.createElement("code");
      code.textContent = group.fingerprint;
      identity.append(title, code);

      const count = doc.createElement("em");
      count.textContent = `${Number(group.count || 0).toLocaleString()} occurrence${group.count === 1 ? "" : "s"}`;
      const trend = trendFor(group.fingerprint);
      if (trend) {
        const badge = doc.createElement("span");
        badge.className = `exception-trend-badge exception-trend-badge--${trend.trend}`;
        badge.textContent = trend.trend;
        badge.title = `${trend.recent} recent vs ${trend.previous} previous window`;
        identity.appendChild(badge);
      }
      head.append(identity, count);

      const signature = doc.createElement("p");
      signature.className = "exception-item__signature";
      signature.textContent = group.signature || "Normalized exception signature";

      const meta = doc.createElement("div");
      meta.className = "exception-item__meta";
      const topService = group.services?.[0]?.[0] || "—";
      const topSource = group.sources?.[0]?.[0] || "—";
      const range = group.firstTimestampMs !== null && group.lastTimestampMs !== null
        ? `${new Date(group.firstTimestampMs).toLocaleString()} → ${new Date(group.lastTimestampMs).toLocaleString()}`
        : "No timestamp range";
      [["Service", topService], ["Source", shortSource(topSource)], ["Severity", `${group.fatal ? `${group.fatal} fatal · ` : ""}${group.errors} errors`], ["Observed", range]].forEach(([label, value]) => {
        const row = doc.createElement("span");
        row.textContent = `${label}: ${value}`;
        meta.appendChild(row);
      });
      if (trend) {
        const row = doc.createElement("span");
        row.textContent = `Trend: ${trend.recent} recent · ${trend.previous} previous`;
        meta.appendChild(row);
      }

      const actions = doc.createElement("div");
      actions.className = "exception-item__actions";
      actions.append(
        actionButton(group, "filter", "Filter logs"),
        actionButton(group, "open", "Open sample"),
        actionButton(group, "pin", "Pin sample")
      );
      card.append(head, signature, meta, actions);
      return card;
    }

    function render() {
      if (!el.exceptionList) return;
      const allGroups = groups();
      const visible = state.exceptionViewFingerprint
        ? allGroups.filter((group) => group.fingerprint === state.exceptionViewFingerprint)
        : allGroups;
      renderSummary(allGroups);
      renderTrend();
      el.exceptionList.replaceChildren();
      if (!visible.length) {
        const empty = doc.createElement("div");
        empty.className = "investigation-empty";
        empty.textContent = allGroups.length ? "No exception group matches this view." : "No recurring exceptions detected in the loaded logs.";
        el.exceptionList.appendChild(empty);
        return;
      }
      visible.slice(0, 500).forEach((group) => el.exceptionList.appendChild(renderGroup(group)));
      if (allGroups.length > 500 && !state.exceptionViewFingerprint) {
        const note = doc.createElement("p");
        note.className = "exception-list-note";
        note.textContent = `Showing 500 of ${allGroups.length.toLocaleString()} groups. Filter a fingerprint from the query bar for focused analysis.`;
        el.exceptionList.appendChild(note);
      }
    }

    function entryFingerprint(entry) {
      const existing = String(entry?.exceptionFingerprint || "").toLowerCase();
      if (existing) return existing;
      if (!root.SignalDockExceptionGroups.candidate?.(entry)) return "";
      return String(root.SignalDockExceptionGroups.fingerprint?.(entry) || "").toLowerCase();
    }

    function resolveSampleEntry(group) {
      if (!group) return null;
      for (const id of group.sampleIds || []) {
        const entry = state.entries?.find?.((candidate) => candidate?.id === id);
        if (entry) return entry;
      }
      for (const index of group.sampleIndexes || []) {
        if (!Number.isInteger(index)) continue;
        const entry = state.entries?.[index];
        if (entry) return entry;
      }
      const fingerprint = String(group.fingerprint || "").toLowerCase();
      if (!fingerprint) return null;
      return state.entries?.find?.((entry) => entryFingerprint(entry) === fingerprint) || null;
    }

    function filterToGroup(fingerprint) {
      if (!el.queryInput) {
        toast("The log query field is unavailable.", "error");
        return;
      }
      el.queryInput.value = composeFingerprintQuery(el.queryInput.value, fingerprint);
      close();
      applyFilters(true);
      toast(`Filtered to exception ${fingerprint}.`);
    }

    function openSample(group) {
      const entry = resolveSampleEntry(group);
      if (!entry) {
        toast("No sample entry from this exception group is available.", "error");
        return;
      }
      close();
      selectEntry(entry.id);
      entryRowIntoView(entry.globalIndex);
    }

    function pinSample(group) {
      const entry = resolveSampleEntry(group);
      if (!entry) {
        toast("No sample entry from this exception group is available.", "error");
        return;
      }
      const fingerprint = group.fingerprint || entryFingerprint(entry);
      pinEvidence(entry, {
        note: `Representative sample from ${fingerprint}`,
        tags: ["exception", fingerprint],
        activityLabel: "Exception evidence pinned",
        activityDetail: `${fingerprint} · ${(entry.message || "").slice(0, 160)}`,
        addedMessage: "Exception sample added to investigation.",
        duplicateMessage: "This sample is already pinned."
      });
    }

    function onListClick(event) {
      const button = event.target?.closest?.("[data-exception-action]");
      if (!button) return;
      const fingerprint = button.dataset.exceptionFingerprint || "";
      const group = groups().find((item) => item.fingerprint === fingerprint);
      if (!group) return;
      if (button.dataset.exceptionAction === "filter") {
        filterToGroup(fingerprint);
        return;
      }
      if (button.dataset.exceptionAction === "pin") {
        pinSample(group);
        return;
      }
      if (button.dataset.exceptionAction === "open") openSample(group);
    }

    function refresh() {
      if (el.exceptionDialog?.open) render();
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(el.closeExceptionButton, "click", close);
      listen(el.exceptionResetButton, "click", resetView);
      listen(el.exceptionList, "click", onListClick);
    }

    function destroy() {
      listeners.splice(0).forEach(([node, type, handler]) => node.removeEventListener(type, handler));
      bound = false;
    }

    return { open, close, render, refresh, resetView, resolveSampleEntry, bind, destroy };
  }

  root.SignalDockExceptionController = { VERSION, create, extractFingerprint, composeFingerprintQuery };
}(typeof self !== "undefined" ? self : window));
