import { describe, expect, test } from "bun:test";
import {
  getConnectedSoundboardIds,
  getSequentialSoundboardSteps,
  type LinkPair
} from "../../src/util/soundboard-graph";

describe("getConnectedSoundboardIds", () => {
  describe("basic connectivity", () => {
    test("returns only origin for isolated soundboard", () => {
      const items = { s1: { type: "soundboard" } };
      const links: LinkPair[] = [];
      const result = getConnectedSoundboardIds(items, links, "s1");
      expect(result).toEqual(["s1"]);
    });

    test("returns empty array for non-soundboard item", () => {
      const items = { t1: { type: "textbox" } };
      const links: LinkPair[] = [];
      const result = getConnectedSoundboardIds(items, links, "t1");
      expect(result).toEqual([]);
    });

    test("returns empty array for non-existent item", () => {
      const items = {};
      const links: LinkPair[] = [];
      const result = getConnectedSoundboardIds(items, links, "nonexistent");
      expect(result).toEqual([]);
    });

    test("returns connected pair", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" }
      };
      const links: LinkPair[] = [{ itemA: "s1", itemB: "s2" }];
      const result = getConnectedSoundboardIds(items, links, "s1");
      expect(result.sort()).toEqual(["s1", "s2"]);
    });

    test("returns all items in linear chain", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s2", itemB: "s3" }
      ];
      const result = getConnectedSoundboardIds(items, links, "s1");
      expect(result.sort()).toEqual(["s1", "s2", "s3"]);
    });

    test("returns all items in branching graph", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" },
        s4: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s1", itemB: "s3" },
        { itemA: "s2", itemB: "s4" }
      ];
      const result = getConnectedSoundboardIds(items, links, "s1");
      expect(result.sort()).toEqual(["s1", "s2", "s3", "s4"]);
    });
  });

  describe("cycles and complex graphs", () => {
    test("handles simple cycle", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s2", itemB: "s3" },
        { itemA: "s3", itemB: "s1" }
      ];
      const result = getConnectedSoundboardIds(items, links, "s1");
      expect(result.sort()).toEqual(["s1", "s2", "s3"]);
    });

    test("handles self-loop", () => {
      const items = {
        s1: { type: "soundboard" }
      };
      const links: LinkPair[] = [{ itemA: "s1", itemB: "s1" }];
      const result = getConnectedSoundboardIds(items, links, "s1");
      expect(result).toEqual(["s1"]);
    });

    test("handles complex graph with multiple cycles", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" },
        s4: { type: "soundboard" },
        s5: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s2", itemB: "s3" },
        { itemA: "s3", itemB: "s1" },
        { itemA: "s3", itemB: "s4" },
        { itemA: "s4", itemB: "s5" },
        { itemA: "s5", itemB: "s3" }
      ];
      const result = getConnectedSoundboardIds(items, links, "s1");
      expect(result.sort()).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    });
  });

  describe("disconnected components", () => {
    test("only returns items in same component", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" },
        s4: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s3", itemB: "s4" }
      ];
      const result = getConnectedSoundboardIds(items, links, "s1");
      expect(result.sort()).toEqual(["s1", "s2"]);
    });

    test("returns different components from different origins", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" }
      };
      const links: LinkPair[] = [{ itemA: "s1", itemB: "s2" }];

      const result1 = getConnectedSoundboardIds(items, links, "s1");
      const result3 = getConnectedSoundboardIds(items, links, "s3");

      expect(result1.sort()).toEqual(["s1", "s2"]);
      expect(result3).toEqual(["s3"]);
    });
  });

  describe("mixed item types", () => {
    test("ignores links involving non-soundboard items", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        t1: { type: "textbox" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "t1" },
        { itemA: "t1", itemB: "s2" }
      ];
      const result = getConnectedSoundboardIds(items, links, "s1");
      expect(result).toEqual(["s1"]);
    });

    test("traverses soundboard links while ignoring textbox links", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" },
        t1: { type: "textbox" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s2", itemB: "t1" },
        { itemA: "s2", itemB: "s3" }
      ];
      const result = getConnectedSoundboardIds(items, links, "s1");
      expect(result.sort()).toEqual(["s1", "s2", "s3"]);
    });
  });
});

