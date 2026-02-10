/**
 * Soundboard module - main export
 * Re-exports all public APIs for backward compatibility
 */

// Types
export type { SoundState, FilterSet } from "./types.ts";

// Audio engine
export {
  getAudioContext,
  getReverbImpulse,
  reverseBuffer,
  clamp,
} from "./audio-engine.ts";

// Hotkey system
export { hotkeyRegistry, assignHotkey, releaseHotkey } from "./hotkeys.ts";

// UI and main component
export {
  createSoundboard,
  getReadableTextColor,
  updateSoundboardAdaptiveTextColor,
  parseCssColorToRgb,
} from "./ui.ts";
