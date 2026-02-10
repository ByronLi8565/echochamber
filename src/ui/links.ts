import { Effect, Fiber } from "effect";
import { consumeDrag } from "../core/drag.ts";
import { persistence } from "../sync/persistence.ts";
import {
  getSequentialSoundboardSteps,
  type SequentialPlaybackStep,
} from "../util/soundboard-graph.ts";
import { runFork, runSync } from "../util/effect-runtime.ts";
import { ScopedListeners } from "../util/scoped-listeners.ts";

type ModeChangeCallback = (active: boolean) => void;
type PlaybackHandler = (fromRemote: boolean) => number;

const playbackHandlers = new Map<string, PlaybackHandler>();
const sequentialPlaybackFibers = new Map<string, Fiber.RuntimeFiber<void, never>>();
let linkMode = false;
let modeChangeCallbacks: ModeChangeCallback[] = [];
let selectedItemId: string | null = null;
let linkModeScope: ScopedListeners | null = null;
let linksScope: ScopedListeners | null = null;
let renderQueued = false;
let overlaySvg: SVGSVGElement | null = null;
let btnLink: HTMLButtonElement | null = null;

function escapeSelectorValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}

function getSoundboardBubble(itemId: string): HTMLElement | null {
  const escapedId = escapeSelectorValue(itemId);
  return document.querySelector(
    `.soundboard-wrapper[data-item-id="${escapedId}"] .soundboard-bubble`,
  ) as HTMLElement | null;
}

function clearSelectedBubbleClass(): void {
  if (!selectedItemId) return;
  getSoundboardBubble(selectedItemId)?.classList.remove("link-selected");
}

function setSelectedItem(itemId: string | null): void {
  if (selectedItemId === itemId) return;
  clearSelectedBubbleClass();
  selectedItemId = itemId;
  if (selectedItemId) {
    getSoundboardBubble(selectedItemId)?.classList.add("link-selected");
  }
}

function emitModeChange(active: boolean): void {
  for (const callback of modeChangeCallbacks) {
    callback(active);
  }
}

function renderLinksOverlay(): void {
  if (!overlaySvg) return;

  const container = document.getElementById("canvas-container");
  if (!container) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  overlaySvg.setAttribute("width", String(width));
  overlaySvg.setAttribute("height", String(height));
  overlaySvg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  overlaySvg.replaceChildren();
  const links = persistence.getLinks();
  if (links.length === 0) return;

  const containerRect = container.getBoundingClientRect();
  for (const { itemA, itemB } of links) {
    const bubbleA = getSoundboardBubble(itemA);
    const bubbleB = getSoundboardBubble(itemB);
    if (!bubbleA || !bubbleB) continue;

    const rectA = bubbleA.getBoundingClientRect();
    const rectB = bubbleB.getBoundingClientRect();
    const centerAX = rectA.left + rectA.width / 2 - containerRect.left;
    const centerAY = rectA.top + rectA.height / 2 - containerRect.top;
    const centerBX = rectB.left + rectB.width / 2 - containerRect.left;
    const centerBY = rectB.top + rectB.height / 2 - containerRect.top;
    const radiusA = Math.min(rectA.width, rectA.height) / 2;
    const radiusB = Math.min(rectB.width, rectB.height) / 2;
    const dx = centerBX - centerAX;
    const dy = centerBY - centerAY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) continue;
    const unitX = dx / distance;
    const unitY = dy / distance;

    const x1 = centerAX + unitX * radiusA;
    const y1 = centerAY + unitY * radiusA;
    const x2 = centerBX - unitX * radiusB;
    const y2 = centerBY - unitY * radiusB;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const colorA = getComputedStyle(bubbleA).backgroundColor;
    const colorB = getComputedStyle(bubbleB).backgroundColor;

    const edgeKey = getLinkEdgeKey(itemA, itemB);

    const firstHalf = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line",
    );
    firstHalf.setAttribute("x1", String(x1));
    firstHalf.setAttribute("y1", String(y1));
    firstHalf.setAttribute("x2", String(midX));
    firstHalf.setAttribute("y2", String(midY));
    firstHalf.setAttribute("stroke", colorA);
    firstHalf.setAttribute("stroke-width", "4");
    firstHalf.setAttribute("stroke-linecap", "round");
    firstHalf.setAttribute("opacity", "0.9");
    firstHalf.setAttribute("data-link", edgeKey);
    firstHalf.classList.add("link-line");

    const secondHalf = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line",
    );
    secondHalf.setAttribute("x1", String(midX));
    secondHalf.setAttribute("y1", String(midY));
    secondHalf.setAttribute("x2", String(x2));
    secondHalf.setAttribute("y2", String(y2));
    secondHalf.setAttribute("stroke", colorB);
    secondHalf.setAttribute("stroke-width", "4");
    secondHalf.setAttribute("stroke-linecap", "round");
    secondHalf.setAttribute("opacity", "0.9");
    secondHalf.setAttribute("data-link", edgeKey);
    secondHalf.classList.add("link-line");

    overlaySvg.appendChild(firstHalf);
    overlaySvg.appendChild(secondHalf);
  }
}

