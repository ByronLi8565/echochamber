import {
  ScopedListeners,
  getTouchCenter,
  getTouchDistance,
} from "./utils.ts";

const container = document.getElementById("canvas-container")!;
const world = document.getElementById("canvas-world")!;

interface GestureState {
  offsetX: number;
  offsetY: number;
  scale: number;
  isPinching: boolean;
  pinchStartDistance: number;
  pinchStartScale: number;
  pinchCenterX: number;
  pinchCenterY: number;
  lastTouchX: number;
  lastTouchY: number;
  isSwiping: boolean;
}

const state: GestureState = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  isPinching: false,
  pinchStartDistance: 0,
  pinchStartScale: 1,
  pinchCenterX: 0,
  pinchCenterY: 0,
  lastTouchX: 0,
  lastTouchY: 0,
  isSwiping: false,
};

const gestureListeners = new ScopedListeners();

function applyTransform() {
  world.style.transformOrigin = "0 0";
  world.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
}

function clampScale(nextScale: number): number {
  return Math.min(2.5, Math.max(0.5, nextScale));
}

export function initMobileGestures(
  currentOffsetX: number,
  currentOffsetY: number,
  currentScale: number,
  onTransformChange: (offsetX: number, offsetY: number, scale: number) => void,
) {
  state.offsetX = currentOffsetX;
  state.offsetY = currentOffsetY;
  state.scale = currentScale;

  gestureListeners.dispose();

  // Touch start - handle both pinch and swipe
  gestureListeners.listen<TouchEvent>(container, "touchstart", (e) => {
    // Don't handle gestures if touching a canvas item
    const target = e.target as HTMLElement;
    if (target.closest(".canvas-item")) {
      return;
    }

    if (e.touches.length === 2) {
      // Start pinch
      e.preventDefault();
      state.isPinching = true;
      state.pinchStartDistance = getTouchDistance(e.touches[0]!, e.touches[1]!);
      state.pinchStartScale = state.scale;
      const center = getTouchCenter(e.touches[0]!, e.touches[1]!);
      state.pinchCenterX = center.x;
      state.pinchCenterY = center.y;
    } else if (e.touches.length === 1) {
      // Start potential swipe/pan
      const touch = e.touches[0]!;
      state.isSwiping = true;
      state.lastTouchX = touch.clientX;
      state.lastTouchY = touch.clientY;
    }
  }, { passive: false });

  // Touch move - handle pinch zoom and swipe pan
  gestureListeners.listen<TouchEvent>(container, "touchmove", (e) => {
    if (state.isPinching && e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = getTouchDistance(e.touches[0]!, e.touches[1]!);
      const scaleFactor = currentDistance / state.pinchStartDistance;
      const newScale = clampScale(state.pinchStartScale * scaleFactor);

      // Calculate zoom centered on pinch center
      const worldXAtCenter = (state.pinchCenterX - state.offsetX) / state.scale;
      const worldYAtCenter = (state.pinchCenterY - state.offsetY) / state.scale;

      state.scale = newScale;
      state.offsetX = state.pinchCenterX - worldXAtCenter * state.scale;
      state.offsetY = state.pinchCenterY - worldYAtCenter * state.scale;

      applyTransform();
      onTransformChange(state.offsetX, state.offsetY, state.scale);
    } else if (state.isSwiping && e.touches.length === 1) {
      // Handle swipe panning
      const touch = e.touches[0]!;
      const dx = touch.clientX - state.lastTouchX;
      const dy = touch.clientY - state.lastTouchY;

      state.offsetX += dx;
      state.offsetY += dy;
      state.lastTouchX = touch.clientX;
      state.lastTouchY = touch.clientY;

      applyTransform();
      onTransformChange(state.offsetX, state.offsetY, state.scale);
    }
  }, { passive: false });

  // Touch end/cancel
  gestureListeners.listen<TouchEvent>(container, "touchend", () => {
    state.isPinching = false;
    state.isSwiping = false;
  });

  gestureListeners.listen<TouchEvent>(container, "touchcancel", () => {
    state.isPinching = false;
    state.isSwiping = false;
  });

  // Wheel zoom for trackpad/desktop
  gestureListeners.listen<WheelEvent>(container, "wheel", (e) => {
    // Only zoom if not on a canvas item
    const target = e.target as HTMLElement;
    if (target.closest(".canvas-item")) {
      return;
    }

    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const cx = e.clientX;
    const cy = e.clientY;
    const worldXAtCenter = (cx - state.offsetX) / state.scale;
    const worldYAtCenter = (cy - state.offsetY) / state.scale;

    state.scale = clampScale(state.scale * zoomFactor);
    state.offsetX = cx - worldXAtCenter * state.scale;
    state.offsetY = cy - worldYAtCenter * state.scale;

    applyTransform();
    onTransformChange(state.offsetX, state.offsetY, state.scale);
  }, { passive: false });
}

export function updateGestureState(
  offsetX: number,
  offsetY: number,
  scale: number,
) {
  state.offsetX = offsetX;
  state.offsetY = offsetY;
  state.scale = scale;
}

export function disposeMobileGestures() {
  gestureListeners.dispose();
}
