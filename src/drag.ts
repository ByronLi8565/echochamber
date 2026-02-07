import type { CanvasItem } from "./items.ts";

const DRAG_THRESHOLD = 4;

export function makeDraggable(item: CanvasItem) {
  const el = item.element;
  let isDragging = false;
  let didDrag = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let itemStartX = 0;
  let itemStartY = 0;

  el.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    if (target.isContentEditable) return;
    if (e.button !== 0) return;

    isDragging = true;
    didDrag = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    itemStartX = item.x;
    itemStartY = item.y;
    el.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });

  el.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (!didDrag && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
      didDrag = true;
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
    if (didDrag) {
      el.dataset.dragged = "1";
    }
    el.releasePointerCapture(e.pointerId);
    e.stopPropagation();
  });
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
