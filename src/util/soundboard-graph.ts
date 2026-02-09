export interface LinkPair {
  itemA: string;
  itemB: string;
}

export interface SequentialPlaybackStep {
  itemId: string;
  parentId: string | null;
}

type ItemLike = { type?: unknown };
type ItemMap = Record<string, ItemLike | undefined>;

function isSoundboard(items: ItemMap, itemId: string): boolean {
  return items[itemId]?.type === "soundboard";
}

function buildAdjacency(
  items: ItemMap,
  links: LinkPair[],
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  const addNeighbor = (from: string, to: string): void => {
    let neighbors = adjacency.get(from);
    if (!neighbors) {
      neighbors = new Set<string>();
      adjacency.set(from, neighbors);
    }
    neighbors.add(to);
  };

  for (const { itemA, itemB } of links) {
    if (!isSoundboard(items, itemA) || !isSoundboard(items, itemB)) {
      continue;
    }
    addNeighbor(itemA, itemB);
    addNeighbor(itemB, itemA);
  }

  return adjacency;
}

export function getConnectedSoundboardIds(
  items: ItemMap,
  links: LinkPair[],
  originItemId: string,
): string[] {
  if (!isSoundboard(items, originItemId)) return [];

  const adjacency = buildAdjacency(items, links);
  const visited = new Set<string>([originItemId]);
  const queue: string[] = [originItemId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const neighbors = adjacency.get(current);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return Array.from(visited);
}

export function getSequentialSoundboardSteps(
  items: ItemMap,
  links: LinkPair[],
  originItemId: string,
): SequentialPlaybackStep[] {
  if (!isSoundboard(items, originItemId)) {
    return [{ itemId: originItemId, parentId: null }];
  }

  const adjacency = buildAdjacency(items, links);
  const steps: SequentialPlaybackStep[] = [
    { itemId: originItemId, parentId: null },
  ];
  const visited = new Set<string>([originItemId]);
  const queue: string[] = [originItemId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const neighbors = Array.from(adjacency.get(current) ?? []).sort();
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
      steps.push({ itemId: neighbor, parentId: current });
    }
  }

  return steps;
}
