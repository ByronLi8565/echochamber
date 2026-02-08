import type { CanvasItem } from "./items.ts";
import { generateId } from "./items.ts";
import { consumeDrag } from "./drag.ts";
import { persistence } from "./persistence.ts";
import { saveAudio, deleteAudio } from "./audio-storage.ts";
import { uploadAudio } from "./audio-sync.ts";

// --- Shared audio infrastructure ---

let audioCtx: AudioContext | null = null;
let reverbImpulse: AudioBuffer | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function getReverbImpulse(ctx: AudioContext): AudioBuffer {
  if (!reverbImpulse) {
    const rate = ctx.sampleRate;
    const length = rate * 2;
    reverbImpulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = reverbImpulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      }
    }
  }
  return reverbImpulse;
}

function reverseBuffer(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  const reversed = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = reversed.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) {
      dst[i] = src[buffer.length - 1 - i]!;
    }
  }
  return reversed;
}

// --- Hotkey system ---

const HOTKEY_POOL = "123456789QWERTYUIOPASDFGHJKLZXCVBNM".split("");
export const hotkeyRegistry = new Map<string, () => void>();
const usedHotkeys = new Set<string>();

function assignHotkey(): string {
  for (const key of HOTKEY_POOL) {
    if (!usedHotkeys.has(key)) {
      usedHotkeys.add(key);
      return key;
    }
  }
  return "";
}

function releaseHotkey(key: string) {
  usedHotkeys.delete(key);
  hotkeyRegistry.delete(key);
}

// --- Soundboard item ---

type SoundState = "empty" | "recording" | "has-audio";
let soundCounter = 0;

interface FilterSet {
  slowed: boolean;
  reverb: boolean;
  reversed: boolean;
  nightcore: boolean;
}

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

  // Main bubble
  const bubble = document.createElement("div");
  bubble.className = "soundboard-bubble state-empty";

  const icon = document.createElement("div");
  icon.className = "soundboard-icon";

  const statusLabel = document.createElement("div");
  statusLabel.className = "soundboard-status";

  bubble.appendChild(icon);
  bubble.appendChild(statusLabel);

  // Property bubbles column
  const propsCol = document.createElement("div");
  propsCol.className = "soundboard-props";

  const hotkeyBubble = document.createElement("div");
  hotkeyBubble.className = "prop-bubble prop-hotkey";
  hotkeyBubble.title = "Hotkey (click to change)";

  const filters: FilterSet = {
    slowed: false,
    reverb: false,
    reversed: false,
    nightcore: false,
  };
  const filterDefs: { key: keyof FilterSet; label: string; title: string }[] = [
    { key: "slowed", label: "Sl", title: "Slowed (0.75x)" },
    { key: "reverb", label: "Rv", title: "Reverb" },
    { key: "reversed", label: "Re", title: "Reversed" },
    { key: "nightcore", label: "Nc", title: "Nightcore (1.35x + pitch)" },
  ];

  propsCol.appendChild(hotkeyBubble);

  const filterBubbles: HTMLElement[] = [];
  for (const def of filterDefs) {
    const fb = document.createElement("div");
    fb.className = "prop-bubble prop-filter";
    fb.dataset.filter = def.key;
    fb.textContent = def.label;
    fb.title = def.title;
    propsCol.appendChild(fb);
    filterBubbles.push(fb);
  }

  topRow.appendChild(bubble);
  topRow.appendChild(propsCol);

  // Editable name label
  const nameLabel = document.createElement("div");
  nameLabel.className = "soundboard-name";
  nameLabel.contentEditable = "false";
  nameLabel.textContent = `Sound ${soundCounter}`;

  wrapper.appendChild(topRow);
  wrapper.appendChild(nameLabel);

  // --- State ---
  let state: SoundState = "empty";
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let audioBuffer: AudioBuffer | null = null;
  let reversedCache: AudioBuffer | null = null;
  let hotkey = assignHotkey();
  let unsubscribe: (() => void) | null = null;

  hotkeyBubble.textContent = hotkey || "—";

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
  }

  setState_internal("empty");

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
  function playSound() {
    if (!audioBuffer) return;

    const ctx = getAudioContext();
    let buffer = audioBuffer;

    if (filters.reversed) {
      if (!reversedCache) reversedCache = reverseBuffer(ctx, audioBuffer);
      buffer = reversedCache;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    let rate = 1;
    if (filters.slowed) rate *= 0.75;
    if (filters.nightcore) rate *= 1.35;
    source.playbackRate.value = rate;

    let node: AudioNode = source;

    if (filters.reverb) {
      const convolver = ctx.createConvolver();
      convolver.buffer = getReverbImpulse(ctx);
      node.connect(convolver);
      node = convolver;
    }

    node.connect(ctx.destination);
    source.start();

    // Brief visual pulse
    bubble.classList.add("pulse-play");
    setTimeout(() => bubble.classList.remove("pulse-play"), 200);
  }

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

  // --- Filter toggle clicks ---
  for (let i = 0; i < filterDefs.length; i++) {
    const def = filterDefs[i]!;
    const fb = filterBubbles[i]!;

    fb.addEventListener("click", (e) => {
      e.stopPropagation();
      if (consumeDrag(wrapper)) return;

      filters[def.key] = !filters[def.key];
      fb.classList.toggle("active", filters[def.key]);

      // Invalidate reversed cache when reversed toggle changes
      if (def.key === "reversed") reversedCache = null;

      // Persist filter changes
      persistence.updateSoundboardFilters(id, {
        lowpass: filters.slowed ? 1 : 0,
        highpass: filters.nightcore ? 1 : 0,
        reverb: filters.reverb ? 1 : 0,
        reversed: filters.reversed ? 1 : 0,
      });
    });
  }

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
    if (!HOTKEY_POOL.includes(newKey)) return;
    if (usedHotkeys.has(newKey) && newKey !== hotkey) return; // already taken

    // Release old, assign new
    if (hotkey) releaseHotkey(hotkey);
    hotkey = newKey;
    usedHotkeys.add(hotkey);
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

    // Update filters
    const newFilters: FilterSet = {
      slowed: itemData.filters.lowpass > 0,
      reverb: itemData.filters.reverb > 0,
      reversed: itemData.filters.reversed > 0,
      nightcore: itemData.filters.highpass > 0,
    };

    // Only update if changed
    if (JSON.stringify(filters) !== JSON.stringify(newFilters)) {
      Object.assign(filters, newFilters);
      for (let i = 0; i < filterDefs.length; i++) {
        const def = filterDefs[i]!;
        const fb = filterBubbles[i]!;
        fb.classList.toggle("active", filters[def.key]);
      }
      if (filters.reversed !== newFilters.reversed) {
        reversedCache = null;
      }
    }

    // Update hotkey
    if (itemData.hotkey !== hotkey) {
      if (hotkey) releaseHotkey(hotkey);
      hotkey = itemData.hotkey;
      if (hotkey) {
        usedHotkeys.add(hotkey);
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
    if (unsubscribe) unsubscribe();
    if (hotkey) releaseHotkey(hotkey);
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
    hotkey,
    name: nameLabel.textContent || "",
  };
}
