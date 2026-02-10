import { describe, expect, test, beforeAll } from "bun:test";

// Mock AudioContext and AudioBuffer since they're not available in test environment
class MockAudioBuffer implements AudioBuffer {
  sampleRate: number;
  length: number;
  duration: number;
  numberOfChannels: number;
  private channelData: Float32Array[];

  constructor(
    numberOfChannels: number,
    length: number,
    sampleRate: number
  ) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channelData = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length)
    );
  }

  getChannelData(channel: number): Float32Array {
    return this.channelData[channel]!;
  }

  copyFromChannel(
    destination: Float32Array,
    channelNumber: number,
    bufferOffset?: number
  ): void {
    const offset = bufferOffset ?? 0;
    const src = this.channelData[channelNumber]!;
    for (let i = 0; i < destination.length; i++) {
      destination[i] = src[offset + i] ?? 0;
    }
  }

  copyToChannel(
    source: Float32Array,
    channelNumber: number,
    bufferOffset?: number
  ): void {
    const offset = bufferOffset ?? 0;
    const dst = this.channelData[channelNumber]!;
    for (let i = 0; i < source.length; i++) {
      dst[offset + i] = source[i] ?? 0;
    }
  }
}

class MockAudioContext {
  sampleRate: number = 48000;

  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number
  ): MockAudioBuffer {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate);
  }
}

// Copy of reverseBuffer function from soundboard.ts for testing
function reverseBuffer(
  ctx: MockAudioContext,
  buffer: MockAudioBuffer
): MockAudioBuffer {
  const reversed = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
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

describe("reverseBuffer", () => {
  let ctx: MockAudioContext;

  beforeAll(() => {
    ctx = new MockAudioContext();
  });

  describe("mono audio", () => {
    test("reverses mono audio buffer", () => {
      const buffer = ctx.createBuffer(1, 5, 48000);
      const data = buffer.getChannelData(0);
      data[0] = 1.0;
      data[1] = 2.0;
      data[2] = 3.0;
      data[3] = 4.0;
      data[4] = 5.0;

      const reversed = reverseBuffer(ctx, buffer);
      const reversedData = reversed.getChannelData(0);

      expect(reversedData[0]).toBe(5.0);
      expect(reversedData[1]).toBe(4.0);
      expect(reversedData[2]).toBe(3.0);
      expect(reversedData[3]).toBe(2.0);
      expect(reversedData[4]).toBe(1.0);
    });

    test("preserves buffer properties for mono", () => {
      const buffer = ctx.createBuffer(1, 100, 44100);
      const reversed = reverseBuffer(ctx, buffer);

      expect(reversed.numberOfChannels).toBe(1);
      expect(reversed.length).toBe(100);
      expect(reversed.sampleRate).toBe(44100);
    });
  });

  describe("stereo audio", () => {
    test("reverses stereo audio buffer", () => {
      const buffer = ctx.createBuffer(2, 4, 48000);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      left[0] = 1.0;
      left[1] = 2.0;
      left[2] = 3.0;
      left[3] = 4.0;

      right[0] = 0.1;
      right[1] = 0.2;
      right[2] = 0.3;
      right[3] = 0.4;

      const reversed = reverseBuffer(ctx, buffer);
      const reversedLeft = reversed.getChannelData(0);
      const reversedRight = reversed.getChannelData(1);

      expect(reversedLeft[0]).toBe(4.0);
      expect(reversedLeft[3]).toBe(1.0);
      expect(reversedRight[0]).toBeCloseTo(0.4, 5);
      expect(reversedRight[3]).toBeCloseTo(0.1, 5);
    });

    test("preserves buffer properties for stereo", () => {
      const buffer = ctx.createBuffer(2, 100, 44100);
      const reversed = reverseBuffer(ctx, buffer);

      expect(reversed.numberOfChannels).toBe(2);
      expect(reversed.length).toBe(100);
      expect(reversed.sampleRate).toBe(44100);
    });
  });

  describe("multi-channel audio", () => {
    test("reverses 5.1 surround audio", () => {
      const buffer = ctx.createBuffer(6, 3, 48000);

      for (let ch = 0; ch < 6; ch++) {
        const data = buffer.getChannelData(ch);
        data[0] = ch + 1;
        data[1] = ch + 10;
        data[2] = ch + 100;
      }

      const reversed = reverseBuffer(ctx, buffer);

      for (let ch = 0; ch < 6; ch++) {
        const data = reversed.getChannelData(ch);
        expect(data[0]).toBe(ch + 100);
        expect(data[1]).toBe(ch + 10);
        expect(data[2]).toBe(ch + 1);
      }
    });
  });

  describe("edge cases", () => {
    test("handles single sample buffer", () => {
      const buffer = ctx.createBuffer(1, 1, 48000);
      buffer.getChannelData(0)[0] = 42.0;

      const reversed = reverseBuffer(ctx, buffer);

      expect(reversed.getChannelData(0)[0]).toBe(42.0);
    });

    test("handles empty buffer (zero length)", () => {
      const buffer = ctx.createBuffer(1, 0, 48000);
      const reversed = reverseBuffer(ctx, buffer);

      expect(reversed.length).toBe(0);
    });

    test("handles buffer with zeros", () => {
      const buffer = ctx.createBuffer(1, 5, 48000);
      // All zeros by default

      const reversed = reverseBuffer(ctx, buffer);
      const data = reversed.getChannelData(0);

      for (let i = 0; i < 5; i++) {
        expect(data[i]).toBe(0);
      }
    });

    test("handles negative values", () => {
      const buffer = ctx.createBuffer(1, 3, 48000);
      const data = buffer.getChannelData(0);
      data[0] = -1.0;
      data[1] = 0.0;
      data[2] = 1.0;

      const reversed = reverseBuffer(ctx, buffer);
      const reversedData = reversed.getChannelData(0);

      expect(reversedData[0]).toBe(1.0);
      expect(reversedData[1]).toBe(0.0);
      expect(reversedData[2]).toBe(-1.0);
    });

    test("does not mutate original buffer", () => {
      const buffer = ctx.createBuffer(1, 3, 48000);
      const data = buffer.getChannelData(0);
      data[0] = 1.0;
      data[1] = 2.0;
      data[2] = 3.0;

      const originalCopy = [data[0], data[1], data[2]];
      reverseBuffer(ctx, buffer);

      expect(data[0]).toBe(originalCopy[0]);
      expect(data[1]).toBe(originalCopy[1]);
      expect(data[2]).toBe(originalCopy[2]);
    });
  });
});