describe("getSequentialSoundboardSteps", () => {
  describe("basic sequencing", () => {
    test("returns single step for isolated soundboard", () => {
      const items = { s1: { type: "soundboard" } };
      const links: LinkPair[] = [];
      const result = getSequentialSoundboardSteps(items, links, "s1");
      expect(result).toEqual([{ itemId: "s1", parentId: null }]);
    });

    test("returns single step for non-soundboard item", () => {
      const items = { t1: { type: "textbox" } };
      const links: LinkPair[] = [];
      const result = getSequentialSoundboardSteps(items, links, "t1");
      expect(result).toEqual([{ itemId: "t1", parentId: null }]);
    });

    test("returns ordered steps for connected pair", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" }
      };
      const links: LinkPair[] = [{ itemA: "s1", itemB: "s2" }];
      const result = getSequentialSoundboardSteps(items, links, "s1");
      expect(result).toEqual([
        { itemId: "s1", parentId: null },
        { itemId: "s2", parentId: "s1" }
      ]);
    });

    test("returns ordered steps for linear chain", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s2", itemB: "s3" }
      ];
      const result = getSequentialSoundboardSteps(items, links, "s1");
      expect(result).toEqual([
        { itemId: "s1", parentId: null },
        { itemId: "s2", parentId: "s1" },
        { itemId: "s3", parentId: "s2" }
      ]);
    });
  });

  describe("parent tracking", () => {
    test("tracks parent IDs in branching structure", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s1", itemB: "s3" }
      ];
      const result = getSequentialSoundboardSteps(items, links, "s1");

      expect(result[0]).toEqual({ itemId: "s1", parentId: null });
      expect(result.slice(1).every(step => step.parentId === "s1")).toBe(true);
      expect(result.length).toBe(3);
    });

    test("tracks multi-level parent relationships", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" },
        s4: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s2", itemB: "s3" },
        { itemA: "s2", itemB: "s4" }
      ];
      const result = getSequentialSoundboardSteps(items, links, "s1");

      expect(result[0]).toEqual({ itemId: "s1", parentId: null });
      expect(result.find(s => s.itemId === "s2")?.parentId).toBe("s1");
      const s3 = result.find(s => s.itemId === "s3");
      const s4 = result.find(s => s.itemId === "s4");
      expect(s3?.parentId).toBe("s2");
      expect(s4?.parentId).toBe("s2");
    });
  });

  describe("ordering and consistency", () => {
    test("produces consistent ordering with sorted neighbors", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" },
        s4: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s4" },
        { itemA: "s1", itemB: "s2" },
        { itemA: "s1", itemB: "s3" }
      ];
      const result = getSequentialSoundboardSteps(items, links, "s1");

      const ids = result.slice(1).map(s => s.itemId);
      expect(ids).toEqual(["s2", "s3", "s4"]);
    });

    test("maintains BFS level ordering", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" },
        s4: { type: "soundboard" },
        s5: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s1", itemB: "s3" },
        { itemA: "s2", itemB: "s4" },
        { itemA: "s3", itemB: "s5" }
      ];
      const result = getSequentialSoundboardSteps(items, links, "s1");

      expect(result[0].itemId).toBe("s1");
      const level1 = result.slice(1, 3).map(s => s.itemId).sort();
      const level2 = result.slice(3, 5).map(s => s.itemId).sort();
      expect(level1).toEqual(["s2", "s3"]);
      expect(level2).toEqual(["s4", "s5"]);
    });
  });

  describe("cycles and revisiting", () => {
    test("handles cycle without revisiting nodes", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s2", itemB: "s3" },
        { itemA: "s3", itemB: "s1" }
      ];
      const result = getSequentialSoundboardSteps(items, links, "s1");

      expect(result.length).toBe(3);
      const ids = result.map(s => s.itemId);
      expect(new Set(ids).size).toBe(3);
    });

    test("handles complex cycles with branches", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        s3: { type: "soundboard" },
        s4: { type: "soundboard" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "s2" },
        { itemA: "s2", itemB: "s3" },
        { itemA: "s3", itemB: "s1" },
        { itemA: "s2", itemB: "s4" }
      ];
      const result = getSequentialSoundboardSteps(items, links, "s1");

      expect(result.length).toBe(4);
      const ids = result.map(s => s.itemId);
      expect(new Set(ids).size).toBe(4);
    });
  });

  describe("mixed item types", () => {
    test("ignores textbox items in links", () => {
      const items = {
        s1: { type: "soundboard" },
        s2: { type: "soundboard" },
        t1: { type: "textbox" }
      };
      const links: LinkPair[] = [
        { itemA: "s1", itemB: "t1" },
        { itemA: "t1", itemB: "s2" }
      ];
      const result = getSequentialSoundboardSteps(items, links, "s1");
      expect(result).toEqual([{ itemId: "s1", parentId: null }]);
    });
  });
});
