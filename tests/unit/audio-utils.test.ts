import { describe, test, expect, beforeAll } from "bun:test";

// Mock AudioContext and AudioBuffer for testing
class MockAudioBuffer {
  public numberOfChannels: number;
  public length: number;
  public sampleRate: number;
  private channels: Float32Array[];

  constructor(
    options: AudioBufferOptions | { numberOfChannels: number; length: number; sampleRate: number },
  ) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.channels = Array.from(
      { length: this.numberOfChannels },
      () => new Float32Array(this.length),
    );
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new Error(`Channel ${channel} does not exist`);
    return data;
  }

  copyToChannel(source: Float32Array, channelNumber: number, startInChannel = 0): void {
    const channel = this.getChannelData(channelNumber);
    channel.set(source, startInChannel);
  }

  copyFromChannel(destination: Float32Array, channelNumber: number, startInChannel = 0): void {
    const channel = this.getChannelData(channelNumber);
    destination.set(channel.subarray(startInChannel, startInChannel + destination.length));
  }
}

class MockAudioContext {
  public sampleRate = 44100;

  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): MockAudioBuffer {
    return new MockAudioBuffer({ numberOfChannels, length, sampleRate });
  }
}

// Audio utility functions extracted from soundboard.ts for testing
function reverseBuffer(
  ctx: MockAudioContext,
  buffer: MockAudioBuffer,
): MockAudioBuffer {
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

describe("reverseBuffer", () => {
  let ctx: MockAudioContext;

  beforeAll(() => {
    ctx = new MockAudioContext();
  });

  test("reverses mono audio buffer", () => {
    const buffer = ctx.createBuffer(1, 5, 44100);
    const channel = buffer.getChannelData(0);
    channel[0] = 0.1;
    channel[1] = 0.2;
    channel[2] = 0.3;
    channel[3] = 0.4;
    channel[4] = 0.5;

    const reversed = reverseBuffer(ctx, buffer);
    const reversedChannel = reversed.getChannelData(0);

    expect(reversedChannel[0]).toBeCloseTo(0.5, 5);
    expect(reversedChannel[1]).toBeCloseTo(0.4, 5);
    expect(reversedChannel[2]).toBeCloseTo(0.3, 5);
    expect(reversedChannel[3]).toBeCloseTo(0.2, 5);
    expect(reversedChannel[4]).toBeCloseTo(0.1, 5);
  });

  test("reverses stereo audio buffer", () => {
    const buffer = ctx.createBuffer(2, 3, 44100);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    left[0] = 0.1;
    left[1] = 0.2;
    left[2] = 0.3;
    right[0] = 0.4;
    right[1] = 0.5;
    right[2] = 0.6;

    const reversed = reverseBuffer(ctx, buffer);
    const reversedLeft = reversed.getChannelData(0);
    const reversedRight = reversed.getChannelData(1);

    expect(reversedLeft[0]).toBeCloseTo(0.3, 5);
    expect(reversedLeft[1]).toBeCloseTo(0.2, 5);
    expect(reversedLeft[2]).toBeCloseTo(0.1, 5);
    expect(reversedRight[0]).toBeCloseTo(0.6, 5);
    expect(reversedRight[1]).toBeCloseTo(0.5, 5);
    expect(reversedRight[2]).toBeCloseTo(0.4, 5);
  });

  test("handles empty buffer", () => {
    const buffer = ctx.createBuffer(1, 0, 44100);
    const reversed = reverseBuffer(ctx, buffer);
    expect(reversed.length).toBe(0);
  });

  test("handles single sample buffer", () => {
    const buffer = ctx.createBuffer(1, 1, 44100);
    const channel = buffer.getChannelData(0);
    channel[0] = 0.42;

    const reversed = reverseBuffer(ctx, buffer);
    const reversedChannel = reversed.getChannelData(0);

    expect(reversedChannel[0]).toBeCloseTo(0.42, 5);
  });

  test("preserves buffer properties", () => {
    const buffer = ctx.createBuffer(2, 100, 48000);
    const reversed = reverseBuffer(ctx, buffer);

    expect(reversed.numberOfChannels).toBe(2);
    expect(reversed.length).toBe(100);
    expect(reversed.sampleRate).toBe(48000);
  });

  test("does not mutate original buffer", () => {
    const buffer = ctx.createBuffer(1, 3, 44100);
    const channel = buffer.getChannelData(0);
    channel[0] = 0.1;
    channel[1] = 0.2;
    channel[2] = 0.3;

    reverseBuffer(ctx, buffer);

    expect(channel[0]).toBeCloseTo(0.1, 5);
    expect(channel[1]).toBeCloseTo(0.2, 5);
    expect(channel[2]).toBeCloseTo(0.3, 5);
  });

  test("handles multi-channel buffer (5.1 audio)", () => {
    const buffer = ctx.createBuffer(6, 2, 44100);
    for (let ch = 0; ch < 6; ch++) {
      const channel = buffer.getChannelData(ch);
      channel[0] = ch * 0.1;
      channel[1] = ch * 0.1 + 0.01;
    }

    const reversed = reverseBuffer(ctx, buffer);

    for (let ch = 0; ch < 6; ch++) {
      const reversedChannel = reversed.getChannelData(ch);
      expect(reversedChannel[0]).toBeCloseTo(ch * 0.1 + 0.01, 5);
      expect(reversedChannel[1]).toBeCloseTo(ch * 0.1, 5);
    }
  });

  test("double reverse returns to original", () => {
    const buffer = ctx.createBuffer(1, 5, 44100);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < 5; i++) {
      channel[i] = i * 0.1;
    }

    const reversed1 = reverseBuffer(ctx, buffer);
    const reversed2 = reverseBuffer(ctx, reversed1);
    const finalChannel = reversed2.getChannelData(0);

    for (let i = 0; i < 5; i++) {
      expect(finalChannel[i]).toBeCloseTo(i * 0.1, 5);
    }
  });

  test("handles zero-filled buffer", () => {
    const buffer = ctx.createBuffer(1, 5, 44100);
    // Default is zero-filled
    const reversed = reverseBuffer(ctx, buffer);
    const reversedChannel = reversed.getChannelData(0);

    for (let i = 0; i < 5; i++) {
      expect(reversedChannel[i]).toBe(0);
    }
  });

  test("handles negative values", () => {
    const buffer = ctx.createBuffer(1, 3, 44100);
    const channel = buffer.getChannelData(0);
    channel[0] = -0.5;
    channel[1] = 0.0;
    channel[2] = 0.5;

    const reversed = reverseBuffer(ctx, buffer);
    const reversedChannel = reversed.getChannelData(0);

    expect(reversedChannel[0]).toBe(0.5);
    expect(reversedChannel[1]).toBe(0.0);
    expect(reversedChannel[2]).toBe(-0.5);
  });
});

