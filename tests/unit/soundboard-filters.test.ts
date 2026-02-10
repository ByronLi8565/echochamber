import { describe, expect, test } from "bun:test";
import { normalizeSoundboardFilters } from "../../src/util/audio-utils";

describe("normalizeSoundboardFilters", () => {
  describe("default values", () => {
    test("returns defaults when input is undefined", () => {
      const result = normalizeSoundboardFilters(undefined);
      expect(result).toEqual({
        speedRate: 1,
        reverbIntensity: 0,
        reversed: 0,
        playConcurrently: 0,
        loopEnabled: 0,
        loopDelaySeconds: 0,
        repeatCount: 1,
        repeatDelaySeconds: 0,
      });
    });

    test("returns defaults when input is empty object", () => {
      const result = normalizeSoundboardFilters({});
      expect(result).toEqual({
        speedRate: 1,
        reverbIntensity: 0,
        reversed: 0,
        playConcurrently: 0,
        loopEnabled: 0,
        loopDelaySeconds: 0,
        repeatCount: 1,
        repeatDelaySeconds: 0,
      });
    });
  });

  describe("speedRate calculation and clamping", () => {
    test("clamps speedRate to minimum of 0.5", () => {
      const result = normalizeSoundboardFilters({ speedRate: 0.3 });
      expect(result.speedRate).toBe(0.5);
    });

    test("clamps speedRate to maximum of 1.75", () => {
      const result = normalizeSoundboardFilters({ speedRate: 2.5 });
      expect(result.speedRate).toBe(1.75);
    });

    test("accepts speedRate within valid range", () => {
      const result = normalizeSoundboardFilters({ speedRate: 1.2 });
      expect(result.speedRate).toBe(1.2);
    });

    test("derives speedRate from slowIntensity", () => {
      const result = normalizeSoundboardFilters({ slowIntensity: 1 });
      expect(result.speedRate).toBeCloseTo(0.55, 2);
    });

    test("derives speedRate from speedIntensity", () => {
      const result = normalizeSoundboardFilters({ speedIntensity: 1 });
      expect(result.speedRate).toBe(1.75);
    });

    test("derives speedRate from combined slow and speed intensities", () => {
      const result = normalizeSoundboardFilters({
        slowIntensity: 0.5,
        speedIntensity: 0.5,
      });
      // (1 - 0.45 * 0.5) * (1 + 0.75 * 0.5) = 0.775 * 1.375 = 1.065625
      expect(result.speedRate).toBeCloseTo(1.065625, 4);
    });

    test("handles explicit speedRate override of derived value", () => {
      const result = normalizeSoundboardFilters({
        slowIntensity: 1,
        speedRate: 1.5,
      });
      expect(result.speedRate).toBe(1.5);
    });
  });

  describe("legacy filter migration", () => {
    test("migrates lowpass to slowIntensity", () => {
      const result = normalizeSoundboardFilters({ lowpass: 1 });
      expect(result.speedRate).toBeCloseTo(0.55, 2);
    });

    test("migrates highpass to speedIntensity", () => {
      const result = normalizeSoundboardFilters({ highpass: 1 });
      expect(result.speedRate).toBe(1.75);
    });

    test("migrates reverb to reverbIntensity", () => {
      const result = normalizeSoundboardFilters({ reverb: 0.5 });
      expect(result.reverbIntensity).toBe(1);
    });

    test("migrates reverb zero to reverbIntensity zero", () => {
      const result = normalizeSoundboardFilters({ reverb: 0 });
      expect(result.reverbIntensity).toBe(0);
    });

    test("explicit reverbIntensity overrides legacy reverb", () => {
      const result = normalizeSoundboardFilters({
        reverb: 1,
        reverbIntensity: 0.5,
      });
      expect(result.reverbIntensity).toBe(0.5);
    });
  });

  describe("reversed flag", () => {
    test("sets reversed to 1 when input is truthy number", () => {
      const result = normalizeSoundboardFilters({ reversed: 1 });
      expect(result.reversed).toBe(1);
    });

    test("sets reversed to 0 when input is 0", () => {
      const result = normalizeSoundboardFilters({ reversed: 0 });
      expect(result.reversed).toBe(0);
    });

    test("sets reversed to 0 when input is negative", () => {
      const result = normalizeSoundboardFilters({ reversed: -1 });
      expect(result.reversed).toBe(0);
    });

    test("treats reversed as boolean flag", () => {
      const result = normalizeSoundboardFilters({ reversed: 42 });
      expect(result.reversed).toBe(1);
    });
  });

  describe("playConcurrently flag", () => {
    test("sets playConcurrently to 1 when input is truthy", () => {
      const result = normalizeSoundboardFilters({ playConcurrently: 1 });
      expect(result.playConcurrently).toBe(1);
    });

    test("sets playConcurrently to 0 when input is 0", () => {
      const result = normalizeSoundboardFilters({ playConcurrently: 0 });
      expect(result.playConcurrently).toBe(0);
    });
  });

  describe("loopEnabled flag", () => {
    test("sets loopEnabled to 1 when input is truthy", () => {
      const result = normalizeSoundboardFilters({ loopEnabled: 1 });
      expect(result.loopEnabled).toBe(1);
    });

    test("sets loopEnabled to 0 when input is 0", () => {
      const result = normalizeSoundboardFilters({ loopEnabled: 0 });
      expect(result.loopEnabled).toBe(0);
    });
  });

  describe("loopDelaySeconds validation", () => {
    test("accepts valid positive loopDelaySeconds", () => {
      const result = normalizeSoundboardFilters({ loopDelaySeconds: 2.5 });
      expect(result.loopDelaySeconds).toBe(2.5);
    });

    test("clamps negative loopDelaySeconds to 0", () => {
      const result = normalizeSoundboardFilters({ loopDelaySeconds: -5 });
      expect(result.loopDelaySeconds).toBe(0);
    });

    test("accepts loopDelaySeconds of 0", () => {
      const result = normalizeSoundboardFilters({ loopDelaySeconds: 0 });
      expect(result.loopDelaySeconds).toBe(0);
    });
  });

  describe("repeatCount validation", () => {
    test("rounds repeatCount to integer", () => {
      const result = normalizeSoundboardFilters({ repeatCount: 3.7 });
      expect(result.repeatCount).toBe(4);
    });

    test("clamps repeatCount to minimum of 1", () => {
      const result = normalizeSoundboardFilters({ repeatCount: 0 });
      expect(result.repeatCount).toBe(1);
    });

    test("clamps negative repeatCount to minimum of 1", () => {
      const result = normalizeSoundboardFilters({ repeatCount: -5 });
      expect(result.repeatCount).toBe(1);
    });

    test("accepts valid positive repeatCount", () => {
      const result = normalizeSoundboardFilters({ repeatCount: 10 });
      expect(result.repeatCount).toBe(10);
    });
  });

  describe("repeatDelaySeconds validation", () => {
    test("accepts valid positive repeatDelaySeconds", () => {
      const result = normalizeSoundboardFilters({ repeatDelaySeconds: 1.5 });
      expect(result.repeatDelaySeconds).toBe(1.5);
    });

    test("clamps negative repeatDelaySeconds to 0", () => {
      const result = normalizeSoundboardFilters({ repeatDelaySeconds: -2 });
      expect(result.repeatDelaySeconds).toBe(0);
    });

    test("accepts repeatDelaySeconds of 0", () => {
      const result = normalizeSoundboardFilters({ repeatDelaySeconds: 0 });
      expect(result.repeatDelaySeconds).toBe(0);
    });
  });

  describe("invalid input handling", () => {
    test("handles NaN speedRate", () => {
      const result = normalizeSoundboardFilters({ speedRate: NaN });
      expect(result.speedRate).toBe(1);
    });

    test("handles Infinity speedRate", () => {
      const result = normalizeSoundboardFilters({ speedRate: Infinity });
      // Infinity is not finite, so falls back to default (1), then is clamped
      expect(result.speedRate).toBe(1);
    });

    test("handles -Infinity speedRate", () => {
      const result = normalizeSoundboardFilters({ speedRate: -Infinity });
      // -Infinity is not finite, so falls back to default (1), then is clamped
      expect(result.speedRate).toBe(1);
    });

    test("handles null values", () => {
      const result = normalizeSoundboardFilters({ speedRate: null as any });
      // Number(null) = 0, which is clamped to 0.5 minimum
      expect(result.speedRate).toBe(0.5);
    });

    test("handles undefined values", () => {
      const result = normalizeSoundboardFilters({ speedRate: undefined });
      expect(result.speedRate).toBe(1);
    });

    test("handles string values", () => {
      const result = normalizeSoundboardFilters({ speedRate: "1.5" as any });
      expect(result.speedRate).toBe(1.5);
    });

    test("handles invalid string values", () => {
      const result = normalizeSoundboardFilters({
        speedRate: "invalid" as any,
      });
      expect(result.speedRate).toBe(1);
    });
  });
});
