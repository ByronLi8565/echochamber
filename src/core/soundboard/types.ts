/**
 * Type definitions for soundboard components
 */

/**
 * Soundboard state enumeration
 * - empty: No audio recorded yet
 * - recording: Currently recording audio
 * - has-audio: Audio is recorded and ready to play
 */
export type SoundState = "empty" | "recording" | "has-audio";

/**
 * Complete filter settings for audio playback
 */
export interface FilterSet {
  /** Playback speed multiplier (0.5 - 1.75) */
  speedRate: number;
  /** Reverb effect intensity (0 - 1) */
  reverbIntensity: number;
  /** Whether to play audio in reverse */
  reversed: boolean;
  /** Whether to allow overlapping playback */
  playConcurrently: boolean;
  /** Whether to loop playback continuously */
  loopEnabled: boolean;
  /** Delay in seconds between loop iterations */
  loopDelaySeconds: number;
  /** Number of times to repeat playback */
  repeatCount: number;
  /** Delay in seconds between repeats */
  repeatDelaySeconds: number;
}
