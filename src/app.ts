import "./canvas.ts";
import { screenToWorld, isPanningNow, restoreViewport } from "./canvas.ts";
import {
  createItem,
  removeItem,
  itemRegistry,
  setUsePersistenceId,
  type CanvasItem,
} from "./items.ts";
import { hotkeyRegistry } from "./soundboard.ts";
import { persistence } from "./persistence.ts";
import { loadAudio, setAudioStorageRoom } from "./audio-storage.ts";
import { startSync, setSyncAudioEnabled } from "./sync.ts";
import { initDeployModal } from "./deploy-modal.ts";
import {
  setAudioSyncRoom,
  markAudioKeyKnown,
  checkForNewAudioKeys,
} from "./audio-sync.ts";
import {
  initColorBucket,
  exitPaintMode,
  onPaintModeChange,
} from "./color-bucket.ts";
import {
  initSettings,
  isSyncColorsEnabled,
  onSyncColorsChange,
} from "./settings.ts";
import type { ThemeData } from "./persistence.ts";

const container = document.getElementById("canvas-container")!;
const btnAddSound = document.getElementById("btn-add-sound")!;
const btnAddText = document.getElementById("btn-add-text")!;
const btnExport = document.getElementById("btn-export")!;
const btnImport = document.getElementById("btn-import")!;
const settingsMenu = document.getElementById("settings-menu");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const syncAudioToggle = document.getElementById(
  "toggle-sync-audio",
) as HTMLInputElement | null;

const SYNC_AUDIO_STORAGE_KEY = "echochamber-sync-audio-enabled";

function readSyncAudioSetting(): boolean {
  return localStorage.getItem(SYNC_AUDIO_STORAGE_KEY) === "1";
}

function applySyncAudioSetting(enabled: boolean): void {
  setSyncAudioEnabled(enabled);
  if (syncAudioToggle) {
    syncAudioToggle.checked = enabled;
  }
  localStorage.setItem(SYNC_AUDIO_STORAGE_KEY, enabled ? "1" : "0");
}

function initSettingsMenu(): void {
  const initialSyncAudio = readSyncAudioSetting();
  applySyncAudioSetting(initialSyncAudio);

  settingsToggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPanel?.classList.toggle("hidden");
  });

  syncAudioToggle?.addEventListener("change", () => {
    applySyncAudioSetting(syncAudioToggle.checked);
  });

  document.addEventListener("pointerdown", (e) => {
    if (!settingsMenu) return;
    if (settingsPanel?.classList.contains("hidden")) return;
    const target = e.target as Node | null;
    if (target && !settingsMenu.contains(target)) {
      settingsPanel.classList.add("hidden");
    }
  });
}

// --- Placement mode ---

let placementMode: CanvasItem["type"] | null = null;

function setPlacementMode(type: CanvasItem["type"] | null) {
  if (type !== null) exitPaintMode();
  console.log(`[PlacementMode] Changed from "${placementMode}" to "${type}"`);
  placementMode = type;
  btnAddSound.classList.toggle("active", type === "soundboard");
  btnAddText.classList.toggle("active", type === "textbox");
  container.classList.toggle("placing", type !== null);
}

btnAddSound.addEventListener("click", () => {
  console.log("[Button] Add Sound button clicked");
  setPlacementMode(placementMode === "soundboard" ? null : "soundboard");
});

btnAddText.addEventListener("click", () => {
  console.log("[Button] Add Text button clicked");
  setPlacementMode(placementMode === "textbox" ? null : "textbox");
});

container.addEventListener("pointerup", (e) => {
  console.log("[Canvas] Pointer up event", {
    placementMode,
    isPanning: isPanningNow(),
    target: e.target,
    container,
    world: document.getElementById("canvas-world"),
  });

  if (!placementMode) {
    console.log("[Canvas] No placement mode active, ignoring click");
    return;
  }
  if (isPanningNow()) {
    console.log("[Canvas] Currently panning, ignoring click");
    return;
  }
  if (
    e.target !== container &&
    e.target !== document.getElementById("canvas-world")
  ) {
    console.log("[Canvas] Click target not valid for placement, ignoring");
    return;
  }
  if (!persistence.canApplyLocalEdits()) {
    console.log(
      "[Canvas] Waiting for first sync snapshot, ignoring local create",
    );
    return;
  }

  const { x, y } = screenToWorld(e.clientX, e.clientY);
  console.log(`[Canvas] Creating ${placementMode} at (${x}, ${y})`);
  createItem(placementMode, x, y);
  setPlacementMode(null);
});

