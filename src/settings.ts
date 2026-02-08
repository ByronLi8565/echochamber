import { forceResync, setSyncAudioEnabled } from "./sync.ts";

const SYNC_COLORS_KEY = "echochamber-sync-colors";
const SYNC_AUDIO_KEY = "echochamber-sync-audio-enabled";
const SHOW_PROP_BUBBLES_KEY = "echochamber-show-prop-bubbles";
const SHOW_TOOLBAR_KEY = "echochamber-show-toolbar";

let syncColorsEnabled: boolean = loadSyncColorsSetting();
let syncColorsChangeCallbacks: Array<(enabled: boolean) => void> = [];

function loadSyncColorsSetting(): boolean {
  const stored = localStorage.getItem(SYNC_COLORS_KEY);
  if (stored === null) return true;
  return stored === "true";
}

function saveSyncColorsSetting(enabled: boolean): void {
  localStorage.setItem(SYNC_COLORS_KEY, String(enabled));
}

function loadSyncAudioSetting(): boolean {
  return localStorage.getItem(SYNC_AUDIO_KEY) === "1";
}

function saveSyncAudioSetting(enabled: boolean): void {
  localStorage.setItem(SYNC_AUDIO_KEY, enabled ? "1" : "0");
}

function loadShowPropBubblesSetting(): boolean {
  const stored = localStorage.getItem(SHOW_PROP_BUBBLES_KEY);
  if (stored === null) return true;
  return stored === "1";
}

function saveShowPropBubblesSetting(show: boolean): void {
  localStorage.setItem(SHOW_PROP_BUBBLES_KEY, show ? "1" : "0");
}

function loadShowToolbarSetting(): boolean {
  const stored = localStorage.getItem(SHOW_TOOLBAR_KEY);
  if (stored === null) return true;
  return stored === "1";
}

function saveShowToolbarSetting(show: boolean): void {
  localStorage.setItem(SHOW_TOOLBAR_KEY, show ? "1" : "0");
}

function refreshFeatherIcons(): void {
  if (typeof (window as any).feather !== "undefined") {
    (window as any).feather.replace();
  }
}

function applyPropBubblesVisibility(show: boolean): void {
  document.body.classList.toggle("hide-prop-bubbles", !show);
}

function applyToolbarVisibility(show: boolean): void {
  document.body.classList.toggle("hide-toolbar", !show);
}

function setTooltip(button: HTMLButtonElement, text: string): void {
  button.title = text;
  button.setAttribute("data-tooltip", text);
  button.setAttribute("aria-label", text);
}

export function isSyncColorsEnabled(): boolean {
  return syncColorsEnabled;
}

export function onSyncColorsChange(
  callback: (enabled: boolean) => void,
): () => void {
  syncColorsChangeCallbacks.push(callback);
  return () => {
    syncColorsChangeCallbacks = syncColorsChangeCallbacks.filter(
      (cb) => cb !== callback,
    );
  };
}

export function initSettings(): void {
  const btnSettings = document.getElementById(
    "btn-settings",
  ) as HTMLButtonElement | null;
  const settingsPanel = document.getElementById("settings-panel");
  const toggleSyncColors = document.getElementById(
    "toggle-sync-colors",
  ) as HTMLInputElement | null;
  const toggleSyncAudio = document.getElementById(
    "toggle-sync-audio",
  ) as HTMLInputElement | null;
  const btnToggleProps = document.getElementById(
    "btn-toggle-props",
  ) as HTMLButtonElement | null;
  const btnToggleToolbar = document.getElementById(
    "btn-toggle-toolbar",
  ) as HTMLButtonElement | null;

  if (
    !btnSettings ||
    !settingsPanel ||
    !toggleSyncColors ||
    !toggleSyncAudio ||
    !btnToggleProps ||
    !btnToggleToolbar
  ) {
    console.warn("[Settings] Settings elements not found in DOM");
    return;
  }

  toggleSyncColors.checked = syncColorsEnabled;
  const syncAudioEnabled = loadSyncAudioSetting();
  toggleSyncAudio.checked = syncAudioEnabled;
  setSyncAudioEnabled(syncAudioEnabled);
  let showPropBubbles = loadShowPropBubblesSetting();
  let showToolbar = loadShowToolbarSetting();

  applyPropBubblesVisibility(showPropBubbles);
  applyToolbarVisibility(showToolbar);

  const updatePropToggleUI = () => {
    btnToggleProps.innerHTML = `<i data-feather="${showPropBubbles ? "eye" : "eye-off"}"></i>`;
    setTooltip(
      btnToggleProps,
      showPropBubbles ? "Hide prop bubbles" : "Show prop bubbles",
    );
    btnToggleProps.classList.toggle("active", !showPropBubbles);
  };

  const updateToolbarToggleUI = () => {
    setTooltip(btnToggleToolbar, showToolbar ? "Hide toolbar" : "Show toolbar");
    btnToggleToolbar.classList.toggle("active", !showToolbar);
  };

  updatePropToggleUI();
  updateToolbarToggleUI();
  refreshFeatherIcons();

  btnSettings.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle("visible");
  });

  document.addEventListener("click", (e) => {
    if (
      settingsPanel.classList.contains("visible") &&
      !settingsPanel.contains(e.target as Node) &&
      e.target !== btnSettings
    ) {
      settingsPanel.classList.remove("visible");
    }
  });

  toggleSyncColors.addEventListener("change", () => {
    const newValue = toggleSyncColors.checked;
    syncColorsEnabled = newValue;
    saveSyncColorsSetting(newValue);

    if (!newValue) {
      forceResync();
    }

    for (const callback of syncColorsChangeCallbacks) {
      callback(newValue);
    }
  });

  toggleSyncAudio.addEventListener("change", () => {
    const enabled = toggleSyncAudio.checked;
    setSyncAudioEnabled(enabled);
    saveSyncAudioSetting(enabled);
  });

  btnToggleProps.addEventListener("click", (e) => {
    e.stopPropagation();
    showPropBubbles = !showPropBubbles;
    applyPropBubblesVisibility(showPropBubbles);
    saveShowPropBubblesSetting(showPropBubbles);
    updatePropToggleUI();
    refreshFeatherIcons();
  });

  btnToggleToolbar.addEventListener("click", (e) => {
    e.stopPropagation();
    showToolbar = !showToolbar;
    applyToolbarVisibility(showToolbar);
    saveShowToolbarSetting(showToolbar);
    updateToolbarToggleUI();
  });
}
