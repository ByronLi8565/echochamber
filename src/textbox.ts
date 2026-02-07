import type { CanvasItem } from "./items.ts";
import { generateId } from "./items.ts";

export function createTextbox(x: number, y: number): CanvasItem {
  const id = generateId();

  const el = document.createElement("div");
  el.className = "canvas-item textbox-item";
  el.contentEditable = "false";
  el.textContent = "Click to edit";
  el.dataset.itemId = id;

  // Double-click to enter edit mode
  el.addEventListener("dblclick", (e) => {
    el.contentEditable = "true";
    el.focus();
    // Select all text on first edit
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection?.removeAllRanges();
    selection?.addRange(range);
    e.stopPropagation();
  });

  // Blur to exit edit mode
  el.addEventListener("blur", () => {
    el.contentEditable = "false";
    // If empty, restore placeholder
    if (!el.textContent?.trim()) {
      el.textContent = "Click to edit";
    }
  });

  // Prevent drag from starting while editing
  el.addEventListener("pointerdown", (e) => {
    if (el.contentEditable === "true") {
      e.stopPropagation();
    }
  });

  return { id, type: "textbox", x, y, element: el };
}
