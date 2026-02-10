/**
 * Soundboard UI creation and styling utilities
 * Handles DOM element creation, color calculations, and adaptive text colors
 */

import type { CanvasItem } from "../items.ts";
import type { SoundState, FilterSet } from "./types.ts";
import { duplicateItem, generateId, removeItem } from "../items.ts";
import { consumeDrag } from "../drag.ts";
import { persistence } from "../../sync/persistence.ts";
import { saveAudio, deleteAudio } from "../../sync/audio-storage.ts";
import { uploadAudio } from "../../sync/audio-sync.ts";
import { sendAudioPlayEvent } from "../../sync/sync.ts";
import {
  registerSoundboardPlayback,
  requestLinkedPlayback,
  unregisterSoundboardPlayback,
  getLinkedCount,
} from "../../ui/links.ts";
import {
  animateProgress,
  resetProgress,
  showLoopingAnimation,
  clearProgress,
  destroyProgressRing,
} from "../../ui/progress-ring.ts";
import {
  showRepeatBadge,
  showLoopBadge,
  showLinkBadge,
  hideBadge,
  destroyCounterBadge,
} from "../../ui/counter-badge.ts";
import { normalizeSoundboardFilters } from "../../util/soundboard-filters.ts";
import { getAudioContext, getReverbImpulse, reverseBuffer, clamp } from "./audio-engine.ts";
import { assignHotkey, releaseHotkey, hotkeyRegistry } from "./hotkeys.ts";

// --- Sound counter for default naming ---
let soundCounter = 0;

// --- Color utilities ---

/**
 * Parse a CSS color string to RGB components
 * Supports hex (#RGB, #RRGGBB) and rgb/rgba formats
 * @param color - CSS color string
 * @returns RGB object or null if parsing fails
 */
export function parseCssColorToRgb(
  color: string,
): { r: number; g: number; b: number } | null {
  const hexMatch = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1]!;
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0]! + hex[0]!, 16),
        g: parseInt(hex[1]! + hex[1]!, 16),
        b: parseInt(hex[2]! + hex[2]!, 16),
      };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgbMatch = color
    .trim()
    .match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!rgbMatch) return null;

  return {
    r: Math.max(0, Math.min(255, Number(rgbMatch[1]))),
    g: Math.max(0, Math.min(255, Number(rgbMatch[2]))),
    b: Math.max(0, Math.min(255, Number(rgbMatch[3]))),
  };
}

/**
 * Calculate relative luminance using WCAG formula
 * @param rgb - RGB color components
 * @returns Relative luminance (0-1)
 */
