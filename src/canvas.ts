import { persistence } from "./persistence.ts";

const container = document.getElementById("canvas-container")!;
const world = document.getElementById("canvas-world")!;

let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartOffsetX = 0;
let panStartOffsetY = 0;
let viewportSaveTimeout: number | null = null;

function applyTransform() {
  world.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
}

export function restoreViewport(x: number, y: number) {
  offsetX = x;
  offsetY = y;
  applyTransform();
}

container.addEventListener("pointerdown", (e) => {
  // Only pan if clicking directly on the container or world (not on an item)
  if (e.target !== container && e.target !== world) return;
  // Only left mouse button
  if (e.button !== 0) return;

  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartOffsetX = offsetX;
  panStartOffsetY = offsetY;
  container.classList.add("panning");
  container.setPointerCapture(e.pointerId);
});

container.addEventListener("pointermove", (e) => {
  if (!isPanning) return;
  offsetX = panStartOffsetX + (e.clientX - panStartX);
  offsetY = panStartOffsetY + (e.clientY - panStartY);
  applyTransform();
});

container.addEventListener("pointerup", (e) => {
  if (!isPanning) return;
  isPanning = false;
  container.classList.remove("panning");
  container.releasePointerCapture(e.pointerId);

  // Debounced viewport persistence (1000ms)
  if (viewportSaveTimeout !== null) {
    clearTimeout(viewportSaveTimeout);
  }
  viewportSaveTimeout = setTimeout(() => {
    persistence.updateViewport(offsetX, offsetY);
    viewportSaveTimeout = null;
  }, 1000) as unknown as number;
});

export function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: screenX - offsetX,
    y: screenY - offsetY,
  };
}

export function addItemToCanvas(element: HTMLElement, worldX: number, worldY: number) {
  element.style.left = `${worldX}px`;
  element.style.top = `${worldY}px`;
  world.appendChild(element);
}

export function isPanningNow(): boolean {
  return isPanning;
}
