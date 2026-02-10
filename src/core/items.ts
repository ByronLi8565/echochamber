import { addItemToCanvas } from "./canvas.ts";
import { makeDraggable } from "./actions/drag.ts";
import { createSoundboard } from "./soundboard/index.ts";
import { createTextbox } from "./textbox.ts";
import { persistence } from "../sync/persistence.ts";
import { loadAudio, saveAudio } from "../sync/audio-storage.ts";
import { uploadAudio } from "../sync/audio-sync.ts";

// Base interface shared by all canvas items
interface BaseCanvasItem {
  id: string;
  type: "soundboard" | "textbox";
  x: number;
  y: number;
  element: HTMLElement;
  cleanup?: () => void;
  cleanupDrag?: () => void; // Added by makeDraggable
}

// Soundboard-specific item
export interface SoundboardItem extends BaseCanvasItem {
  type: "soundboard";
  loadAudioBuffer: (buffer: AudioBuffer | null) => void;
  play: (fromRemote?: boolean) => void;
  hotkey: string;
  name: string;
}

// Textbox-specific item
export interface TextboxItem extends BaseCanvasItem {
  type: "textbox";
}

// Discriminated union of all canvas item types
export type CanvasItem = SoundboardItem | TextboxItem;

// Type guards
export function isSoundboardItem(item: CanvasItem): item is SoundboardItem {
  return item.type === "soundboard";
}

export function isTextboxItem(item: CanvasItem): item is TextboxItem {
  return item.type === "textbox";
}

export const itemRegistry = new Map<string, CanvasItem>();

let nextId = 0;
let usePersistenceId = false;

export function generateId(): string {
  // Use persistence ID if enabled to avoid conflicts across clients
  if (usePersistenceId) {
    return persistence.getNextItemId();
  }
  return `item-${nextId++}`;
}

export function allocatePersistenceId(): string {
  return persistence.getNextItemId();
}

export function setUsePersistenceId(use: boolean) {
  usePersistenceId = use;
}

export function createItem(
  type: CanvasItem["type"],
  x: number,
  y: number,
  existingId?: string,
): CanvasItem {
  if (usePersistenceId && !existingId && !persistence.canApplyLocalEdits()) {
    throw new Error(
      "Local edits are blocked until the first sync snapshot arrives",
    );
  }

  console.log(
    `[Items] Creating ${type} at (${x}, ${y})${existingId ? ` with ID ${existingId}` : ""}`,
  );
  const item =
    type === "soundboard"
      ? createSoundboard(x, y, existingId)
      : createTextbox(x, y, existingId);
  itemRegistry.set(item.id, item);
  console.log(`[Items] Item ${item.id} added to registry`);
  makeDraggable(item);
  addItemToCanvas(item.element, item.x, item.y);
  console.log(`[Items] Item ${item.id} added to canvas`);

  // Persist item creation (only for new items, not restored ones)
  if (usePersistenceId && !existingId) {
    const rect = item.element.getBoundingClientRect();
    if (type === "soundboard" && isSoundboardItem(item)) {
      persistence.addItem(item.id, {
        type: "soundboard",
        x: item.x,
        y: item.y,
        width: rect.width,
        height: rect.height,
        name: item.name || "",
        hotkey: item.hotkey || "",
        filters: {
          speedRate: 1,
          reverbIntensity: 0,
          reversed: 0,
          playConcurrently: 0,
          loopEnabled: 0,
          loopDelaySeconds: 0,
          repeatCount: 1,
          repeatDelaySeconds: 0,
        },
      });
    } else {
      persistence.addItem(item.id, {
        type: "textbox",
        x: item.x,
        y: item.y,
        width: rect.width,
        height: rect.height,
        text: "Click to edit",
      });
    }
    console.log(`[Items] Item ${item.id} persisted to storage`);
  }

  return item;
}

export function removeItem(id: string) {
  const item = itemRegistry.get(id);
  if (!item) return;

  // Cleanup subscriptions
  if (item.cleanup) item.cleanup();
  if (item.cleanupDrag) item.cleanupDrag();

  item.element.remove();
  itemRegistry.delete(id);

  // Persist item removal
  if (usePersistenceId) {
    persistence.removeItem(id);
  }
}

export async function duplicateItem(id: string): Promise<CanvasItem | null> {
  const sourceItem = itemRegistry.get(id);
  if (!sourceItem) return null;

  const sourceData = persistence.getDoc().items?.[id];
  if (!sourceData) return null;

  const copy = createItem(
    sourceItem.type,
    sourceItem.x + 24,
    sourceItem.y + 24,
  );

  if (sourceData.type === "soundboard" && copy.type === "soundboard") {
    persistence.updateSoundboardName(copy.id, `${sourceData.name} Copy`);
    persistence.updateSoundboardFilters(copy.id, { ...sourceData.filters });

    const sourceColor = persistence.getDoc().theme?.itemColors?.[id];
    if (sourceColor) {
      persistence.updateItemColor(copy.id, sourceColor);
    }

    const sourceAudioKey = persistence.getDoc().audioFiles?.[id];
    if (sourceAudioKey && copy.loadAudioBuffer) {
      const audioCtx = new AudioContext();
      const buffer = await loadAudio(sourceAudioKey, audioCtx);
      if (buffer) {
        const newAudioKey = `audio-${copy.id}-${Date.now()}`;
        await saveAudio(newAudioKey, buffer);
        persistence.setAudioFile(copy.id, newAudioKey);
        copy.loadAudioBuffer(buffer);
        await uploadAudio(copy.id, buffer);
      }
    }
  }

  if (sourceData.type === "textbox" && copy.type === "textbox") {
    persistence.updateTextboxText(copy.id, sourceData.text);
  }

  return copy;
}