function relativeLuminance({
  r,
  g,
  b,
}: {
  r: number;
  g: number;
  b: number;
}): number {
  const toLinear = (channel: number): number => {
    const srgb = channel / 255;
    return srgb <= 0.04045
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };

  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/**
 * Determine readable text color (black or white) based on background color
 * Uses WCAG contrast ratio to choose the most readable option
 * @param backgroundColor - CSS background color string
 * @returns "#ffffff" or "#000000", or null if color parsing fails
 */
export function getReadableTextColor(backgroundColor: string): string | null {
  const rgb = parseCssColorToRgb(backgroundColor);
  if (!rgb) return null;

  const luminance = relativeLuminance(rgb);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;

  return whiteContrast >= blackContrast ? "#ffffff" : "#000000";
}

/**
 * Update adaptive text colors for all soundboard elements
 * Adjusts bubble text and label colors based on their backgrounds
 */
export function updateSoundboardAdaptiveTextColor(): void {
  const wrappers = document.querySelectorAll(".soundboard-wrapper");
  const canvasContainer = document.getElementById("canvas-container");
  const labelBackground = canvasContainer
    ? getComputedStyle(canvasContainer).backgroundColor
    : getComputedStyle(document.body).backgroundColor;
  const labelTextColor = getReadableTextColor(labelBackground);
  const editLabelBackground =
    labelTextColor === "#ffffff"
      ? "rgba(0, 0, 0, 0.55)"
      : "rgba(255, 255, 255, 0.92)";
  const editLabelBorderColor =
    labelTextColor === "#ffffff"
      ? "rgba(255, 255, 255, 0.35)"
      : "rgba(0, 0, 0, 0.2)";

  for (const wrapper of wrappers) {
    const bubble = wrapper.querySelector(
      ".soundboard-bubble",
    ) as HTMLElement | null;
    if (bubble) {
      const bubbleBackground = getComputedStyle(bubble).backgroundColor;
      const bubbleTextColor = getReadableTextColor(bubbleBackground);
      if (bubbleTextColor) {
        bubble.style.color = bubbleTextColor;
      }
    }

    const nameLabel = wrapper.querySelector(
      ".soundboard-name",
    ) as HTMLElement | null;
    if (nameLabel && labelTextColor) {
      nameLabel.style.color = labelTextColor;
      nameLabel.style.setProperty(
        "--soundboard-name-edit-bg",
        editLabelBackground,
      );
      nameLabel.style.setProperty(
        "--soundboard-name-edit-border",
        editLabelBorderColor,
      );
    }
  }
}

/**
 * Compare two filter sets for equality
 */
function areFiltersEqual(a: FilterSet, b: FilterSet): boolean {
  return (
    a.speedRate === b.speedRate &&
    a.reverbIntensity === b.reverbIntensity &&
    a.reversed === b.reversed &&
    a.playConcurrently === b.playConcurrently &&
    a.loopEnabled === b.loopEnabled &&
    a.loopDelaySeconds === b.loopDelaySeconds &&
    a.repeatCount === b.repeatCount &&
    a.repeatDelaySeconds === b.repeatDelaySeconds
  );
}

/**
 * Create a soundboard component
 * @param x - Initial x position
 * @param y - Initial y position
 * @param existingId - Optional existing ID for restoration
 * @returns CanvasItem representing the soundboard
 */
export function createSoundboard(
  x: number,
  y: number,
  existingId?: string,
): CanvasItem {
  const id = existingId || generateId();
  soundCounter++;
  console.log(`[Soundboard] Creating soundboard ${id} (Sound ${soundCounter})`);

  // --- DOM structure ---
  const wrapper = document.createElement("div");
  wrapper.className = "canvas-item soundboard-wrapper";
  wrapper.dataset.itemId = id;

  const topRow = document.createElement("div");
  topRow.className = "soundboard-top";

  const mainCol = document.createElement("div");
  mainCol.className = "soundboard-main";

  // Main bubble
  const bubble = document.createElement("div");
  bubble.className = "soundboard-bubble state-empty";

  const icon = document.createElement("div");
  icon.className = "soundboard-icon";

  const statusLabel = document.createElement("div");
  statusLabel.className = "soundboard-status";

  const actionRow = document.createElement("div");
  actionRow.className = "soundboard-actions";

  const reRecordBtn = document.createElement("button");
  reRecordBtn.type = "button";
  reRecordBtn.className = "soundboard-action soundboard-action-rerecord";
  reRecordBtn.title = "Re-record";
  reRecordBtn.textContent = "↺";

  const duplicateBtn = document.createElement("button");
  duplicateBtn.type = "button";
  duplicateBtn.className = "soundboard-action soundboard-action-duplicate";
  duplicateBtn.title = "Duplicate";
  duplicateBtn.textContent = "⧉";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "soundboard-action soundboard-action-delete";
  deleteBtn.title = "Delete";
  deleteBtn.textContent = "✕";

  actionRow.appendChild(duplicateBtn);
  actionRow.appendChild(reRecordBtn);
  actionRow.appendChild(deleteBtn);

  bubble.appendChild(icon);
  bubble.appendChild(statusLabel);
  bubble.appendChild(actionRow);

  // Property bubbles column
  const propsCol = document.createElement("div");
  propsCol.className = "soundboard-props";

  const hotkeyBubble = document.createElement("div");
  hotkeyBubble.className = "prop-bubble prop-hotkey";
  hotkeyBubble.title = "Hotkey (click to change)";

  const settingsBubble = document.createElement("button");
  settingsBubble.type = "button";
  settingsBubble.className = "prop-bubble prop-settings";
  settingsBubble.title = "Sound settings";
  settingsBubble.textContent = "⚙";

  const filters: FilterSet = {
    speedRate: 1,
    reverbIntensity: 0,
    reversed: false,
    playConcurrently: false,
    loopEnabled: false,
    loopDelaySeconds: 0,
    repeatCount: 1,
    repeatDelaySeconds: 0,
  };

  propsCol.appendChild(hotkeyBubble);
  propsCol.appendChild(settingsBubble);

  const settingsPanel = document.createElement("div");
  settingsPanel.className = "soundboard-settings-panel";
  settingsPanel.innerHTML = `
    <div class="soundboard-settings-title">Bubble settings</div>
    <label class="soundboard-setting-row">
      <span class="soundboard-setting-header">
        <span>Speed</span>
        <span class="soundboard-setting-value" data-setting-value="speedRate"></span>
      </span>
      <input type="range" min="0.5" max="1.75" step="0.01" data-setting="speedRate" />
      <div class="soundboard-speed-hints">
        <span class="soundboard-speed-hint slowed">Slowed 0.75x</span>
        <span class="soundboard-speed-hint nightcore">Nightcore 1.35x</span>
      </div>
    </label>
    <label class="soundboard-setting-row">
      <span class="soundboard-setting-header">
        <span>Reverb intensity</span>
        <span class="soundboard-setting-value" data-setting-value="reverbIntensity"></span>
      </span>
      <input type="range" min="0" max="1" step="0.05" data-setting="reverbIntensity" />
    </label>
    <label class="soundboard-setting-row checkbox">
      <input type="checkbox" data-setting="reversed" />
      <span>Reversed sound</span>
    </label>
    <label class="soundboard-setting-row checkbox">
      <input type="checkbox" data-setting="playConcurrently" />
      <span>Play concurrently</span>
    </label>
    <label class="soundboard-setting-row checkbox">
      <input type="checkbox" data-setting="loopEnabled" />
      <span>Loop</span>
    </label>
    <label class="soundboard-setting-row loop-delay">
      <span class="soundboard-setting-header">
        <span>Loop delay (seconds)</span>
        <span class="soundboard-setting-value" data-setting-value="loopDelaySeconds"></span>
      </span>
      <input type="range" min="0" max="5" step="0.1" data-setting="loopDelaySeconds" />
    </label>
    <label class="soundboard-setting-row">
      <span class="soundboard-setting-header">
        <span>Repeat count</span>
        <span class="soundboard-setting-value" data-setting-value="repeatCount"></span>
      </span>
      <input type="range" min="1" max="10" step="1" data-setting="repeatCount" />
    </label>
    <label class="soundboard-setting-row repeat-delay">
      <span class="soundboard-setting-header">
        <span>Repeat delay (seconds)</span>
        <span class="soundboard-setting-value" data-setting-value="repeatDelaySeconds"></span>
      </span>
      <input type="range" min="0" max="5" step="0.1" data-setting="repeatDelaySeconds" />
    </label>
  `;

  // Editable name label
  const nameLabel = document.createElement("div");
  nameLabel.className = "soundboard-name";
  nameLabel.contentEditable = "false";
  nameLabel.textContent = `Sound ${soundCounter}`;

  mainCol.appendChild(bubble);
  mainCol.appendChild(nameLabel);
  topRow.appendChild(mainCol);
  topRow.appendChild(propsCol);
  wrapper.appendChild(topRow);
  wrapper.appendChild(settingsPanel);

  // --- State ---
  let state: SoundState = "empty";
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let audioBuffer: AudioBuffer | null = null;
  let reversedCache: AudioBuffer | null = null;
  let hotkey = assignHotkey();
  let unsubscribe: (() => void) | null = null;

  hotkeyBubble.textContent = hotkey || "—";

  const speedRateInput = settingsPanel.querySelector(
    'input[data-setting="speedRate"]',
  ) as HTMLInputElement;
  const reverbIntensityInput = settingsPanel.querySelector(
    'input[data-setting="reverbIntensity"]',
  ) as HTMLInputElement;
  const reversedInput = settingsPanel.querySelector(
    'input[data-setting="reversed"]',
  ) as HTMLInputElement;
  const playConcurrentlyInput = settingsPanel.querySelector(
    'input[data-setting="playConcurrently"]',
  ) as HTMLInputElement;
  const loopEnabledInput = settingsPanel.querySelector(
    'input[data-setting="loopEnabled"]',
  ) as HTMLInputElement;
  const loopDelayInput = settingsPanel.querySelector(
    'input[data-setting="loopDelaySeconds"]',
  ) as HTMLInputElement;
  const repeatCountInput = settingsPanel.querySelector(
    'input[data-setting="repeatCount"]',
  ) as HTMLInputElement;
  const repeatDelayInput = settingsPanel.querySelector(
    'input[data-setting="repeatDelaySeconds"]',
  ) as HTMLInputElement;
  const speedRateValue = settingsPanel.querySelector(
    '[data-setting-value="speedRate"]',
  ) as HTMLElement;
  const reverbIntensityValue = settingsPanel.querySelector(
    '[data-setting-value="reverbIntensity"]',
  ) as HTMLElement;
  const loopDelayValue = settingsPanel.querySelector(
    '[data-setting-value="loopDelaySeconds"]',
  ) as HTMLElement;
  const repeatCountValue = settingsPanel.querySelector(
    '[data-setting-value="repeatCount"]',
  ) as HTMLElement;
  const repeatDelayValue = settingsPanel.querySelector(
    '[data-setting-value="repeatDelaySeconds"]',
  ) as HTMLElement;
  const loopDelayRow = settingsPanel.querySelector(
    ".soundboard-setting-row.loop-delay",
  ) as HTMLElement;
  const playbackTimers = new Set<number>();
  let loopingTimerId: number | null = null;
  let settingsPanelVisible = false;

  function clearPlaybackTimers(): void {
    for (const timerId of playbackTimers) clearTimeout(timerId);
    playbackTimers.clear();
    if (loopingTimerId !== null) {
      clearTimeout(loopingTimerId);
      loopingTimerId = null;
    }
    // Clear visual feedback
    hideBadge(bubble);
    clearProgress(bubble);
  }

  function toggleSettingsPanel(nextVisible?: boolean): void {
    const shouldShow =
      typeof nextVisible === "boolean"
        ? nextVisible
        : !settingsPanel.classList.contains("visible");
    if (settingsPanelVisible === shouldShow) return;
    settingsPanelVisible = shouldShow;
    settingsPanel.classList.toggle("visible", shouldShow);
    settingsBubble.classList.toggle("active", shouldShow);
  }

  function updateSettingsControlState(): void {
    loopDelayInput.disabled = !filters.loopEnabled;
    loopDelayRow.classList.toggle("disabled", !filters.loopEnabled);
  }

  function refreshSettingValueLabels(): void {
    speedRateValue.textContent = `${filters.speedRate.toFixed(2)}x`;
    reverbIntensityValue.textContent = filters.reverbIntensity.toFixed(2);
    loopDelayValue.textContent = `${filters.loopDelaySeconds.toFixed(1)}s`;
    repeatCountValue.textContent = String(filters.repeatCount);
    repeatDelayValue.textContent = `${filters.repeatDelaySeconds.toFixed(1)}s`;
  }

  function syncSettingsInputsFromState(): void {
    speedRateInput.value = String(filters.speedRate);
    reverbIntensityInput.value = String(filters.reverbIntensity);
    reversedInput.checked = filters.reversed;
    playConcurrentlyInput.checked = filters.playConcurrently;
    loopEnabledInput.checked = filters.loopEnabled;
    loopDelayInput.value = String(filters.loopDelaySeconds);
    repeatCountInput.value = String(filters.repeatCount);
    repeatDelayInput.value = String(filters.repeatDelaySeconds);
    refreshSettingValueLabels();
    updateSettingsControlState();
  }

  function persistSettings(): void {
    persistence.updateSoundboardFilters(id, {
      speedRate: filters.speedRate,
      reverbIntensity: filters.reverbIntensity,
      reversed: filters.reversed ? 1 : 0,
      playConcurrently: filters.playConcurrently ? 1 : 0,
      loopEnabled: filters.loopEnabled ? 1 : 0,
      loopDelaySeconds: filters.loopDelaySeconds,
      repeatCount: filters.repeatCount,
      repeatDelaySeconds: filters.repeatDelaySeconds,
    });
  }

  function persistLinkedLoopRepeatSettings(): void {
    persistence.updateLinkedLoopRepeatSettings(id, {
      playConcurrently: filters.playConcurrently ? 1 : 0,
      loopEnabled: filters.loopEnabled ? 1 : 0,
      loopDelaySeconds: filters.loopDelaySeconds,
      repeatCount: filters.repeatCount,
      repeatDelaySeconds: filters.repeatDelaySeconds,
    });
  }

  function setState_internal(newState: SoundState) {
    bubble.classList.remove(`state-${state}`);
    state = newState;
    bubble.classList.add(`state-${state}`);

    switch (state) {
      case "empty":
        icon.textContent = "\u{1F3A4}";
        statusLabel.textContent = "Record";
        break;
      case "recording":
        icon.textContent = "\u{1F534}";
        statusLabel.textContent = "Stop";
        break;
      case "has-audio":
        icon.textContent = "\u{1F50A}";
        statusLabel.textContent = "Play";
        break;
    }

    updateSoundboardAdaptiveTextColor();
  }

  setState_internal("empty");
  queueMicrotask(() => updateSoundboardAdaptiveTextColor());

  // --- Recording ---
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      });

      mediaRecorder.addEventListener("stop", async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const ctx = getAudioContext();
        const arrayBuf = await blob.arrayBuffer();
        audioBuffer = await ctx.decodeAudioData(arrayBuf);
        reversedCache = null;
        setState_internal("has-audio");

        const previousAudioKey = persistence.getDoc().audioFiles?.[id];
        const audioKey = `audio-${id}-${Date.now()}`;
        await saveAudio(audioKey, audioBuffer);

        // Upload to R2 before setting Automerge ref (prevents race condition)
        await uploadAudio(id, audioBuffer);

        persistence.setAudioFile(id, audioKey);

        if (previousAudioKey && previousAudioKey !== audioKey) {
          deleteAudio(previousAudioKey).catch((error) => {
            console.error("Failed to delete previous audio key:", error);
          });
        }
      });

      mediaRecorder.start();
      setState_internal("recording");
    } catch {
      setState_internal("empty");
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  // --- Playback (async, overlapping) ---
  function playSoundDirect(fromRemote: boolean = false): number {
    if (!audioBuffer) return 0;

    const ctx = getAudioContext();
    const snapshot: FilterSet = { ...filters };

    function playOnce(): number {
      let buffer = audioBuffer!;
      if (snapshot.reversed) {
        if (!reversedCache) reversedCache = reverseBuffer(ctx, audioBuffer!);
        buffer = reversedCache;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const rate = clamp(snapshot.speedRate, 0.5, 1.75);
      source.playbackRate.value = rate;

      const reverbMix = clamp(snapshot.reverbIntensity, 0, 1);
      if (reverbMix > 0) {
        const dryGain = ctx.createGain();
        const wetGain = ctx.createGain();
        const convolver = ctx.createConvolver();
        convolver.buffer = getReverbImpulse(ctx);
        dryGain.gain.value = 1 - reverbMix * 0.85;
        wetGain.gain.value = reverbMix;
        source.connect(dryGain);
        source.connect(convolver);
        convolver.connect(wetGain);
        dryGain.connect(ctx.destination);
        wetGain.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
      }

      source.start();
      bubble.classList.add("pulse-play");
      setTimeout(() => bubble.classList.remove("pulse-play"), 200);
      return (buffer.duration / rate) * 1000;
    }

    const estimatedRate = clamp(snapshot.speedRate, 0.5, 1.75);
    const estimatedDurationMs = (audioBuffer.duration / estimatedRate) * 1000;

    clearPlaybackTimers();
    const repeatCount = Math.max(1, Math.round(snapshot.repeatCount));
    const repeatDelayMs = Math.max(0, snapshot.repeatDelaySeconds * 1000);

    // Determine visualization type
    const linkedCount = getLinkedCount(id);
    const isLooping = snapshot.loopEnabled;
    const hasRepeats = repeatCount > 1;
    const hasLinks = linkedCount > 1;

    // Show appropriate badge
    if (hasLinks) {
      showLinkBadge(bubble, linkedCount);
    } else if (isLooping) {
      showLoopBadge(bubble);
    } else if (hasRepeats) {
      showRepeatBadge(bubble, 1, repeatCount);
    }

    // Visual feedback for playback type
    let currentRepeat = 1;
    const playSequence = (): number => {
      const singleDuration = playOnce();

      // Animate progress ring for first play
      if (currentRepeat === 1) {
        if (isLooping) {
          showLoopingAnimation(bubble, "var(--state-purple)");
        } else {
          const color = hasLinks ? "var(--state-orange)" : "var(--state-cyan)";
          animateProgress(bubble, singleDuration, { color });
        }
      }

      for (let i = 1; i < repeatCount; i++) {
        const nextDelayMs = i * (estimatedDurationMs + repeatDelayMs);
        const timerId = window.setTimeout(() => {
          playbackTimers.delete(timerId);
          currentRepeat = i + 1;
          const playDuration = playOnce();

          // Update badge and progress ring for each repeat
          if (hasRepeats && !isLooping) {
            showRepeatBadge(bubble, currentRepeat, repeatCount);
            resetProgress(bubble);
            animateProgress(bubble, playDuration, {
              color: "var(--state-cyan)",
              onComplete:
                currentRepeat === repeatCount
                  ? () => {
                      hideBadge(bubble);
                      clearProgress(bubble);
                    }
                  : undefined,
            });
          }
        }, nextDelayMs);
        playbackTimers.add(timerId);
      }
      return (
        repeatCount * estimatedDurationMs + (repeatCount - 1) * repeatDelayMs
      );
    };

    const sequenceDurationMs = playSequence();

    if (snapshot.loopEnabled) {
      const scheduleLoop = () => {
        const loopDelayMs = Math.max(0, snapshot.loopDelaySeconds * 1000);
        currentRepeat = 1;
        const duration = playSequence();
        loopingTimerId = window.setTimeout(
          scheduleLoop,
          duration + loopDelayMs,
        );
      };
      loopingTimerId = window.setTimeout(
        scheduleLoop,
        sequenceDurationMs + snapshot.loopDelaySeconds * 1000,
      );
    } else if (!hasRepeats) {
      // Single play - clear visuals after completion
      setTimeout(() => {
        hideBadge(bubble);
        clearProgress(bubble);
      }, sequenceDurationMs);
    }

    if (!fromRemote) {
      sendAudioPlayEvent(id);
    }

    return snapshot.loopEnabled
      ? sequenceDurationMs + Math.max(0, snapshot.loopDelaySeconds * 1000)
      : sequenceDurationMs;
  }

  function playSound(fromRemote: boolean = false): void {
    requestLinkedPlayback(id, fromRemote);
  }

  registerSoundboardPlayback(id, playSoundDirect);

  // --- Click handler on main bubble ---
  bubble.addEventListener("click", (e) => {
    e.stopPropagation();
    if (consumeDrag(wrapper)) return;

    console.log(`[Soundboard ${id}] Bubble clicked, state: ${state}`);
    switch (state) {
      case "empty":
        console.log(`[Soundboard ${id}] Starting recording...`);
        startRecording();
        break;
      case "recording":
        console.log(`[Soundboard ${id}] Stopping recording...`);
        stopRecording();
        break;
      case "has-audio":
        console.log(`[Soundboard ${id}] Playing sound...`);
        playSound();
        break;
    }
  });

  reRecordBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (consumeDrag(wrapper)) return;
    if (state === "recording") return;
    startRecording();
  });

  duplicateBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (consumeDrag(wrapper)) return;
    void duplicateItem(id);
  });

  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (consumeDrag(wrapper)) return;
    removeItem(id);
  });

  // --- Settings bubble + panel ---
  settingsBubble.addEventListener("click", (e) => {
    e.stopPropagation();
    if (consumeDrag(wrapper)) return;
    toggleSettingsPanel();
  });

  settingsPanel.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });

  const onGlobalPointerDown = (e: PointerEvent) => {
    if (!settingsPanel.classList.contains("visible")) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (!settingsPanel.contains(target) && !settingsBubble.contains(target)) {
      toggleSettingsPanel(false);
    }
  };
  document.addEventListener("pointerdown", onGlobalPointerDown);

  speedRateInput.addEventListener("input", () => {
    filters.speedRate = clamp(Number(speedRateInput.value), 0.5, 1.75);
    refreshSettingValueLabels();
    persistSettings();
  });
  reverbIntensityInput.addEventListener("input", () => {
    filters.reverbIntensity = clamp(Number(reverbIntensityInput.value), 0, 1);
    refreshSettingValueLabels();
    persistSettings();
  });
  reversedInput.addEventListener("change", () => {
    filters.reversed = reversedInput.checked;
    reversedCache = null;
    persistSettings();
  });
  playConcurrentlyInput.addEventListener("change", () => {
    filters.playConcurrently = playConcurrentlyInput.checked;
    persistLinkedLoopRepeatSettings();
  });
  loopEnabledInput.addEventListener("change", () => {
    filters.loopEnabled = loopEnabledInput.checked;
    if (!filters.loopEnabled) clearPlaybackTimers();
    updateSettingsControlState();
    persistLinkedLoopRepeatSettings();
  });
  loopDelayInput.addEventListener("input", () => {
    filters.loopDelaySeconds = Math.max(0, Number(loopDelayInput.value));
    refreshSettingValueLabels();
    persistLinkedLoopRepeatSettings();
  });
  repeatCountInput.addEventListener("input", () => {
    filters.repeatCount = Math.max(
      1,
      Math.round(Number(repeatCountInput.value)),
    );
    refreshSettingValueLabels();
    persistLinkedLoopRepeatSettings();
  });
  repeatDelayInput.addEventListener("input", () => {
    filters.repeatDelaySeconds = Math.max(0, Number(repeatDelayInput.value));
    refreshSettingValueLabels();
    persistLinkedLoopRepeatSettings();
  });
  syncSettingsInputsFromState();

  // --- Hotkey bubble: click to reassign ---
  let listeningForHotkey = false;

  function stopListening() {
    listeningForHotkey = false;
    hotkeyBubble.classList.remove("listening");
    document.removeEventListener("keydown", onHotkeyCapture, true);
  }

  function onHotkeyCapture(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      stopListening();
      return;
    }

    const newKey = e.key.toUpperCase();
    const HOTKEY_POOL = "123456789QWERTYUIOPASDFGHJKLZXCVBNM".split("");
    if (!HOTKEY_POOL.includes(newKey)) return;

    // Check if already taken
    const usedHotkeys = new Set(
      Array.from(hotkeyRegistry.keys())
    );
    if (usedHotkeys.has(newKey) && newKey !== hotkey) return;

    // Release old, assign new
    if (hotkey) releaseHotkey(hotkey);
    hotkey = newKey;
    hotkeyRegistry.set(hotkey, playSound);
    hotkeyBubble.textContent = hotkey;
    stopListening();

    // Persist hotkey change
    persistence.updateSoundboardHotkey(id, hotkey);
  }

  hotkeyBubble.addEventListener("click", (e) => {
    e.stopPropagation();
    if (consumeDrag(wrapper)) return;

    if (listeningForHotkey) {
      stopListening();
    } else {
      listeningForHotkey = true;
      hotkeyBubble.classList.add("listening");
      document.addEventListener("keydown", onHotkeyCapture, true);
    }
  });

  // Register initial hotkey
  if (hotkey) {
    hotkeyRegistry.set(hotkey, playSound);
  }

  // Subscribe to Automerge changes
  unsubscribe = persistence.subscribeToItem(id, (itemData) => {
    if (!itemData || itemData.type !== "soundboard") return;

    // Update settings/filters
    const normalized = normalizeSoundboardFilters(
      itemData.filters as unknown as Record<string, unknown>,
    );
    const newFilters: FilterSet = {
      speedRate: normalized.speedRate,
      reverbIntensity: normalized.reverbIntensity,
      reversed: normalized.reversed > 0,
      playConcurrently: normalized.playConcurrently > 0,
      loopEnabled: normalized.loopEnabled > 0,
      loopDelaySeconds: normalized.loopDelaySeconds,
      repeatCount: normalized.repeatCount,
      repeatDelaySeconds: normalized.repeatDelaySeconds,
    };

    const wasReversed = filters.reversed;
    if (!areFiltersEqual(filters, newFilters)) {
      Object.assign(filters, newFilters);
      if (wasReversed !== newFilters.reversed) {
        reversedCache = null;
      }
      if (!newFilters.loopEnabled) clearPlaybackTimers();
      syncSettingsInputsFromState();
    }

    // Update hotkey
    if (itemData.hotkey !== hotkey) {
      if (hotkey) releaseHotkey(hotkey);
      hotkey = itemData.hotkey;
      if (hotkey) {
        hotkeyRegistry.set(hotkey, playSound);
      }
      hotkeyBubble.textContent = hotkey || "—";
    }

    // Update name (only if not currently editing)
    if (
      nameLabel.contentEditable === "false" &&
      itemData.name !== nameLabel.textContent
    ) {
      nameLabel.textContent = itemData.name || `Sound ${soundCounter}`;
    }
  });

  // --- Editable name ---
  nameLabel.addEventListener("dblclick", (e) => {
    nameLabel.contentEditable = "true";
    nameLabel.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(nameLabel);
    sel?.removeAllRanges();
    sel?.addRange(range);
    e.stopPropagation();
  });

  nameLabel.addEventListener("blur", () => {
    nameLabel.contentEditable = "false";
    if (!nameLabel.textContent?.trim()) {
      nameLabel.textContent = `Sound ${soundCounter}`;
    }

    // Persist name change
    persistence.updateSoundboardName(
      id,
      nameLabel.textContent || `Sound ${soundCounter}`,
    );
  });

  nameLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nameLabel.blur();
    }
  });

  // --- Cleanup function ---
  function cleanup() {
    toggleSettingsPanel(false);
    if (unsubscribe) unsubscribe();
    if (hotkey) releaseHotkey(hotkey);
    unregisterSoundboardPlayback(id);
    clearPlaybackTimers();
    stopListening();
    document.removeEventListener("pointerdown", onGlobalPointerDown);
    destroyProgressRing(bubble);
    destroyCounterBadge(bubble);
  }

  // --- Public API for loading audio (called during restoration) ---
  function loadAudioBuffer(buffer: AudioBuffer | null) {
    audioBuffer = buffer;
    reversedCache = null;
    if (audioBuffer) {
      setState_internal("has-audio");
    } else {
      setState_internal("empty");
    }
  }

  return {
    id,
    type: "soundboard" as const,
    x,
    y,
    element: wrapper,
    cleanup,
    loadAudioBuffer,
    play: (fromRemote?: boolean) => playSound(Boolean(fromRemote)),
    hotkey,
    name: nameLabel.textContent || "",
  };
}
