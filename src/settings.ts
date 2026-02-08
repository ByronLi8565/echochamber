import { forceResync } from "./sync.ts";

const SYNC_COLORS_KEY = "echochamber-sync-colors";

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

  if (!btnSettings || !settingsPanel || !toggleSyncColors) {
    console.warn("[Settings] Settings elements not found in DOM");
    return;
  }

  toggleSyncColors.checked = syncColorsEnabled;

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
}