describe("audio buffer utilities", () => {
  describe("MockAudioBuffer", () => {
    test("creates buffer with correct properties", () => {
      const ctx = new MockAudioContext();
      const buffer = ctx.createBuffer(2, 1024, 44100);

      expect(buffer.numberOfChannels).toBe(2);
      expect(buffer.length).toBe(1024);
      expect(buffer.sampleRate).toBe(44100);
    });

    test("initializes channels with zeros", () => {
      const ctx = new MockAudioContext();
      const buffer = ctx.createBuffer(1, 10, 44100);
      const channel = buffer.getChannelData(0);

      for (let i = 0; i < 10; i++) {
        expect(channel[i]).toBe(0);
      }
    });

    test("allows setting and getting channel data", () => {
      const ctx = new MockAudioContext();
      const buffer = ctx.createBuffer(1, 5, 44100);
      const channel = buffer.getChannelData(0);

      channel[0] = 0.5;
      channel[1] = -0.5;
      channel[2] = 1.0;

      expect(channel[0]).toBe(0.5);
      expect(channel[1]).toBe(-0.5);
      expect(channel[2]).toBe(1.0);
    });

    test("throws error for invalid channel index", () => {
      const ctx = new MockAudioContext();
      const buffer = ctx.createBuffer(2, 10, 44100);

      expect(() => buffer.getChannelData(2)).toThrow();
      expect(() => buffer.getChannelData(-1)).toThrow();
    });

    test("provides independent channel data", () => {
      const ctx = new MockAudioContext();
      const buffer = ctx.createBuffer(2, 5, 44100);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      left[0] = 0.1;
      right[0] = 0.9;

      expect(left[0]).toBeCloseTo(0.1, 5);
      expect(right[0]).toBeCloseTo(0.9, 5);
    });
  });
});
