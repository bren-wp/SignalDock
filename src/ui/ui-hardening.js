(function (root) {
  "use strict";

  const doc = root.document;
  if (!doc) return;

  const state = {
    lastTrigger: null,
    openDialogs: new Set()
  };

  function labelDialog(dialog, index) {
    if (!dialog) return;
    dialog.setAttribute("aria-modal", "true");
    const card = dialog.querySelector("section");
    const title = dialog.querySelector("header strong, section > strong, .command-palette-search input");
    if (title && title.tagName !== "INPUT") {
      if (!title.id) title.id = `${dialog.id || `signaldock-dialog-${index}`}-title`;
      dialog.setAttribute("aria-labelledby", title.id);
      if (card?.hasAttribute("aria-label")) card.removeAttribute("aria-label");
    } else if (!dialog.hasAttribute("aria-label") && card?.getAttribute("aria-label")) {
      dialog.setAttribute("aria-label", card.getAttribute("aria-label"));
    }
  }

  function focusable(dialog) {
    return [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && !element.closest('[hidden], [aria-hidden="true"]'));
  }

  function focusInitial(dialog) {
    if (!dialog?.open) return;
    const preferred = dialog.querySelector('[autofocus], input[type="search"]:not([disabled]), input[type="text"]:not([disabled]), button:not([disabled])');
    if (preferred && typeof preferred.focus === "function") {
      try { preferred.focus({ preventScroll: true }); } catch { preferred.focus(); }
    }
  }

  function onDialogOpened(dialog) {
    if (state.openDialogs.has(dialog)) return;
    state.openDialogs.add(dialog);
    if (!dialog.dataset.signaldockOpener && state.lastTrigger?.id) dialog.dataset.signaldockOpener = state.lastTrigger.id;
    root.requestAnimationFrame?.(() => focusInitial(dialog));
  }

  function onDialogClosed(dialog) {
    if (!state.openDialogs.delete(dialog)) return;
    const openerId = dialog.dataset.signaldockOpener;
    delete dialog.dataset.signaldockOpener;
    const opener = openerId ? doc.getElementById(openerId) : state.lastTrigger;
    if (opener && opener.isConnected && typeof opener.focus === "function") {
      try { opener.focus({ preventScroll: true }); } catch { opener.focus(); }
    }
  }

  function trapTab(event, dialog) {
    if (event.key !== "Tab" || !dialog?.open) return;
    const items = focusable(dialog);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function topDialog() {
    return [...doc.querySelectorAll("dialog[open]")].at(-1) || null;
  }

  function install() {
    const dialogs = [...doc.querySelectorAll("dialog")];
    dialogs.forEach(labelDialog);

    doc.addEventListener("pointerdown", () => {
      doc.documentElement.dataset.inputModality = "pointer";
    }, true);

    doc.addEventListener("click", (event) => {
      const trigger = event.target.closest?.("button, a, [role='button']");
      if (trigger) state.lastTrigger = trigger;
    }, true);

    doc.addEventListener("keydown", (event) => {
      doc.documentElement.dataset.inputModality = "keyboard";
      const dialog = topDialog();
      if (dialog && event.key === "Escape" && typeof dialog.close !== "function") {
        event.preventDefault();
        dialog.removeAttribute("open");
        return;
      }
      if (dialog) trapTab(event, dialog);
    }, true);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== "attributes" || record.attributeName !== "open" || record.target.tagName !== "DIALOG") continue;
        const dialog = record.target;
        if (dialog.open) onDialogOpened(dialog); else onDialogClosed(dialog);
      }
    });
    dialogs.forEach((dialog) => observer.observe(dialog, { attributes: true, attributeFilter: ["open"] }));

    const coarse = root.matchMedia?.("(pointer: coarse)");
    const reduced = root.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncMedia = () => {
      doc.documentElement.classList.toggle("has-coarse-pointer", Boolean(coarse?.matches));
      doc.documentElement.classList.toggle("prefers-reduced-motion", Boolean(reduced?.matches));
    };
    syncMedia();
    coarse?.addEventListener?.("change", syncMedia);
    reduced?.addEventListener?.("change", syncMedia);

    doc.querySelectorAll("table").forEach((table) => {
      if (!table.hasAttribute("role")) table.setAttribute("role", "table");
      table.querySelectorAll("thead th").forEach((th) => { if (!th.hasAttribute("scope")) th.setAttribute("scope", "col"); });
    });
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  root.SignalDockUiHardening = { focusable, topDialog };
}(typeof self !== "undefined" ? self : window));