function getLinkEdgeKey(itemA: string, itemB: string): string {
  return itemA < itemB ? `${itemA}-${itemB}` : `${itemB}-${itemA}`;
}

function scheduleRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    if (selectedItemId && !persistence.getDoc().items?.[selectedItemId]) {
      setSelectedItem(null);
    }
    renderLinksOverlay();
  });
}

function exitLinkModeSelection(): void {
  setSelectedItem(null);
}

function enterLinkMode(): void {
  linkMode = true;
  btnLink?.classList.add("active");
  document.body.classList.add("link-mode");
  emitModeChange(true);
  linkModeScope?.dispose();
  linkModeScope = new ScopedListeners();

  const handler = (e: MouseEvent): void => {
    if (!linkMode) return;

    const target = e.target as HTMLElement;
    const bubble = target.closest(".soundboard-bubble") as HTMLElement | null;
    if (!bubble) return;

    const wrapper = bubble.closest(".soundboard-wrapper") as HTMLElement | null;
    const itemId = wrapper?.dataset.itemId;
    if (!wrapper || !itemId) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (consumeDrag(wrapper)) return;
    if (persistence.getDoc().items?.[itemId]?.type !== "soundboard") return;

    if (!selectedItemId) {
      setSelectedItem(itemId);
      return;
    }

    if (selectedItemId === itemId) {
      setSelectedItem(null);
      return;
    }

    persistence.toggleSoundboardLink(selectedItemId, itemId);
    exitLinkMode();
  };

  linkModeScope.listen<MouseEvent>(document, "click", handler, true);
}

export function isLinkMode(): boolean {
  return linkMode;
}

export function onLinkModeChange(callback: ModeChangeCallback): () => void {
  modeChangeCallbacks.push(callback);
  return () => {
    modeChangeCallbacks = modeChangeCallbacks.filter((cb) => cb !== callback);
  };
}

export function exitLinkMode(): void {
  if (!linkMode) return;
  linkMode = false;
  btnLink?.classList.remove("active");
  document.body.classList.remove("link-mode");
  exitLinkModeSelection();

  linkModeScope?.dispose();
  linkModeScope = null;

  emitModeChange(false);
  scheduleRender();
}

export function initLinksTool(): void {
  linksScope?.dispose();
  linksScope = new ScopedListeners();
  const scope = linksScope;

  btnLink = document.getElementById(
    "btn-link-mode",
  ) as HTMLButtonElement | null;
  const container = document.getElementById("canvas-container");
  if (!btnLink || !container) {
    console.warn("[Links] Link tool elements not found in DOM");
    return;
  }

  overlaySvg = document.getElementById("link-overlay") as SVGSVGElement | null;
  if (!overlaySvg) {
    overlaySvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlaySvg.id = "link-overlay";
    container.appendChild(overlaySvg);
  }

  scope.listen<MouseEvent>(btnLink, "click", (e) => {
    e.stopPropagation();
    if (linkMode) {
      exitLinkMode();
      return;
    }
    enterLinkMode();
    scheduleRender();
  });

  scope.listen<KeyboardEvent>(document, "keydown", (e) => {
    if (e.key === "Escape" && linkMode) {
      exitLinkMode();
    }
  });

  scope.addCleanup(
    persistence.subscribeGlobal(() => {
      scheduleRender();
    }),
  );
  scope.listen<PointerEvent>(
    document,
    "pointermove",
    (e) => {
      if (e.buttons !== 0) {
        scheduleRender();
      }
    },
    true,
  );
  scope.listen<PointerEvent>(
    document,
    "pointerup",
    () => {
      scheduleRender();
    },
    true,
  );
  scope.listen<PointerEvent>(document, "pointercancel", () => {
    scheduleRender();
  });
  scope.listen<Event>(window, "resize", () => {
    scheduleRender();
  });
  const zoomInButton = document.getElementById("btn-zoom-in");
  const zoomOutButton = document.getElementById("btn-zoom-out");
  if (zoomInButton) {
    scope.listen<MouseEvent>(zoomInButton, "click", () => {
      scheduleRender();
    });
  }
  if (zoomOutButton) {
    scope.listen<MouseEvent>(zoomOutButton, "click", () => {
      scheduleRender();
    });
  }

  scheduleRender();
}

