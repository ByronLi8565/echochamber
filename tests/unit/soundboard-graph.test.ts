import { describe, test, expect } from "bun:test";
import {
  getConnectedSoundboardIds,
  getSequentialSoundboardSteps,
  type LinkPair,
} from "../../src/util/soundboard-graph.ts";

describe("getConnectedSoundboardIds", () => {
  describe("with no items", () => {
    test("returns empty array for non-existent origin", () => {
      const items = {};
      const links: LinkPair[] = [];
      const result = getConnectedSoundboardIds(items, links, "item1");
      expect(result).toEqual([]);
    });
  });

  describe("with non-soundboard items", () => {
    test("returns empty array if origin is not a soundboard", () => {
      const items = { item1: { type: "textbox" } };
      const links: LinkPair[] = [];
      const result = getConnectedSoundboardIds(items, links, "item1");
      expect(result).toEqual([]);
    });

    test("ignores links to non-soundboard items", () => {
      const items = {
        sb1: { type: "soundboard" },
        tb1: { type: "textbox" },
      };
      const links: LinkPair[] = [{ itemA: "sb1", itemB: "tb1" }];
      const result = getConnectedSoundboardIds(items, links, "sb1");
      expect(result).toEqual(["sb1"]);
    });
  });

  describe("with isolated soundboard", () => {
    test("returns only the origin soundboard", () => {
      const items = { sb1: { type: "soundboard" } };
      const links: LinkPair[] = [];
      const result = getConnectedSoundboardIds(items, links, "sb1");
      expect(result).toEqual(["sb1"]);
    });
  });

  describe("with simple chain", () => {
    test("returns all connected soundboards in a 2-node chain", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
      };
      const links: LinkPair[] = [{ itemA: "sb1", itemB: "sb2" }];
      const result = getConnectedSoundboardIds(items, links, "sb1");
      expect(result.sort()).toEqual(["sb1", "sb2"]);
    });

    test("returns all connected soundboards in a 3-node chain", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "sb1", itemB: "sb2" },
        { itemA: "sb2", itemB: "sb3" },
      ];
      const result = getConnectedSoundboardIds(items, links, "sb1");
      expect(result.sort()).toEqual(["sb1", "sb2", "sb3"]);
    });

    test("works from any node in the chain", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "sb1", itemB: "sb2" },
        { itemA: "sb2", itemB: "sb3" },
      ];
      const result = getConnectedSoundboardIds(items, links, "sb2");
      expect(result.sort()).toEqual(["sb1", "sb2", "sb3"]);
    });
  });

  describe("with branching graphs", () => {
    test("returns all connected soundboards in a star topology", () => {
      const items = {
        center: { type: "soundboard" },
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "center", itemB: "sb1" },
        { itemA: "center", itemB: "sb2" },
        { itemA: "center", itemB: "sb3" },
      ];
      const result = getConnectedSoundboardIds(items, links, "center");
      expect(result.sort()).toEqual(["center", "sb1", "sb2", "sb3"]);
    });

    test("handles complex branching", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
        sb4: { type: "soundboard" },
        sb5: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "sb1", itemB: "sb2" },
        { itemA: "sb1", itemB: "sb3" },
        { itemA: "sb2", itemB: "sb4" },
        { itemA: "sb3", itemB: "sb5" },
      ];
      const result = getConnectedSoundboardIds(items, links, "sb1");
      expect(result.sort()).toEqual(["sb1", "sb2", "sb3", "sb4", "sb5"]);
    });
  });

  describe("with cycles", () => {
    test("handles simple cycle without infinite loop", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "sb1", itemB: "sb2" },
        { itemA: "sb2", itemB: "sb3" },
        { itemA: "sb3", itemB: "sb1" },
      ];
      const result = getConnectedSoundboardIds(items, links, "sb1");
      expect(result.sort()).toEqual(["sb1", "sb2", "sb3"]);
    });

    test("handles complex graph with multiple cycles", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
        sb4: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "sb1", itemB: "sb2" },
        { itemA: "sb2", itemB: "sb3" },
        { itemA: "sb3", itemB: "sb4" },
        { itemA: "sb4", itemB: "sb1" },
        { itemA: "sb1", itemB: "sb3" },
      ];
      const result = getConnectedSoundboardIds(items, links, "sb1");
      expect(result.sort()).toEqual(["sb1", "sb2", "sb3", "sb4"]);
    });
  });

  describe("with disconnected components", () => {
    test("returns only the connected component", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
        sb4: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "sb1", itemB: "sb2" },
        { itemA: "sb3", itemB: "sb4" },
      ];
      const result = getConnectedSoundboardIds(items, links, "sb1");
      expect(result.sort()).toEqual(["sb1", "sb2"]);
    });
  });

  describe("with bidirectional links", () => {
    test("treats links as undirected (both directions work)", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
      };
      const links: LinkPair[] = [{ itemA: "sb1", itemB: "sb2" }];
      const result1 = getConnectedSoundboardIds(items, links, "sb1");
      const result2 = getConnectedSoundboardIds(items, links, "sb2");
      expect(result1.sort()).toEqual(["sb1", "sb2"]);
      expect(result2.sort()).toEqual(["sb1", "sb2"]);
    });
  });
});