// --- Keyboard hotkeys ---

document.addEventListener("keydown", (e) => {
  // Don't trigger hotkeys while typing in editable fields
  const active = document.activeElement as HTMLElement | null;
  if (active?.isContentEditable) return;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  )
    return;

  const key = e.key.toUpperCase();
  const handler = hotkeyRegistry.get(key);
  if (handler) {
    console.log(`[Hotkey] Triggered hotkey: ${key}`);
    e.preventDefault();
    handler();
  }
});

// --- Paint mode / placement mode mutual exclusion ---

onPaintModeChange((active) => {
  if (active && placementMode !== null) {
    setPlacementMode(null);
  }
});

// --- Theme rendering ---

function applyItemColor(itemId: string, color: string): void {
  const item = itemRegistry.get(itemId);
  if (!item) return;
  const bubble = item.element.querySelector(
    ".soundboard-bubble",
  ) as HTMLElement | null;
  if (bubble) {
    bubble.style.background = color;
    bubble.style.borderColor = color;
  }
}

function clearItemColor(itemId: string): void {
  const item = itemRegistry.get(itemId);
  if (!item) return;
  const bubble = item.element.querySelector(
    ".soundboard-bubble",
  ) as HTMLElement | null;
  if (bubble) {
    bubble.style.background = "";
    bubble.style.borderColor = "";
  }
}

function applyThemeToUI(theme: ThemeData): void {
  if (!isSyncColorsEnabled()) return;

  if (theme.backgroundColor) {
    document.body.style.background = theme.backgroundColor;
    container.style.background = theme.backgroundColor;
  } else {
    document.body.style.background = "";
    container.style.background = "";
  }

  for (const [itemId, color] of Object.entries(theme.itemColors ?? {})) {
    applyItemColor(itemId, color);
  }

  // Clear colors for items not in theme
  for (const [itemId] of itemRegistry) {
    if (!theme.itemColors?.[itemId]) {
      clearItemColor(itemId);
    }
  }
}

function clearAllThemeRendering(): void {
  document.body.style.background = "";
  container.style.background = "";
  for (const [itemId] of itemRegistry) {
    clearItemColor(itemId);
  }
}

// --- Room code parsing ---

function getRoomCodeFromURL(): string | null {
  const match = window.location.pathname.match(
    /^\/((?:[a-z0-9]{8}|[a-z]{3,10}-[a-z]{3,10}-[a-z]{3,10}))$/,
  );
  return match ? match[1]! : null;
}

// --- Connection status indicator ---

function updateConnectionStatus(connected: boolean) {
  const wrapper = document.getElementById("connection-wrapper");
  const indicator = document.getElementById("connection-status");
  if (wrapper && connected) {
    wrapper.style.display = "flex";
  }
  if (indicator) {
    indicator.classList.toggle("connected", connected);
    indicator.classList.toggle("disconnected", !connected);
    indicator.title = connected ? "Synced" : "Disconnected";
  }
}

// --- App initialization ---

