import {
  REVERB_DURATION_SECONDS,
  SPEED_RATE_MIN,
  SPEED_RATE_MAX,
  REVERB_INTENSITY_MIN,
  REVERB_INTENSITY_MAX,
  REPEAT_COUNT_MIN,
} from "../config/constants.ts";

export interface NormalizedSoundFilters {
  speedRate: number;
  reverbIntensity: number;
  reversed: number;
  playConcurrently: number;
  loopEnabled: number;
  loopDelaySeconds: number;
  repeatCount: number;
  repeatDelaySeconds: number;
}

let audioCtx: AudioContext | null = null;
let reverbImpulse: AudioBuffer | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readNumber(
  rawFilters: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(rawFilters[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeSoundboardFilters(
  rawFiltersInput: Record<string, unknown> | undefined,
): NormalizedSoundFilters {
  const rawFilters = rawFiltersInput ?? {};
  const lowpass = Number(rawFilters.lowpass ?? 0);
  const highpass = Number(rawFilters.highpass ?? 0);
  const legacySlowIntensity = Number(rawFilters.slowIntensity ?? 0);
  const legacySpeedIntensity = Number(rawFilters.speedIntensity ?? 0);
  const legacyReverb = Number(rawFilters.reverb ?? 0);
  const reversed = Number(rawFilters.reversed ?? 0);

  const normalizedSlow = clamp(
    readNumber(
      rawFilters,
      "slowIntensity",
      lowpass > 0 ? 1 : legacySlowIntensity,
    ),
    0,
    1,
  );
  const normalizedSpeed = clamp(
    readNumber(
      rawFilters,
      "speedIntensity",
      highpass > 0 ? 1 : legacySpeedIntensity,
    ),
    0,
    1,
  );
  const derivedSpeedRate = clamp(
    (1 - 0.45 * normalizedSlow) * (1 + 0.75 * normalizedSpeed),
    SPEED_RATE_MIN,
    SPEED_RATE_MAX,
  );

  return {
    speedRate: clamp(
      readNumber(rawFilters, "speedRate", derivedSpeedRate),
      SPEED_RATE_MIN,
      SPEED_RATE_MAX,
    ),
    reverbIntensity: clamp(
      readNumber(
        rawFilters,
        "reverbIntensity",
        legacyReverb > 0 ? 1 : 0,
      ),
      REVERB_INTENSITY_MIN,
      REVERB_INTENSITY_MAX,
    ),
    reversed: reversed > 0 ? 1 : 0,
    playConcurrently: readNumber(rawFilters, "playConcurrently", 0) > 0 ? 1 : 0,
    loopEnabled: readNumber(rawFilters, "loopEnabled", 0) > 0 ? 1 : 0,
    loopDelaySeconds: Math.max(0, readNumber(rawFilters, "loopDelaySeconds", 0)),
    repeatCount: Math.max(
      REPEAT_COUNT_MIN,
      Math.round(readNumber(rawFilters, "repeatCount", REPEAT_COUNT_MIN)),
    ),
    repeatDelaySeconds: Math.max(
      0,
      readNumber(rawFilters, "repeatDelaySeconds", 0),
    ),
  };
}
