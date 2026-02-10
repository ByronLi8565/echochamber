import { persistence } from "../sync/persistence.ts";
import { ScopedListeners } from "../util/scoped-listeners.ts";

const container = document.getElementById("canvas-container")!;
const world = document.getElementById("canvas-world")!;

let offsetX = 0;
let offsetY = 0;
let scale = 1;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartOffsetX = 0;
let panStartOffsetY = 0;
let viewportSaveTimeout: number | null = null;
const canvasListeners = new ScopedListeners();

function applyTransform() {
  world.style.transformOrigin = "0 0";
  world.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

export function restoreViewport(x: number, y: number) {
  offsetX = x;
  offsetY = y;
  applyTransform();
}

canvasListeners.listen<PointerEvent>(container, "pointerdown", (e) => {
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

canvasListeners.listen<PointerEvent>(container, "pointermove", (e) => {
  if (!isPanning) return;
  offsetX = panStartOffsetX + (e.clientX - panStartX);
  offsetY = panStartOffsetY + (e.clientY - panStartY);
  applyTransform();
});

canvasListeners.listen<PointerEvent>(container, "pointerup", (e) => {
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
    x: (screenX - offsetX) / scale,
    y: (screenY - offsetY) / scale,
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

function clampScale(nextScale: number): number {
  return Math.min(2.5, Math.max(0.5, nextScale));
}

function zoomBy(factor: number): void {
  const cx = container.clientWidth / 2;
  const cy = container.clientHeight / 2;
  const worldXAtCenter = (cx - offsetX) / scale;
  const worldYAtCenter = (cy - offsetY) / scale;

  scale = clampScale(scale * factor);
  offsetX = cx - worldXAtCenter * scale;
  offsetY = cy - worldYAtCenter * scale;
  applyTransform();
}

export function zoomIn(): void {
  zoomBy(1.15);
}

export function zoomOut(): void {
  zoomBy(1 / 1.15);
}
