const container = document.getElementById("canvas-container")!;
const world = document.getElementById("canvas-world")!;

let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartOffsetX = 0;
let panStartOffsetY = 0;

function applyTransform() {
  world.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
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
