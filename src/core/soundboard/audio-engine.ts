/**
 * Audio playback and processing engine
 * Handles AudioContext, reverb generation, buffer reversal, and audio filters
 */

import {
  REVERB_DURATION_SECONDS,
  SPEED_RATE_MIN,
  SPEED_RATE_MAX,
  REVERB_INTENSITY_MIN,
  REVERB_INTENSITY_MAX,
} from "../../config/constants.ts";

// --- Shared audio infrastructure ---

let audioCtx: AudioContext | null = null;
let reverbImpulse: AudioBuffer | null = null;

/**
 * Get or create the shared AudioContext
 * Resumes the context if it was suspended
 */
export function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

/**
 * Get or generate a reverb impulse response buffer
 * Creates a 2-second stereo reverb tail with exponential decay
 * @param ctx - The audio context to create the buffer in
 */
export function getReverbImpulse(ctx: AudioContext): AudioBuffer {
  if (!reverbImpulse) {
    const rate = ctx.sampleRate;
    const length = rate * REVERB_DURATION_SECONDS;
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

/**
 * Create a reversed copy of an audio buffer
 * @param ctx - The audio context to create the buffer in
 * @param buffer - The source audio buffer to reverse
 * @returns A new AudioBuffer with reversed audio
 */
export function reverseBuffer(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
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

/**
 * Clamp a value between min and max
 * @param value - The value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
