(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const {
      state,
      el,
      ownerDocument = el?.queryInput?.ownerDocument || root.document,
      dialogs = [],
      importLogs,
      focusSearch,
      closeInspector,
      applyFilters
    } = options;

    if (!state || !el || !ownerDocument) throw new Error("Interaction Shell controller requires state, elements and document.");
    for (const [name, value] of Object.entries({ importLogs, focusSearch, closeInspector, applyFilters })) {
      if (typeof value !== "function") throw new Error(`Interaction Shell controller requires ${name}().`);
    }

    const listeners = [];
    let bound = false;

    function listen(target, type, handler, listenerOptions) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler, listenerOptions);
      listeners.push(() => target.removeEventListener(type, handler, listenerOptions));
    }

    function isTypingTarget(target = ownerDocument.activeElement) {
      const tag = String(target?.tagName || "").toUpperCase();
      return Boolean(target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(tag));
    }

    function isDialogOpen(dialog) {
      return Boolean(dialog && (dialog.open || dialog.hasAttribute?.("open")));
    }

    function hasOpenDialog(exceptId = "") {
      return dialogs.some((dialog) => dialog?.id !== exceptId && isDialogOpen(dialog));
    }

    function closeCompetingDialogs(exceptId = "") {
      let closed = 0;
      dialogs.forEach((dialog) => {
        if (!dialog || dialog.id === exceptId || !isDialogOpen(dialog)) return;
        try {
          if (typeof dialog.close === "function") dialog.close();
          else dialog.removeAttribute?.("open");
        } catch {
          dialog.removeAttribute?.("open");
        }
        closed += 1;
      });
      return closed;
    }

    function showDialogSafely(dialog) {
      if (!dialog) return false;
      if (isDialogOpen(dialog)) return true;
      try {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute?.("open", "");
      } catch {
        dialog.setAttribute?.("open", "");
      }
      return isDialogOpen(dialog);
    }

    function canFocusSearch() {
      return Boolean(el.queryInput && !el.queryInput.disabled);
    }

    function handleGlobalKeydown(event) {
      if (!event || event.defaultPrevented) return false;
      const key = String(event.key || "").toLowerCase();
      const commandKey = Boolean(event.ctrlKey || event.metaKey);

      if (commandKey && key === "o") {
        event.preventDefault();
        importLogs();
        return true;
      }

      if (commandKey && key === "f") {
        event.preventDefault();
        if (canFocusSearch()) focusSearch();
        return true;
      }

      if (key === "/" && !isTypingTarget(event.target) && !hasOpenDialog()) {
        event.preventDefault();
        if (canFocusSearch()) focusSearch();
        return true;
      }

      if (event.key === "Escape") {
        if (hasOpenDialog()) return false;
        if (state.selectedId) {
          event.preventDefault();
          closeInspector();
          return true;
        }
        if (el.queryInput?.value) {
          event.preventDefault();
          el.queryInput.value = "";
          applyFilters(true);
          return true;
        }
      }

      return false;
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(ownerDocument, "keydown", handleGlobalKeydown);
    }

    function destroy() {
      while (listeners.length) listeners.pop()();
      bound = false;
    }

    return Object.freeze({
      VERSION,
      bind,
      destroy,
      isTypingTarget,
      hasOpenDialog,
      closeCompetingDialogs,
      showDialogSafely,
      handleGlobalKeydown
    });
  }

  root.SignalDockInteractionShellController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
