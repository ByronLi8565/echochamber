import "./canvas.ts";
import { screenToWorld, isPanningNow } from "./canvas.ts";
import { createItem, type CanvasItem } from "./items.ts";
import { hotkeyRegistry } from "./soundboard.ts";

const container = document.getElementById("canvas-container")!;
const btnAddSound = document.getElementById("btn-add-sound")!;
const btnAddText = document.getElementById("btn-add-text")!;

// --- Placement mode ---

let placementMode: CanvasItem["type"] | null = null;

function setPlacementMode(type: CanvasItem["type"] | null) {
  placementMode = type;
  btnAddSound.classList.toggle("active", type === "soundboard");
  btnAddText.classList.toggle("active", type === "textbox");
  container.classList.toggle("placing", type !== null);
}

btnAddSound.addEventListener("click", () => {
  setPlacementMode(placementMode === "soundboard" ? null : "soundboard");
});

btnAddText.addEventListener("click", () => {
  setPlacementMode(placementMode === "textbox" ? null : "textbox");
});

container.addEventListener("pointerup", (e) => {
  if (!placementMode) return;
  if (isPanningNow()) return;
  if (e.target !== container && e.target !== document.getElementById("canvas-world")) return;

  const { x, y } = screenToWorld(e.clientX, e.clientY);
  createItem(placementMode, x, y);
  setPlacementMode(null);
});

// --- Keyboard hotkeys ---

document.addEventListener("keydown", (e) => {
  // Don't trigger hotkeys while typing in editable fields
  const active = document.activeElement as HTMLElement | null;
  if (active?.isContentEditable) return;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

  const key = e.key.toUpperCase();
  const handler = hotkeyRegistry.get(key);
  if (handler) {
    e.preventDefault();
    handler();
  }
});
