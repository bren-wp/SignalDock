(function (root) {
  "use strict";

  const VERSION = 1;

  function create(options = {}) {
    const state = options.state;
    const el = options.el || {};
    const storageKey = String(options.storageKey || "signaldock-settings-v10");
    const getUtils = options.getUtils || (() => root.SignalDockUtils);
    const getParserProfiles = options.getParserProfiles || (() => root.SignalDockParserProfiles);
    const toast = options.toast || (() => {});
    const applyFilters = options.applyFilters || (() => {});
    const markDatasetForAutosave = options.markDatasetForAutosave || (() => {});
    const updateAutosaveStatus = options.updateAutosaveStatus || (() => {});
    const updateDiagnostics = options.updateDiagnostics || (() => {});
    const closeCompetingDialogs = options.closeCompetingDialogs || (() => {});
    const showDialogSafely = options.showDialogSafely || (() => false);
    const scheduleViewAutosave = options.scheduleViewAutosave || (() => {});
    const document = el.settingsDialog?.ownerDocument || root.document;
    let bound = false;

    if (!state || typeof state !== "object") throw new Error("Settings controller requires application state.");
    if (!document) throw new Error("Settings controller requires a document context.");

    function updateCustomParserVisibility() {
      if (!el.customParserFields || !el.parserProfile) return;
      el.customParserFields.hidden = el.parserProfile.value !== "custom";
    }

    function refreshSavedParserProfiles(selectedId = "") {
      if (!el.savedParserProfile || !getParserProfiles()) return;
      const current = selectedId || el.savedParserProfile.value;
      const profiles = getParserProfiles().load();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose saved profile…";
      const options = profiles.map((profile) => {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.name;
        return option;
      });
      el.savedParserProfile.replaceChildren(placeholder, ...options);
      if (profiles.some((profile) => profile.id === current)) el.savedParserProfile.value = current;
      if (el.deleteParserProfileButton) el.deleteParserProfileButton.disabled = !el.savedParserProfile.value;
    }

    function apply() {
      document.body?.classList.toggle("wrap-messages", Boolean(state.settings.wrap));
      document.body?.classList.toggle("compact-density", Boolean(state.settings.compact));
      if (state.settings.wrap && state.renderMode === "virtual") {
        state.renderMode = "paged";
        if (el.renderMode) el.renderMode.value = "paged";
      }
      if (el.wrapToggle) el.wrapToggle.checked = Boolean(state.settings.wrap);
      if (el.compactToggle) el.compactToggle.checked = Boolean(state.settings.compact);
      if (el.unknownToggle) el.unknownToggle.checked = state.settings.showUnknown !== false;
      if (el.workerToggle) el.workerToggle.checked = state.settings.useWorker !== false;
      if (el.autosaveToggle) el.autosaveToggle.checked = state.settings.autosave !== false;
      if (el.parserProfile) el.parserProfile.value = state.settings.parserProfile || "auto";
      if (el.customParserPattern) el.customParserPattern.value = state.settings.customParserPattern || "";
      if (el.customParserFlags) el.customParserFlags.value = state.settings.customParserFlags || "i";
      updateCustomParserVisibility();
      updateAutosaveStatus();
    }

    function persistFromForm() {
      state.settings = {
        wrap: Boolean(el.wrapToggle?.checked),
        compact: Boolean(el.compactToggle?.checked),
        showUnknown: el.unknownToggle?.checked !== false,
        useWorker: el.workerToggle?.checked !== false,
        autosave: el.autosaveToggle?.checked !== false,
        parserProfile: el.parserProfile?.value || "auto",
        customParserPattern: String(el.customParserPattern?.value || "").trim(),
        customParserFlags: String(el.customParserFlags?.value || "").replace(/[^imsu]/g, "") || "i"
      };
      getUtils()?.saveJson?.(storageKey, state.settings);
      apply();
      applyFilters(false);
      scheduleViewAutosave();
      if (state.settings.autosave !== false && state.entries?.length) markDatasetForAutosave();
    }

    function open() {
      if (!el.settingsDialog) return;
      apply();
      refreshSavedParserProfiles();
      updateDiagnostics();
      closeCompetingDialogs("settingsDialog");
      showDialogSafely(el.settingsDialog);
    }

    function applySavedParserProfile() {
      const profiles = getParserProfiles();
      const profile = profiles?.get?.(el.savedParserProfile?.value);
      if (el.deleteParserProfileButton) el.deleteParserProfileButton.disabled = !profile;
      if (!profile) return;
      if (el.savedParserName) el.savedParserName.value = profile.name;
      if (el.customParserPattern) el.customParserPattern.value = profile.pattern;
      if (el.customParserFlags) el.customParserFlags.value = profile.flags || "i";
      if (el.parserProfile) el.parserProfile.value = "custom";
      updateCustomParserVisibility();
      persistFromForm();
      toast(`Parser profile “${profile.name}” loaded.`);
    }

    function saveParserProfileFromForm() {
      const profiles = getParserProfiles();
      if (!profiles) return;
      try {
        const existingId = el.savedParserProfile?.value || "";
        const record = profiles.upsert({
          name: el.savedParserName?.value || "",
          pattern: el.customParserPattern?.value || "",
          flags: el.customParserFlags?.value || "i"
        }, existingId);
        refreshSavedParserProfiles(record.id);
        if (el.savedParserName) el.savedParserName.value = record.name;
        toast(`Parser profile “${record.name}” saved locally.`);
      } catch (error) {
        toast(error?.message || String(error), "error", 6500);
      }
    }

    function deleteSelectedParserProfile() {
      const profiles = getParserProfiles();
      const id = el.savedParserProfile?.value || "";
      if (!id || !profiles) return;
      const profile = profiles.get(id);
      profiles.remove(id);
      refreshSavedParserProfiles();
      if (el.savedParserName) el.savedParserName.value = "";
      toast(`Deleted parser profile “${profile?.name || "profile"}”.`);
    }

    function exportParserProfiles() {
      const profiles = getParserProfiles();
      if (!profiles) return;
      const text = profiles.exportJson();
      getUtils()?.downloadParts?.(`signaldock-parser-profiles-${new Date().toISOString().slice(0, 10)}.json`, [text], "application/json;charset=utf-8");
      toast("Parser profiles exported.");
    }

    async function importParserProfiles(event) {
      const profilesApi = getParserProfiles();
      const file = event?.target?.files?.[0];
      if (!file || !profilesApi) return;
      try {
        const profiles = profilesApi.importJson(await file.text());
        refreshSavedParserProfiles();
        toast(`Imported ${profiles.length} parser profile${profiles.length === 1 ? "" : "s"}.`);
      } catch (error) {
        toast(`Could not import parser profiles: ${error?.message || error}`, "error", 6500);
      } finally {
        if (event?.target) event.target.value = "";
      }
    }

    function onSettingControl(event) {
      persistFromForm();
      if (event?.currentTarget === el.parserProfile) updateCustomParserVisibility();
    }

    function onImportClick() {
      el.parserProfilesFileInput?.click();
    }

    function bind() {
      if (bound) return;
      bound = true;
      [el.wrapToggle, el.compactToggle, el.unknownToggle, el.workerToggle, el.autosaveToggle, el.parserProfile].filter(Boolean).forEach((control) => control.addEventListener("change", onSettingControl));
      [el.customParserPattern, el.customParserFlags].filter(Boolean).forEach((control) => control.addEventListener("input", onSettingControl));
      el.savedParserProfile?.addEventListener("change", applySavedParserProfile);
      el.saveParserProfileButton?.addEventListener("click", saveParserProfileFromForm);
      el.deleteParserProfileButton?.addEventListener("click", deleteSelectedParserProfile);
      el.exportParserProfilesButton?.addEventListener("click", exportParserProfiles);
      el.importParserProfilesButton?.addEventListener("click", onImportClick);
      el.parserProfilesFileInput?.addEventListener("change", importParserProfiles);
    }

    function destroy() {
      if (!bound) return;
      bound = false;
      [el.wrapToggle, el.compactToggle, el.unknownToggle, el.workerToggle, el.autosaveToggle, el.parserProfile].filter(Boolean).forEach((control) => control.removeEventListener("change", onSettingControl));
      [el.customParserPattern, el.customParserFlags].filter(Boolean).forEach((control) => control.removeEventListener("input", onSettingControl));
      el.savedParserProfile?.removeEventListener("change", applySavedParserProfile);
      el.saveParserProfileButton?.removeEventListener("click", saveParserProfileFromForm);
      el.deleteParserProfileButton?.removeEventListener("click", deleteSelectedParserProfile);
      el.exportParserProfilesButton?.removeEventListener("click", exportParserProfiles);
      el.importParserProfilesButton?.removeEventListener("click", onImportClick);
      el.parserProfilesFileInput?.removeEventListener("change", importParserProfiles);
    }

    return Object.freeze({
      open,
      apply,
      persistFromForm,
      updateCustomParserVisibility,
      refreshSavedParserProfiles,
      bind,
      destroy
    });
  }

  root.SignalDockSettingsController = Object.freeze({ VERSION, create });
}(typeof self !== "undefined" ? self : window));