async function initializeApp() {
  initSettingsMenu();

  // Enable persistence ID generation
  setUsePersistenceId(true);

  // Check if we're joining a room — if so, discard local state so the
  // DO's doc becomes the single source of truth (no merge with stale local data).
  const roomCode = getRoomCodeFromURL();
  setAudioStorageRoom(roomCode);
  if (roomCode) {
    persistence.resetForRoom();
  }

  const doc = persistence.getDoc();

  // Viewport is local-only (not in CRDT)
  const viewport = persistence.getViewport();
  restoreViewport(viewport.offsetX, viewport.offsetY);

  // Recreate all items from local doc (empty when joining a room)
  const audioContext = new AudioContext();
  for (const [itemId, itemData] of Object.entries(doc.items ?? {})) {
    const item = createItem(itemData.type, itemData.x, itemData.y, itemId);

    // For soundboards, load audio buffer (transient state, not in Automerge)
    if (itemData.type === "soundboard" && item.loadAudioBuffer) {
      const audioKey = doc.audioFiles[itemId];
      let audioBuffer = null;
      if (audioKey) {
        audioBuffer = await loadAudio(audioKey, audioContext);
        if (audioBuffer) {
          markAudioKeyKnown(audioKey);
        }
      }
      item.loadAudioBuffer(audioBuffer);
    }

    // All other state (filters, hotkey, name, text, position) is loaded via subscriptions
  }

  console.log(
    `[App] Restored ${Object.keys(doc.items ?? {}).length} items from persistence`,
  );

  // --- Sync setup ---
  if (roomCode) {
    if (!persistence.canApplyLocalEdits()) {
      btnAddSound.setAttribute("disabled", "true");
      btnAddText.setAttribute("disabled", "true");
    }

    persistence.enableSync();
    setAudioSyncRoom(roomCode);

    // Global subscription to reconcile DOM with remote doc changes
    persistence.subscribeGlobal((doc) => {
      if (persistence.canApplyLocalEdits()) {
        btnAddSound.removeAttribute("disabled");
        btnAddText.removeAttribute("disabled");
      }

      const docItemIds = new Set(Object.keys(doc.items));
      const registryIds = new Set(itemRegistry.keys());

      console.log(
        `[Sync] Reconciling: doc has ${docItemIds.size} items, registry has ${registryIds.size} items`,
      );
      console.log(`[Sync] Doc items:`, Array.from(docItemIds));
      console.log(`[Sync] Registry items:`, Array.from(registryIds));

      // Create items that are in the doc but not in the registry (remote additions)
      for (const itemId of docItemIds) {
        if (!registryIds.has(itemId)) {
          const itemData = doc.items[itemId]!;
          console.log(
            `[Sync] Creating remote item ${itemId} (${itemData.type})`,
          );
          createItem(itemData.type, itemData.x, itemData.y, itemId);

          // Apply theme color to newly created remote item
          if (isSyncColorsEnabled()) {
            const color = doc.theme?.itemColors?.[itemId];
            if (color) {
              queueMicrotask(() => applyItemColor(itemId, color));
            }
          }
        }
      }

      // Remove items that are in the registry but not in the doc (remote deletions)
      for (const itemId of registryIds) {
        if (!docItemIds.has(itemId)) {
          console.log(`[Sync] Removing remotely-deleted item ${itemId}`);
          const item = itemRegistry.get(itemId);
          if (item) {
            if (item.cleanup) item.cleanup();
            if ((item as any).cleanupDrag) (item as any).cleanupDrag();
            item.element.remove();
            itemRegistry.delete(itemId);
          }
        }
      }

      // Download audio for new/updated remote items
      checkForNewAudioKeys(doc.audioFiles);
    });

    startSync(
      {
        roomCode,
        getDoc: () => persistence.getDoc(),
        applyRemoteDoc: (newDoc) => persistence.applyRemoteDoc(newDoc),
        onRemoteAudioPlay: (itemId) => {
          const item = itemRegistry.get(itemId);
          item?.play?.(true);
        },
        onConnected: () => updateConnectionStatus(true),
        onDisconnected: () => updateConnectionStatus(false),
      },
      true,
    ); // true = joining existing room

    const wrapperEl = document.getElementById("connection-wrapper");
    if (wrapperEl) wrapperEl.style.display = "flex";
  }

  // --- Deploy modal ---
  initDeployModal(roomCode);

  // --- Settings & color bucket ---
  initSettings();
  initColorBucket(!!roomCode);

  // Subscribe to theme changes
  persistence.subscribeToTheme((theme) => {
    if (isSyncColorsEnabled()) {
      applyThemeToUI(theme);
    }
  });

  // Handle sync colors toggle
  onSyncColorsChange((enabled) => {
    if (enabled) {
      const doc = persistence.getDoc();
      applyThemeToUI(doc.theme ?? { itemColors: {} });
    } else {
      clearAllThemeRendering();
    }
  });

  console.log("[App] Initialization complete");

  // Initialize Feather icons
  if (typeof (window as any).feather !== "undefined") {
    (window as any).feather.replace();
  }
}

// --- Export/Import ---

btnExport.addEventListener("click", async () => {
  console.log("[Button] Export button clicked");
  try {
    const blob = await persistence.exportToFile();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echochamber-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    console.log("[Export] Successfully exported soundboard");
  } catch (error) {
    console.error("[Export] Export failed:", error);
    alert("Failed to export soundboard");
  }
});

btnImport.addEventListener("click", () => {
  console.log("[Button] Import button clicked");
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".zip";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    console.log("[Import] File selected:", file.name);
    try {
      await persistence.importFromFile(file);
      console.log("[Import] Successfully imported soundboard");
      // Page will reload automatically after import
    } catch (error) {
      console.error("[Import] Import failed:", error);
      alert("Failed to import soundboard");
    }
  });
  input.click();
});

// Start the app
console.log("[App] Starting EchoChamber initialization...");
initializeApp();
