/**
 * Counter badge for soundboard bubbles showing playback state.
 * Displays repeat count, loop indicator, or link count.
 */

interface CounterBadge {
  element: HTMLElement;
  isVisible: boolean;
}

const badgeRegistry = new Map<HTMLElement, CounterBadge>();

/**
 * Creates or retrieves a counter badge for a bubble element.
 */
export function createCounterBadge(bubbleElement: HTMLElement): CounterBadge {
  const existing = badgeRegistry.get(bubbleElement);
  if (existing) return existing;

  const badge = document.createElement("div");
  badge.className = "counter-badge";
  badge.style.opacity = "0";
  badge.style.transform = "scale(0.8)";

  bubbleElement.appendChild(badge);

  const badgeObj = { element: badge, isVisible: false };
  badgeRegistry.set(bubbleElement, badgeObj);
  return badgeObj;
}

/**
 * Updates the badge content and shows it.
 */
export function updateBadge(
  bubbleElement: HTMLElement,
  options: {
    type: "repeat" | "loop" | "link";
    current?: number;
    total?: number;
    linkCount?: number;
  },
): void {
  const badge = createCounterBadge(bubbleElement);

  let content = "";
  let className = "counter-badge";

  switch (options.type) {
    case "repeat":
      if (options.current !== undefined && options.total !== undefined) {
        content = `${options.current}/${options.total}`;
        className += " badge-repeat";
      }
      break;
    case "loop":
      content = "∞";
      className += " badge-loop";
      break;
    case "link":
      if (options.linkCount !== undefined && options.linkCount > 1) {
        content = `→${options.linkCount}`;
        className += " badge-link";
      }
      break;
  }

  if (content) {
    badge.element.textContent = content;
    badge.element.className = className;
    showBadge(bubbleElement);
  }
}

/**
 * Shows the badge with animation.
 */
export function showBadge(bubbleElement: HTMLElement): void {
  const badge = badgeRegistry.get(bubbleElement);
  if (!badge || badge.isVisible) return;

  badge.isVisible = true;
  badge.element.style.opacity = "1";
  badge.element.style.transform = "scale(1)";
}

/**
 * Hides the badge with animation.
 */
export function hideBadge(bubbleElement: HTMLElement): void {
  const badge = badgeRegistry.get(bubbleElement);
  if (!badge || !badge.isVisible) return;

  badge.isVisible = false;
  badge.element.style.opacity = "0";
  badge.element.style.transform = "scale(0.8)";
}

/**
 * Updates badge for repeat playback.
 */
export function showRepeatBadge(
  bubbleElement: HTMLElement,
  current: number,
  total: number,
): void {
  updateBadge(bubbleElement, { type: "repeat", current, total });
}

/**
 * Updates badge for loop playback.
 */
export function showLoopBadge(bubbleElement: HTMLElement): void {
  updateBadge(bubbleElement, { type: "loop" });
}

/**
 * Updates badge for linked playback.
 */
export function showLinkBadge(
  bubbleElement: HTMLElement,
  linkCount: number,
): void {
  updateBadge(bubbleElement, { type: "link", linkCount });
}

/**
 * Cleanup when bubble is removed.
 */
export function destroyCounterBadge(bubbleElement: HTMLElement): void {
  const badge = badgeRegistry.get(bubbleElement);
  if (badge) {
    badge.element.remove();
    badgeRegistry.delete(bubbleElement);
  }
}
