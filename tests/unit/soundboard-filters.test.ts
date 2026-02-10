import { describe, test, expect } from "bun:test";
import { normalizeSoundboardFilters } from "../../src/util/soundboard-filters.ts";

describe("normalizeSoundboardFilters", () => {
  describe("with undefined input", () => {
    test("returns default values", () => {
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
  });

  describe("with empty object", () => {
    test("returns default values", () => {
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

  describe("speedRate", () => {
    test("uses explicit speedRate when provided", () => {
      const result = normalizeSoundboardFilters({ speedRate: 1.5 });
      expect(result.speedRate).toBe(1.5);
    });

    test("clamps speedRate to minimum 0.5", () => {
      const result = normalizeSoundboardFilters({ speedRate: 0.3 });
      expect(result.speedRate).toBe(0.5);
    });

    test("clamps speedRate to maximum 1.75", () => {
      const result = normalizeSoundboardFilters({ speedRate: 2.0 });
      expect(result.speedRate).toBe(1.75);
    });

    test("derives speedRate from legacy slowIntensity", () => {
      const result = normalizeSoundboardFilters({ slowIntensity: 1 });
      // speedRate = (1 - 0.45 * 1) * (1 + 0.75 * 0) = 0.55
      expect(result.speedRate).toBeCloseTo(0.55, 5);
    });

    test("derives speedRate from legacy speedIntensity", () => {
      const result = normalizeSoundboardFilters({ speedIntensity: 1 });
      // speedRate = (1 - 0.45 * 0) * (1 + 0.75 * 1) = 1.75
      expect(result.speedRate).toBe(1.75);
    });

    test("derives speedRate from both slow and speed intensity", () => {
      const result = normalizeSoundboardFilters({
        slowIntensity: 0.5,
        speedIntensity: 0.5,
      });
      // speedRate = (1 - 0.45 * 0.5) * (1 + 0.75 * 0.5) = 0.775 * 1.375 = 1.065625
      expect(result.speedRate).toBeCloseTo(1.065625, 5);
    });

    test("handles legacy lowpass filter (sets slowIntensity to 1)", () => {
      const result = normalizeSoundboardFilters({ lowpass: 1 });
      expect(result.speedRate).toBeCloseTo(0.55, 5);
    });

    test("handles legacy highpass filter (sets speedIntensity to 1)", () => {
      const result = normalizeSoundboardFilters({ highpass: 1 });
      expect(result.speedRate).toBe(1.75);
    });
  });

  describe("reverbIntensity", () => {
    test("uses explicit reverbIntensity when provided", () => {
      const result = normalizeSoundboardFilters({ reverbIntensity: 0.75 });
      expect(result.reverbIntensity).toBe(0.75);
    });

    test("handles legacy reverb > 0 by setting reverbIntensity to 1", () => {
      const result = normalizeSoundboardFilters({ reverb: 1 });
      expect(result.reverbIntensity).toBe(1);
    });

    test("handles legacy reverb = 0 by setting reverbIntensity to 0", () => {
      const result = normalizeSoundboardFilters({ reverb: 0 });
      expect(result.reverbIntensity).toBe(0);
    });

    test("allows negative reverbIntensity values", () => {
      const result = normalizeSoundboardFilters({ reverbIntensity: -0.5 });
      expect(result.reverbIntensity).toBe(-0.5);
    });

    test("allows reverbIntensity > 1", () => {
      const result = normalizeSoundboardFilters({ reverbIntensity: 2.5 });
      expect(result.reverbIntensity).toBe(2.5);
    });
  });

  describe("reversed", () => {
    test("converts truthy reversed to 1", () => {
      expect(normalizeSoundboardFilters({ reversed: 1 }).reversed).toBe(1);
      expect(normalizeSoundboardFilters({ reversed: 5 }).reversed).toBe(1);
      expect(normalizeSoundboardFilters({ reversed: 0.1 }).reversed).toBe(1);
    });

    test("converts falsy reversed to 0", () => {
      expect(normalizeSoundboardFilters({ reversed: 0 }).reversed).toBe(0);
      expect(normalizeSoundboardFilters({ reversed: -1 }).reversed).toBe(0);
    });
  });

  describe("playConcurrently", () => {
    test("converts truthy playConcurrently to 1", () => {
      expect(
        normalizeSoundboardFilters({ playConcurrently: 1 }).playConcurrently,
      ).toBe(1);
      expect(
        normalizeSoundboardFilters({ playConcurrently: 10 }).playConcurrently,
      ).toBe(1);
    });

    test("converts falsy playConcurrently to 0", () => {
      expect(
        normalizeSoundboardFilters({ playConcurrently: 0 }).playConcurrently,
      ).toBe(0);
      expect(
        normalizeSoundboardFilters({ playConcurrently: -5 }).playConcurrently,
      ).toBe(0);
    });
  });

  describe("loopEnabled", () => {
    test("converts truthy loopEnabled to 1", () => {
      expect(normalizeSoundboardFilters({ loopEnabled: 1 }).loopEnabled).toBe(
        1,
      );
      expect(normalizeSoundboardFilters({ loopEnabled: 100 }).loopEnabled).toBe(
        1,
      );
    });

    test("converts falsy loopEnabled to 0", () => {
      expect(normalizeSoundboardFilters({ loopEnabled: 0 }).loopEnabled).toBe(
        0,
      );
      expect(
        normalizeSoundboardFilters({ loopEnabled: -10 }).loopEnabled,
      ).toBe(0);
    });
  });

  describe("loopDelaySeconds", () => {
    test("accepts positive values", () => {
      expect(
        normalizeSoundboardFilters({ loopDelaySeconds: 2.5 }).loopDelaySeconds,
      ).toBe(2.5);
    });

    test("clamps negative values to 0", () => {
      expect(
        normalizeSoundboardFilters({ loopDelaySeconds: -5 }).loopDelaySeconds,
      ).toBe(0);
    });

    test("defaults to 0", () => {
      expect(normalizeSoundboardFilters({}).loopDelaySeconds).toBe(0);
    });
  });

  describe("repeatCount", () => {
    test("accepts positive integers", () => {
      expect(normalizeSoundboardFilters({ repeatCount: 5 }).repeatCount).toBe(
        5,
      );
    });

    test("rounds non-integer values", () => {
      expect(
        normalizeSoundboardFilters({ repeatCount: 3.7 }).repeatCount,
      ).toBe(4);
      expect(
        normalizeSoundboardFilters({ repeatCount: 3.2 }).repeatCount,
      ).toBe(3);
    });

    test("clamps to minimum 1", () => {
      expect(normalizeSoundboardFilters({ repeatCount: 0 }).repeatCount).toBe(
        1,
      );
      expect(
        normalizeSoundboardFilters({ repeatCount: -5 }).repeatCount,
      ).toBe(1);
    });

    test("defaults to 1", () => {
      expect(normalizeSoundboardFilters({}).repeatCount).toBe(1);
    });
  });

  describe("repeatDelaySeconds", () => {
    test("accepts positive values", () => {
      expect(
        normalizeSoundboardFilters({ repeatDelaySeconds: 1.5 })
          .repeatDelaySeconds,
      ).toBe(1.5);
    });

    test("clamps negative values to 0", () => {
      expect(
        normalizeSoundboardFilters({ repeatDelaySeconds: -3 })
          .repeatDelaySeconds,
      ).toBe(0);
    });

    test("defaults to 0", () => {
      expect(normalizeSoundboardFilters({}).repeatDelaySeconds).toBe(0);
    });
  });

  describe("invalid input handling", () => {
    test("handles non-numeric strings", () => {
      const result = normalizeSoundboardFilters({
        speedRate: "invalid",
        reverbIntensity: "abc",
        repeatCount: "xyz",
      });
      expect(result.speedRate).toBe(1);
      expect(result.reverbIntensity).toBe(0);
      expect(result.repeatCount).toBe(1);
    });

    test("handles null values (null coerces to 0)", () => {
      const result = normalizeSoundboardFilters({
        speedRate: null,
        reverbIntensity: null,
      });
      // null -> Number(null) -> 0, but 0 is not finite in this context
      // Actually Number(null) = 0, which IS finite, so speedRate gets clamped to 0.5 min
      expect(result.speedRate).toBe(0.5);
      expect(result.reverbIntensity).toBe(0);
    });

    test("handles undefined values in object", () => {
      const result = normalizeSoundboardFilters({
        speedRate: undefined,
        reverbIntensity: undefined,
      });
      expect(result.speedRate).toBe(1);
      expect(result.reverbIntensity).toBe(0);
    });

    test("handles NaN", () => {
      const result = normalizeSoundboardFilters({
        speedRate: NaN,
        reverbIntensity: NaN,
      });
      expect(result.speedRate).toBe(1);
      expect(result.reverbIntensity).toBe(0);
    });

    test("handles Infinity", () => {
      const result = normalizeSoundboardFilters({
        speedRate: Infinity,
        reverbIntensity: -Infinity,
      });
      expect(result.speedRate).toBe(1);
      expect(result.reverbIntensity).toBe(0);
    });
  });

  describe("complex scenarios", () => {
    test("handles mix of legacy and new properties", () => {
      const result = normalizeSoundboardFilters({
        lowpass: 1,
        speedRate: 1.2,
        reverb: 1,
        reverbIntensity: 0.5,
      });
      // Explicit speedRate should override derived
      expect(result.speedRate).toBe(1.2);
      // Explicit reverbIntensity should override legacy reverb
      expect(result.reverbIntensity).toBe(0.5);
    });

    test("handles all properties at once", () => {
      const result = normalizeSoundboardFilters({
        speedRate: 1.3,
        reverbIntensity: 0.8,
        reversed: 1,
        playConcurrently: 1,
        loopEnabled: 1,
        loopDelaySeconds: 2.5,
        repeatCount: 3,
        repeatDelaySeconds: 1.0,
      });
      expect(result).toEqual({
        speedRate: 1.3,
        reverbIntensity: 0.8,
        reversed: 1,
        playConcurrently: 1,
        loopEnabled: 1,
        loopDelaySeconds: 2.5,
        repeatCount: 3,
        repeatDelaySeconds: 1.0,
      });
    });
  });
});
