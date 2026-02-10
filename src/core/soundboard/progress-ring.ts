/**
 * Progress ring visualization for soundboard bubbles during playback.
 * Shows animated circular progress around the bubble edge.
 */

const RING_STROKE_WIDTH = 2;
const RING_RADIUS_OFFSET = 3;

interface ProgressRingElements {
  svg: SVGSVGElement;
  background: SVGCircleElement;
  progress: SVGCircleElement;
}

const ringRegistry = new Map<HTMLElement, ProgressRingElements>();
const activeAnimations = new Map<HTMLElement, number>();

/**
 * Creates or retrieves a progress ring for a bubble element.
 */
export function createProgressRing(
  bubbleElement: HTMLElement,
): ProgressRingElements {
  const existing = ringRegistry.get(bubbleElement);
  if (existing) return existing;

  // Use layout metrics so ring sizing/centering is not affected by transforms.
  const bubbleOuterWidth = bubbleElement.offsetWidth;
  const bubbleOuterHeight = bubbleElement.offsetHeight;
  const bubbleInnerWidth = bubbleElement.clientWidth;
  const bubbleInnerHeight = bubbleElement.clientHeight;
  const bubbleRadius = Math.min(bubbleOuterWidth, bubbleOuterHeight) / 2;

  // Ring is positioned RING_RADIUS_OFFSET away from bubble edge
  const ringRadius = bubbleRadius + RING_RADIUS_OFFSET;
  const circumference = 2 * Math.PI * ringRadius;

  // SVG size needs to contain the ring plus stroke width
  const svgSize = 2 * (ringRadius + RING_STROKE_WIDTH);

  // Create SVG container
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("progress-ring-svg");
  svg.setAttribute("width", String(svgSize));
  svg.setAttribute("height", String(svgSize));
  svg.style.position = "absolute";

  // Absolute children are positioned in the parent's padding box.
  const svgLeft = (bubbleInnerWidth - svgSize) / 2;
  const svgTop = (bubbleInnerHeight - svgSize) / 2;
  svg.style.left = `${svgLeft}px`;
  svg.style.top = `${svgTop}px`;
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "10";

  // Circle center within the SVG
  const center = svgSize / 2;

  // Background ring (subtle track)
  const background = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle",
  );
  background.setAttribute("cx", String(center));
  background.setAttribute("cy", String(center));
  background.setAttribute("r", String(ringRadius));
  background.setAttribute("fill", "none");
  background.setAttribute("stroke", "currentColor");
  background.setAttribute("stroke-width", String(RING_STROKE_WIDTH));
  background.setAttribute("opacity", "0.15");
  background.style.color = "var(--state-cyan)";

  // Progress ring
  const progress = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle",
  );
  progress.setAttribute("cx", String(center));
  progress.setAttribute("cy", String(center));
  progress.setAttribute("r", String(ringRadius));
  progress.setAttribute("fill", "none");
  progress.setAttribute("stroke", "currentColor");
  progress.setAttribute("stroke-width", String(RING_STROKE_WIDTH));
  progress.setAttribute("stroke-linecap", "round");
  progress.setAttribute("stroke-dasharray", String(circumference));
  progress.setAttribute("stroke-dashoffset", String(circumference));
  progress.style.color = "var(--state-cyan)";
  progress.style.transform = "rotate(-90deg)";
  progress.style.transformOrigin = "center";
  progress.style.transition = "none";

  svg.appendChild(background);
  svg.appendChild(progress);
  bubbleElement.appendChild(svg);

  const elements = { svg, background, progress };
  ringRegistry.set(bubbleElement, elements);
  return elements;
}

/**
 * Animates the progress ring from current position to completion.
 */
export function animateProgress(
  bubbleElement: HTMLElement,
  durationMs: number,
  options: {
    color?: string;
    onComplete?: () => void;
  } = {},
): void {
  const ring = createProgressRing(bubbleElement);
  const circumference = Number(ring.progress.getAttribute("stroke-dasharray"));

  // Cancel any existing animation
  const existingAnimation = activeAnimations.get(bubbleElement);
  if (existingAnimation) {
    cancelAnimationFrame(existingAnimation);
  }

  // Set color
  if (options.color) {
    ring.background.style.color = options.color;
    ring.progress.style.color = options.color;
  }

  const startTime = performance.now();
  const startOffset = Number(ring.progress.getAttribute("stroke-dashoffset"));

  function animate(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / durationMs, 1);

    // Ease-out animation
    const eased = 1 - Math.pow(1 - progress, 2);
    const offset = circumference - eased * circumference;

    ring.progress.setAttribute("stroke-dashoffset", String(offset));

    if (progress < 1) {
      const frameId = requestAnimationFrame(animate);
      activeAnimations.set(bubbleElement, frameId);
    } else {
      activeAnimations.delete(bubbleElement);
      if (options.onComplete) {
        options.onComplete();
      }
    }
  }

  const frameId = requestAnimationFrame(animate);
  activeAnimations.set(bubbleElement, frameId);
}

/**
 * Resets the progress ring to empty state.
 */
export function resetProgress(bubbleElement: HTMLElement): void {
  const ring = ringRegistry.get(bubbleElement);
  if (!ring) return;

  // Cancel any active animation
  const existingAnimation = activeAnimations.get(bubbleElement);
  if (existingAnimation) {
    cancelAnimationFrame(existingAnimation);
    activeAnimations.delete(bubbleElement);
  }

  const circumference = Number(ring.progress.getAttribute("stroke-dasharray"));
  ring.progress.setAttribute("stroke-dashoffset", String(circumference));
}

/**
 * Shows a looping animation (continuous rotation).
 */
export function showLoopingAnimation(
  bubbleElement: HTMLElement,
  color: string = "var(--state-purple)",
): void {
  const ring = createProgressRing(bubbleElement);

  // Set color for loop mode
  ring.background.style.color = color;
  ring.progress.style.color = color;

  // Set partial fill for continuous look
  const circumference = Number(ring.progress.getAttribute("stroke-dasharray"));
  ring.progress.setAttribute("stroke-dashoffset", String(circumference * 0.7));

  // Add rotation animation via CSS
  ring.progress.style.transition = "none";
  ring.svg.style.animation = "progress-ring-rotate 2s linear infinite";
}

/**
 * Clears all animations and hides the progress ring.
 */
export function clearProgress(bubbleElement: HTMLElement): void {
  const ring = ringRegistry.get(bubbleElement);
  if (!ring) return;

  // Cancel animation
  const existingAnimation = activeAnimations.get(bubbleElement);
  if (existingAnimation) {
    cancelAnimationFrame(existingAnimation);
    activeAnimations.delete(bubbleElement);
  }

  // Clear rotation animation
  ring.svg.style.animation = "none";

  // Reset progress
  const circumference = Number(ring.progress.getAttribute("stroke-dasharray"));
  ring.progress.setAttribute("stroke-dashoffset", String(circumference));

  // Reset colors
  ring.background.style.color = "var(--state-cyan)";
  ring.progress.style.color = "var(--state-cyan)";
}

/**
 * Cleanup when bubble is removed.
 */
export function destroyProgressRing(bubbleElement: HTMLElement): void {
  clearProgress(bubbleElement);
  const ring = ringRegistry.get(bubbleElement);
  if (ring) {
    ring.svg.remove();
    ringRegistry.delete(bubbleElement);
  }
}
