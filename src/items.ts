import { addItemToCanvas } from "./canvas.ts";
import { makeDraggable } from "./drag.ts";
import { createSoundboard } from "./soundboard.ts";
import { createTextbox } from "./textbox.ts";

export interface CanvasItem {
  id: string;
  type: "soundboard" | "textbox";
  x: number;
  y: number;
  element: HTMLElement;
}

export const itemRegistry = new Map<string, CanvasItem>();

let nextId = 0;

export function generateId(): string {
  return `item-${nextId++}`;
}

export function createItem(type: CanvasItem["type"], x: number, y: number): CanvasItem {
  const item = type === "soundboard" ? createSoundboard(x, y) : createTextbox(x, y);
  itemRegistry.set(item.id, item);
  makeDraggable(item);
  addItemToCanvas(item.element, item.x, item.y);
  return item;
}

export function removeItem(id: string) {
  const item = itemRegistry.get(id);
  if (!item) return;
  item.element.remove();
  itemRegistry.delete(id);
}