export function invalidateLinksOverlay(eager = false): void {
  if (eager) renderLinksOverlay();
  else scheduleRender();
}

export function registerSoundboardPlayback(
  itemId: string,
  handler: PlaybackHandler,
): void {
  playbackHandlers.set(itemId, handler);
}

export function unregisterSoundboardPlayback(itemId: string): void {
  playbackHandlers.delete(itemId);
  cancelAllSequentialPlayback();
  if (selectedItemId === itemId) {
    setSelectedItem(null);
  }
  scheduleRender();
}

function cancelSequentialPlayback(originItemId: string): void {
  const fiber = sequentialPlaybackFibers.get(originItemId);
  if (!fiber) return;
  sequentialPlaybackFibers.delete(originItemId);
  runSync(Fiber.interrupt(fiber));
}

function cancelAllSequentialPlayback(): void {
  for (const [originItemId, fiber] of sequentialPlaybackFibers) {
    sequentialPlaybackFibers.delete(originItemId);
    runSync(Fiber.interrupt(fiber));
  }
}

export function requestLinkedPlayback(
  originItemId: string,
  fromRemote: boolean = false,
): void {
  cancelSequentialPlayback(originItemId);

  const playConcurrently = isConcurrentPlaybackEnabled(originItemId);
  if (!playConcurrently) {
    const steps = buildSequentialPlaybackSteps(originItemId);
    if (steps.length === 0) return;

    let sequenceFiber!: Fiber.RuntimeFiber<void, never>;
    const runSequence = Effect.gen(function* () {
      for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        if (!step) continue;
        if (step.parentId) {
          yield* Effect.sync(() => {
            animateLinkBetween(step.parentId!, step.itemId);
          });
        }

        const duration = yield* Effect.sync(() => {
          const handler = playbackHandlers.get(step.itemId);
          return handler
            ? handler(step.itemId === originItemId ? fromRemote : true)
            : 0;
        });

        if (index >= steps.length - 1) continue;
        const nextDelay = Number.isFinite(duration) && duration > 0 ? duration : 0;
        if (nextDelay > 0) {
          yield* Effect.sleep(`${Math.round(nextDelay)} millis`);
        }
      }
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (sequentialPlaybackFibers.get(originItemId) === sequenceFiber) {
            sequentialPlaybackFibers.delete(originItemId);
          }
        }),
      ),
    );

    sequenceFiber = runFork(runSequence);
    sequentialPlaybackFibers.set(originItemId, sequenceFiber);
    return;
  }

  const linkedIds = persistence.getLinkedSoundboardIds(originItemId);
  const targetIds = new Set<string>(
    linkedIds.length > 0 ? linkedIds : [originItemId],
  );

  // Animate connection lines if there are linked bubbles
  if (linkedIds.length > 1) {
    for (const linkedId of linkedIds) {
      if (linkedId === originItemId) continue;
      animateLinkBetween(originItemId, linkedId);
    }
  }

  for (const itemId of targetIds) {
    const handler = playbackHandlers.get(itemId);
    if (!handler) continue;
    handler(itemId === originItemId ? fromRemote : true);
  }
}

function isConcurrentPlaybackEnabled(itemId: string): boolean {
  const item = persistence.getDoc().items?.[itemId];
  if (!item || item.type !== "soundboard") return false;
  return Number(item.filters.playConcurrently ?? 0) > 0;
}

function buildSequentialPlaybackSteps(
  originItemId: string,
): SequentialPlaybackStep[] {
  const doc = persistence.getDoc();
  return getSequentialSoundboardSteps(
    doc.items ?? {},
    persistence.getLinks(),
    originItemId,
  );
}

/**
 * Animates the connection line between two bubbles.
 */
function animateLinkBetween(itemA: string, itemB: string): void {
  if (!overlaySvg) return;

  const edgeKey = getLinkEdgeKey(itemA, itemB);
  const lines = overlaySvg.querySelectorAll(
    `line[data-link="${edgeKey}"]`,
  ) as NodeListOf<SVGLineElement>;

  for (const line of lines) {
    // Add flowing animation class
    line.classList.add("link-animating");

    // Remove animation after it completes
    setTimeout(() => {
      line.classList.remove("link-animating");
    }, 1000);
  }
}

/**
 * Returns the number of linked bubbles for a given soundboard.
 */
export function getLinkedCount(itemId: string): number {
  return persistence.getLinkedSoundboardIds(itemId).length;
}
