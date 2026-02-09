import type { CanvasItem } from "./items.ts";
import { generateId } from "./items.ts";
import { persistence } from "../sync/persistence.ts";

export function createTextbox(x: number, y: number, existingId?: string): CanvasItem {
  const id = existingId || generateId();
  console.log(`[Textbox] Creating textbox ${id}`);

  const el = document.createElement("div");
  el.className = "canvas-item textbox-item";
  el.contentEditable = "false";
  el.textContent = "Click to edit";
  el.dataset.itemId = id;

  let unsubscribe: (() => void) | null = null;

  // Double-click to enter edit mode
  el.addEventListener("dblclick", (e) => {
    console.log(`[Textbox ${id}] Double-clicked, entering edit mode`);
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

    // Persist text changes
    persistence.updateTextboxText(id, el.textContent || "Click to edit");
  });

  // Prevent drag from starting while editing
  el.addEventListener("pointerdown", (e) => {
    if (el.contentEditable === "true") {
      e.stopPropagation();
    }
  });

  // Subscribe to Automerge changes
  unsubscribe = persistence.subscribeToItem(id, (itemData) => {
    if (!itemData || itemData.type !== 'textbox') return;

    // Only update if not currently editing
    if (el.contentEditable === "false" && itemData.text !== el.textContent) {
      el.textContent = itemData.text;
    }
  });

  // --- Cleanup function ---
  function cleanup() {
    if (unsubscribe) unsubscribe();
  }

  return { id, type: "textbox", x, y, element: el, cleanup };
}
