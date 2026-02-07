import { addItemToCanvas } from "./canvas.ts";
import { makeDraggable } from "./drag.ts";
import { createSoundboard } from "./soundboard.ts";
import { createTextbox } from "./textbox.ts";
import { persistence } from "./persistence.ts";

export interface CanvasItem {
  id: string;
  type: "soundboard" | "textbox";
  x: number;
  y: number;
  element: HTMLElement;
  cleanup?: () => void;
  loadAudioBuffer?: (buffer: AudioBuffer | null) => void; // For soundboard restoration
}

export const itemRegistry = new Map<string, CanvasItem>();

let nextId = 0;
let usePersistenceId = false;

export function generateId(): string {
  return `item-${nextId++}`;
}

export function allocatePersistenceId(): number {
  return persistence.getNextItemId();
}

export function setUsePersistenceId(use: boolean) {
  usePersistenceId = use;
}

export function createItem(type: CanvasItem["type"], x: number, y: number, existingId?: string): CanvasItem {
  console.log(`[Items] Creating ${type} at (${x}, ${y})${existingId ? ` with ID ${existingId}` : ""}`);
  const item = type === "soundboard" ? createSoundboard(x, y, existingId) : createTextbox(x, y, existingId);
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
        ? { name: "", hotkey: "", filters: { lowpass: 0, highpass: 0, reverb: 0, reversed: 0 } }
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
