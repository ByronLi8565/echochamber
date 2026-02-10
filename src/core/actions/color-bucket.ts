import { persistence } from "../../sync/persistence.ts";
import { isSyncColorsEnabled, onSyncColorsChange } from "../../ui/settings.ts";
import { invalidateLinksOverlay } from "./links.ts";
import {
  getReadableTextColor,
  updateSoundboardAdaptiveTextColor,
} from "../soundboard/index.ts";
import { ScopedListeners } from "../../util/utils.ts";

let paintMode = false;
let selectedColor = "#ff6b6b";
let paintModeScope: ScopedListeners | null = null;
let colorBucketScope: ScopedListeners | null = null;
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

  paintModeScope?.dispose();
  paintModeScope = null;

  for (const cb of paintModeChangeCallbacks) {
    cb(false);
  }
}

function applyImmediateBubblePaint(
  wrapper: HTMLElement,
  bubble: HTMLElement,
  color: string,
): void {
  const controls = wrapper.querySelectorAll(
    ".prop-bubble, .soundboard-action",
  ) as NodeListOf<HTMLElement>;
  const controlTextColor = getReadableTextColor(color) ?? "";

  bubble.style.background = color;
  bubble.style.borderColor = color;

  for (const control of controls) {
    control.style.background = color;
    control.style.borderColor = color;
    control.style.color = controlTextColor;
  }

  updateSoundboardAdaptiveTextColor();
}

function enterPaintMode(): void {
  paintMode = true;
  btnBucket?.classList.add("active");
  document.body.classList.add("paint-mode");
  paintModeScope?.dispose();
  paintModeScope = new ScopedListeners();

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
        invalidateLinksOverlay(true);
        if (wrapper) {
          applyImmediateBubblePaint(wrapper, bubble, selectedColor);
        }
        persistence.updateItemColor(itemId, selectedColor);
        exitPaintMode();
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

      document.body.style.background = selectedColor;
      if (canvasContainer instanceof HTMLElement) {
        canvasContainer.style.background = selectedColor;
      }
      persistence.updateBackgroundColor(selectedColor);
      requestAnimationFrame(() => {
        invalidateLinksOverlay();
      });
      exitPaintMode();
      return;
    }

    // Clicking anything else exits paint mode without intercepting
  };

  paintModeScope.listen<MouseEvent>(document, "click", handler, true);
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
  const bucketIcon = btnBucket.querySelector(
    ".bucket-icon",
  ) as SVGElement | null;
  if (bucketIcon) {
    bucketIcon.style.color = selectedColor;
  }
}

export function initColorBucket(inRoom: boolean): void {
  colorBucketScope?.dispose();
  colorBucketScope = new ScopedListeners();
  const scope = colorBucketScope;

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
    scope.addCleanup(
      onSyncColorsChange((syncEnabled) => {
        updateBucketEnabled(syncEnabled);
        if (!syncEnabled && paintMode) {
          exitPaintMode();
        }
      }),
    );
  }

  scope.listen<MouseEvent>(btnBucket, "click", (e) => {
    e.stopPropagation();
    if (btnBucket!.hasAttribute("disabled")) return;

    if (paintMode) {
      exitPaintMode();
      return;
    }

    // Open the native color picker
    colorInput!.click();
  });

  scope.listen<Event>(colorInput, "input", (e) => {
    selectedColor = (e.target as HTMLInputElement).value;
    updateBucketColorIndicator();
  });

  scope.listen<Event>(colorInput, "change", (e) => {
    selectedColor = (e.target as HTMLInputElement).value;
    updateBucketColorIndicator();
    enterPaintMode();
  });

  scope.listen<KeyboardEvent>(document, "keydown", (e) => {
    if (e.key === "Escape" && paintMode) {
      exitPaintMode();
    }
  });
}
