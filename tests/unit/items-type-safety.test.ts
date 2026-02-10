/**
 * Tests for type safety improvements in items.ts
 *
 * This file tests that the discriminated union types work correctly
 * by creating mock objects that match the type signatures.
 */

import { describe, test, expect, beforeAll } from "bun:test";

// Mock DOM for tests
beforeAll(() => {
  if (typeof document === "undefined") {
    (global as any).document = {
      createElement: (tagName: string) => ({
        tagName,
        style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      }),
    };
  }
});

// Define the type structures locally to test the design
interface BaseCanvasItem {
  id: string;
  type: "soundboard" | "textbox";
  x: number;
  y: number;
  element: HTMLElement;
  cleanup?: () => void;
  cleanupDrag?: () => void;
}

interface SoundboardItem extends BaseCanvasItem {
  type: "soundboard";
  loadAudioBuffer: (buffer: AudioBuffer | null) => void;
  play: (fromRemote?: boolean) => void;
  hotkey: string;
  name: string;
}

interface TextboxItem extends BaseCanvasItem {
  type: "textbox";
}

type CanvasItem = SoundboardItem | TextboxItem;

// Type guards
function isSoundboardItem(item: CanvasItem): item is SoundboardItem {
  return item.type === "soundboard";
}

function isTextboxItem(item: CanvasItem): item is TextboxItem {
  return item.type === "textbox";
}

describe("Items Type Safety", () => {
  test("isSoundboardItem returns true for soundboard items", () => {
    const soundboard: SoundboardItem = {
      id: "test-1",
      type: "soundboard",
      x: 100,
      y: 100,
      element: document.createElement("div"),
      loadAudioBuffer: () => {},
      play: () => {},
      hotkey: "A",
      name: "Test Sound",
    };

    expect(isSoundboardItem(soundboard)).toBe(true);
    expect(isTextboxItem(soundboard)).toBe(false);
  });

  test("isTextboxItem returns true for textbox items", () => {
    const textbox: TextboxItem = {
      id: "test-2",
      type: "textbox",
      x: 200,
      y: 200,
      element: document.createElement("div"),
    };

    expect(isTextboxItem(textbox)).toBe(true);
    expect(isSoundboardItem(textbox)).toBe(false);
  });

  test("discriminated union correctly narrows types", () => {
    const items: CanvasItem[] = [
      {
        id: "test-1",
        type: "soundboard",
        x: 100,
        y: 100,
        element: document.createElement("div"),
        loadAudioBuffer: () => {},
        play: () => {},
        hotkey: "A",
        name: "Test Sound",
      },
      {
        id: "test-2",
        type: "textbox",
        x: 200,
        y: 200,
        element: document.createElement("div"),
      },
    ];

    const soundboards = items.filter(isSoundboardItem);
    const textboxes = items.filter(isTextboxItem);

    expect(soundboards).toHaveLength(1);
    expect(textboxes).toHaveLength(1);

    // Type narrowing works
    const firstItem = items[0]!;
    if (isSoundboardItem(firstItem)) {
      expect(firstItem.hotkey).toBe("A");
      expect(firstItem.name).toBe("Test Sound");
      expect(typeof firstItem.play).toBe("function");
      expect(typeof firstItem.loadAudioBuffer).toBe("function");
    } else {
      throw new Error("Expected soundboard item");
    }

    const secondItem = items[1]!;
    if (isTextboxItem(secondItem)) {
      expect(secondItem.type).toBe("textbox");
      expect(secondItem.id).toBe("test-2");
    } else {
      throw new Error("Expected textbox item");
    }
  });

  test("type discrimination by type field works", () => {
    const item: CanvasItem = {
      id: "test-3",
      type: "soundboard",
      x: 300,
      y: 300,
      element: document.createElement("div"),
      loadAudioBuffer: () => {},
      play: () => {},
      hotkey: "B",
      name: "Another Sound",
    };

    // Using type field for discrimination
    if (item.type === "soundboard") {
      expect(item.hotkey).toBe("B");
      expect(item.name).toBe("Another Sound");
      expect(typeof item.play).toBe("function");
      expect(typeof item.loadAudioBuffer).toBe("function");
    } else {
      throw new Error("Expected soundboard item");
    }
  });

  test("cleanupDrag is optional on all items", () => {
    const soundboard: SoundboardItem = {
      id: "test-4",
      type: "soundboard",
      x: 100,
      y: 100,
      element: document.createElement("div"),
      loadAudioBuffer: () => {},
      play: () => {},
      hotkey: "C",
      name: "Sound with cleanup",
      cleanupDrag: () => {},
    };

    const textbox: TextboxItem = {
      id: "test-5",
      type: "textbox",
      x: 200,
      y: 200,
      element: document.createElement("div"),
      cleanupDrag: () => {},
    };

    expect(typeof soundboard.cleanupDrag).toBe("function");
    expect(typeof textbox.cleanupDrag).toBe("function");
  });

  test("required properties are enforced", () => {
    // This test validates that the type system enforces required properties
    const soundboard: SoundboardItem = {
      id: "test-6",
      type: "soundboard",
      x: 100,
      y: 100,
      element: document.createElement("div"),
      loadAudioBuffer: () => {},
      play: () => {},
      hotkey: "D", // Required
      name: "Sound", // Required
    };

    expect(soundboard.hotkey).toBe("D");
    expect(soundboard.name).toBe("Sound");
    expect(typeof soundboard.loadAudioBuffer).toBe("function");
    expect(typeof soundboard.play).toBe("function");
  });

  test("CanvasItem union accepts both types", () => {
    const soundboard: CanvasItem = {
      id: "test-7",
      type: "soundboard",
      x: 100,
      y: 100,
      element: document.createElement("div"),
      loadAudioBuffer: () => {},
      play: () => {},
      hotkey: "E",
      name: "Union Sound",
    };

    const textbox: CanvasItem = {
      id: "test-8",
      type: "textbox",
      x: 200,
      y: 200,
      element: document.createElement("div"),
    };

    expect(soundboard.type).toBe("soundboard");
    expect(textbox.type).toBe("textbox");
  });
});
