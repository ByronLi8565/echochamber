import { addItemToCanvas } from "./canvas.ts";
import { makeDraggable } from "./drag.ts";
import { createSoundboard } from "./soundboard.ts";
import { createTextbox } from "./textbox.ts";
import { persistence } from "./persistence.ts";
import { loadAudio, saveAudio } from "./audio-storage.ts";
import { uploadAudio } from "./audio-sync.ts";

export interface CanvasItem {
  id: string;
  type: "soundboard" | "textbox";
  x: number;
  y: number;
  element: HTMLElement;
  cleanup?: () => void;
  loadAudioBuffer?: (buffer: AudioBuffer | null) => void; // For soundboard restoration
  play?: (fromRemote?: boolean) => void;
  hotkey?: string;
  name?: string;
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
    persistence.addItem(item.id, {
      type: item.type,
      x: item.x,
      y: item.y,
      width: rect.width,
      height: rect.height,
      ...(type === "soundboard"
        ? {
            name: (item as any).name || "",
            hotkey: (item as any).hotkey || "",
            filters: {
              slowIntensity: 0,
              reverbIntensity: 0,
              speedIntensity: 0,
              reversed: 0,
              loopEnabled: 0,
              loopDelaySeconds: 0,
              repeatCount: 1,
              repeatDelaySeconds: 0,
            },
          }
        : { text: "Click to edit" }),
    } as any);
    console.log(`[Items] Item ${item.id} persisted to storage`);
  }

  return item;
}

export function removeItem(id: string) {
  const item = itemRegistry.get(id);
  if (!item) return;

  // Cleanup subscriptions
  if (item.cleanup) item.cleanup();
  if ((item as any).cleanupDrag) (item as any).cleanupDrag();

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

  const copy = createItem(sourceItem.type, sourceItem.x + 24, sourceItem.y + 24);

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
