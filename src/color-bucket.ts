import { persistence } from "./persistence.ts";
import { isSyncColorsEnabled, onSyncColorsChange } from "./settings.ts";

let paintMode = false;
let selectedColor = "#ff6b6b";
let cleanupCaptureListener: (() => void) | null = null;
let paintModeChangeCallbacks: Array<(active: boolean) => void> = [];

let btnBucket: HTMLButtonElement | null = null;
let colorInput: HTMLInputElement | null = null;

export function isPaintMode(): boolean {
  return paintMode;
}

export function onPaintModeChange(
  callback: (active: boolean) => void,
): () => void {
  paintModeChangeCallbacks.push(callback);
  return () => {
    paintModeChangeCallbacks = paintModeChangeCallbacks.filter(
      (cb) => cb !== callback,
    );
  };
}

export function exitPaintMode(): void {
  if (!paintMode) return;
  paintMode = false;
  btnBucket?.classList.remove("active");
  document.body.classList.remove("paint-mode");

  if (cleanupCaptureListener) {
    cleanupCaptureListener();
    cleanupCaptureListener = null;
  }

  for (const cb of paintModeChangeCallbacks) {
    cb(false);
  }
}

function enterPaintMode(): void {
  paintMode = true;
  btnBucket?.classList.add("active");
  document.body.classList.add("paint-mode");

  for (const cb of paintModeChangeCallbacks) {
    cb(true);
  }

  const handler = (e: MouseEvent) => {
    if (!paintMode) return;

    const target = e.target as HTMLElement;

    // Check if clicking a soundboard bubble
    const bubble = target.closest(".soundboard-bubble") as HTMLElement | null;
    if (bubble) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const wrapper = bubble.closest(
        ".soundboard-wrapper",
      ) as HTMLElement | null;
      const itemId = wrapper?.dataset.itemId;
      if (itemId) {
        persistence.updateItemColor(itemId, selectedColor);
      }
      return;
    }

    // Check if clicking background
    const canvasContainer = document.getElementById("canvas-container");
    const canvasWorld = document.getElementById("canvas-world");
    if (target === canvasContainer || target === canvasWorld) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      persistence.updateBackgroundColor(selectedColor);
      return;
    }

    // Clicking anything else exits paint mode without intercepting
  };

  document.addEventListener("click", handler, true);
  cleanupCaptureListener = () => {
    document.removeEventListener("click", handler, true);
  };
}

function updateBucketEnabled(enabled: boolean): void {
  if (!btnBucket) return;
  if (enabled) {
    btnBucket.removeAttribute("disabled");
    btnBucket.title = "Color bucket";
  } else {
    btnBucket.setAttribute("disabled", "true");
    btnBucket.title = "Enable 'Sync Colors' in settings to use";
  }
}

function updateBucketColorIndicator(): void {
  if (!btnBucket) return;
  const bucketIcon = btnBucket.querySelector(".bucket-icon") as SVGElement | null;
  if (bucketIcon) {
    bucketIcon.style.color = selectedColor;
  }
}

export function initColorBucket(inRoom: boolean): void {
  btnBucket = document.getElementById(
    "btn-color-bucket",
  ) as HTMLButtonElement | null;
  colorInput = document.getElementById(
    "color-picker-input",
  ) as HTMLInputElement | null;

  if (!btnBucket || !colorInput) {
    console.warn("[ColorBucket] Color bucket elements not found in DOM");
    return;
  }

  // In solo mode, bucket is always enabled. In a room, it depends on sync colors setting.
  const enabled = inRoom ? isSyncColorsEnabled() : true;
  updateBucketEnabled(enabled);
  updateBucketColorIndicator();

  if (inRoom) {
    onSyncColorsChange((syncEnabled) => {
      updateBucketEnabled(syncEnabled);
      if (!syncEnabled && paintMode) {
        exitPaintMode();
      }
    });
  }

  btnBucket.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btnBucket!.hasAttribute("disabled")) return;

    if (paintMode) {
      exitPaintMode();
      return;
    }

    // Open the native color picker
    colorInput!.click();
  });

  colorInput.addEventListener("input", (e) => {
    selectedColor = (e.target as HTMLInputElement).value;
    updateBucketColorIndicator();
  });

  colorInput.addEventListener("change", (e) => {
    selectedColor = (e.target as HTMLInputElement).value;
    updateBucketColorIndicator();
    enterPaintMode();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && paintMode) {
      exitPaintMode();
    }
  });
}
