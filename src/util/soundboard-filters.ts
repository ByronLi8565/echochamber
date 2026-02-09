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

function clamp(value: number, min: number, max: number): number {
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
    0.5,
    1.75,
  );

  return {
    speedRate: clamp(readNumber(rawFilters, "speedRate", derivedSpeedRate), 0.5, 1.75),
    reverbIntensity: readNumber(
      rawFilters,
      "reverbIntensity",
      legacyReverb > 0 ? 1 : 0,
    ),
    reversed: reversed > 0 ? 1 : 0,
    playConcurrently: readNumber(rawFilters, "playConcurrently", 0) > 0 ? 1 : 0,
    loopEnabled: readNumber(rawFilters, "loopEnabled", 0) > 0 ? 1 : 0,
    loopDelaySeconds: Math.max(0, readNumber(rawFilters, "loopDelaySeconds", 0)),
    repeatCount: Math.max(1, Math.round(readNumber(rawFilters, "repeatCount", 1))),
    repeatDelaySeconds: Math.max(
      0,
      readNumber(rawFilters, "repeatDelaySeconds", 0),
    ),
  };
}