describe("getSequentialSoundboardSteps", () => {
  describe("with non-soundboard origin", () => {
    test("returns single step with null parent", () => {
      const items = { tb1: { type: "textbox" } };
      const links: LinkPair[] = [];
      const result = getSequentialSoundboardSteps(items, links, "tb1");
      expect(result).toEqual([{ itemId: "tb1", parentId: null }]);
    });

    test("returns single step for non-existent item", () => {
      const items = {};
      const links: LinkPair[] = [];
      const result = getSequentialSoundboardSteps(items, links, "missing");
      expect(result).toEqual([{ itemId: "missing", parentId: null }]);
    });
  });

  describe("with isolated soundboard", () => {
    test("returns single step with null parent", () => {
      const items = { sb1: { type: "soundboard" } };
      const links: LinkPair[] = [];
      const result = getSequentialSoundboardSteps(items, links, "sb1");
      expect(result).toEqual([{ itemId: "sb1", parentId: null }]);
    });
  });

  describe("with linear chain", () => {
    test("returns steps in BFS order for 2-node chain", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
      };
      const links: LinkPair[] = [{ itemA: "sb1", itemB: "sb2" }];
      const result = getSequentialSoundboardSteps(items, links, "sb1");
      expect(result).toEqual([
        { itemId: "sb1", parentId: null },
        { itemId: "sb2", parentId: "sb1" },
      ]);
    });

    test("returns steps in BFS order for 3-node chain", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "sb1", itemB: "sb2" },
        { itemA: "sb2", itemB: "sb3" },
      ];
      const result = getSequentialSoundboardSteps(items, links, "sb1");
      expect(result).toEqual([
        { itemId: "sb1", parentId: null },
        { itemId: "sb2", parentId: "sb1" },
        { itemId: "sb3", parentId: "sb2" },
      ]);
    });
  });

  describe("with branching graphs", () => {
    test("returns steps in BFS order with sorted neighbors", () => {
      const items = {
        center: { type: "soundboard" },
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "center", itemB: "sb3" },
        { itemA: "center", itemB: "sb1" },
        { itemA: "center", itemB: "sb2" },
      ];
      const result = getSequentialSoundboardSteps(items, links, "center");
      expect(result).toEqual([
        { itemId: "center", parentId: null },
        { itemId: "sb1", parentId: "center" },
        { itemId: "sb2", parentId: "center" },
        { itemId: "sb3", parentId: "center" },
      ]);
    });

    test("handles complex tree structure", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
        sb4: { type: "soundboard" },
        sb5: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "sb1", itemB: "sb2" },
        { itemA: "sb1", itemB: "sb3" },
        { itemA: "sb2", itemB: "sb4" },
        { itemA: "sb2", itemB: "sb5" },
      ];
      const result = getSequentialSoundboardSteps(items, links, "sb1");
      expect(result).toEqual([
        { itemId: "sb1", parentId: null },
        { itemId: "sb2", parentId: "sb1" },
        { itemId: "sb3", parentId: "sb1" },
        { itemId: "sb4", parentId: "sb2" },
        { itemId: "sb5", parentId: "sb2" },
      ]);
    });
  });

  describe("with cycles", () => {
    test("handles cycle without duplicates", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "sb1", itemB: "sb2" },
        { itemA: "sb2", itemB: "sb3" },
        { itemA: "sb3", itemB: "sb1" },
      ];
      const result = getSequentialSoundboardSteps(items, links, "sb1");
      expect(result.length).toBe(3);
      expect(result[0]).toEqual({ itemId: "sb1", parentId: null });
      // sb2 and sb3 are visited but only once each
      const itemIds = result.map((step) => step.itemId);
      expect(new Set(itemIds).size).toBe(3);
    });
  });

  describe("with disconnected components", () => {
    test("returns only the connected component", () => {
      const items = {
        sb1: { type: "soundboard" },
        sb2: { type: "soundboard" },
        sb3: { type: "soundboard" },
        sb4: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "sb1", itemB: "sb2" },
        { itemA: "sb3", itemB: "sb4" },
      ];
      const result = getSequentialSoundboardSteps(items, links, "sb1");
      expect(result.length).toBe(2);
      const itemIds = result.map((step) => step.itemId);
      expect(itemIds.sort()).toEqual(["sb1", "sb2"]);
    });
  });

  describe("parent tracking", () => {
    test("correctly tracks parent for each node", () => {
      const items = {
        root: { type: "soundboard" },
        child1: { type: "soundboard" },
        child2: { type: "soundboard" },
        grandchild: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "root", itemB: "child1" },
        { itemA: "root", itemB: "child2" },
        { itemA: "child1", itemB: "grandchild" },
      ];
      const result = getSequentialSoundboardSteps(items, links, "root");
      expect(result).toEqual([
        { itemId: "root", parentId: null },
        { itemId: "child1", parentId: "root" },
        { itemId: "child2", parentId: "root" },
        { itemId: "grandchild", parentId: "child1" },
      ]);
    });
  });

  describe("neighbor sorting", () => {
    test("neighbors are sorted alphabetically", () => {
      const items = {
        center: { type: "soundboard" },
        zebra: { type: "soundboard" },
        alpha: { type: "soundboard" },
        beta: { type: "soundboard" },
      };
      const links: LinkPair[] = [
        { itemA: "center", itemB: "zebra" },
        { itemA: "center", itemB: "alpha" },
        { itemA: "center", itemB: "beta" },
      ];
      const result = getSequentialSoundboardSteps(items, links, "center");
      expect(result.map((s) => s.itemId)).toEqual([
        "center",
        "alpha",
        "beta",
        "zebra",
      ]);
    });
  });
});
