import type { CanvasItem } from "./items.ts";
import { persistence } from "./persistence.ts";

const DRAG_THRESHOLD = 4;

// Global drag state to prevent multiple items from dragging at once
let currentlyDraggingId: string | null = null;
let highestZIndex = 1000;

export function makeDraggable(item: CanvasItem) {
  const el = item.element;
  let isDragging = false;
  let didDrag = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let itemStartX = 0;
  let itemStartY = 0;
  let pointerId = -1;
  let unsubscribe: (() => void) | null = null;

  // Initialize z-index
  el.style.zIndex = String(highestZIndex++);

  el.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    if (target.isContentEditable) return;
    if (e.button !== 0) return;

    // Prevent dragging if another item is already being dragged
    if (currentlyDraggingId && currentlyDraggingId !== item.id) {
      return;
    }

    // Only drag if this element is on top at the click location
    const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
    const topCanvasItem = elementsAtPoint.find((elem) => elem.classList.contains("canvas-item"));
    if (topCanvasItem !== el) {
      // Not the topmost item, don't drag
      return;
    }

    // Bring this item to the front
    el.style.zIndex = String(highestZIndex++);

    isDragging = true;
    currentlyDraggingId = item.id;
    didDrag = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    itemStartX = item.x;
    itemStartY = item.y;
    pointerId = e.pointerId;
    // Don't capture pointer yet - wait until we exceed drag threshold
    e.stopPropagation();
  });

  el.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (!didDrag && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
      didDrag = true;
      // Only capture pointer once we know user is dragging
      el.setPointerCapture(pointerId);
    }

    if (didDrag) {
      item.x = itemStartX + dx;
      item.y = itemStartY + dy;
      el.style.left = `${item.x}px`;
      el.style.top = `${item.y}px`;
    }
    e.stopPropagation();
  });

  el.addEventListener("pointerup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    currentlyDraggingId = null;
    if (didDrag) {
      el.dataset.dragged = "1";
      el.releasePointerCapture(e.pointerId);

      // Persist position change
      persistence.updateItemPosition(item.id, item.x, item.y);
    }
    e.stopPropagation();
  });

  el.addEventListener("pointercancel", () => {
    if (!isDragging) return;
    isDragging = false;
    currentlyDraggingId = null;
  });

  // Subscribe to position changes from Automerge
  unsubscribe = persistence.subscribeToItem(item.id, (itemData) => {
    if (!itemData) return;

    // Only update position if not currently dragging
    if (!isDragging && (itemData.x !== item.x || itemData.y !== item.y)) {
      item.x = itemData.x;
      item.y = itemData.y;
      el.style.left = `${item.x}px`;
      el.style.top = `${item.y}px`;
    }
  });

  // Store cleanup function on the item
  (item as any).cleanupDrag = () => {
    if (unsubscribe) unsubscribe();
  };
}

/** Returns true if a drag just finished (and clears the flag). Click handlers should call this to skip. */
export function consumeDrag(el: HTMLElement): boolean {
  const wrapper = el.closest("[data-dragged]") as HTMLElement | null;
  if (wrapper?.dataset.dragged) {
    delete wrapper.dataset.dragged;
    return true;
  }
  return false;
}
