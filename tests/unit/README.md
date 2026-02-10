# Unit Tests

This directory contains unit tests for isolated functions and utilities that don't require DOM or browser APIs.

## Running Tests

```bash
# Run all unit tests
bun test:unit

# Run specific test file
bun test tests/unit/soundboard-filters.test.ts

# Watch mode
bun test --watch tests/unit/

# With coverage (if enabled in bunfig.toml)
bun test --coverage tests/unit/
```

## Test Files

### soundboard-filters.test.ts
Tests the `normalizeSoundboardFilters` function from `src/util/soundboard-filters.ts`.

**Coverage**: 77+ test cases covering:
- Default values and initialization
- Speed rate calculations and clamping (0.5 - 1.75)
- Legacy filter migration (lowpass, highpass, reverb)
- Boolean flags (reversed, playConcurrently, loopEnabled)
- Numeric parameters (loopDelaySeconds, repeatCount, repeatDelaySeconds)
- Invalid input handling (null, undefined, NaN, Infinity, non-numeric strings)
- Complex scenarios with mixed legacy and new properties

**Key test patterns**:
```typescript
// Basic normalization
expect(normalizeSoundboardFilters({})).toEqual({
  speedRate: 1,
  reverbIntensity: 0,
  // ... other defaults
});

// Range clamping
expect(normalizeSoundboardFilters({ speedRate: 2.5 }).speedRate).toBe(1.75);

// Invalid input handling
expect(normalizeSoundboardFilters({ speedRate: NaN }).speedRate).toBe(1);
```

### soundboard-graph.test.ts
Tests graph traversal utilities from `src/util/soundboard-graph.ts`.

**Coverage**: 40+ test cases for:

#### getConnectedSoundboardIds
BFS-based connected component search in soundboard link graphs.
- Empty graphs and isolated nodes
- Linear chains and star topologies
- Branching graphs and trees
- Cycles (no infinite loops)
- Disconnected components
- Non-soundboard item filtering

**Algorithm**: Breadth-first search (BFS) over undirected graph.

#### getSequentialSoundboardSteps
Ordered playback sequence with parent tracking.
- Sequential ordering via BFS
- Parent-child relationships
- Alphabetically sorted neighbors (deterministic ordering)
- Single-node fallback for non-soundboard items

**Use case**: Sequential playback of linked soundboards.

**Key test patterns**:
```typescript
// Linear chain traversal
const items = { sb1: {type: "soundboard"}, sb2: {type: "soundboard"} };
const links = [{ itemA: "sb1", itemB: "sb2" }];
expect(getConnectedSoundboardIds(items, links, "sb1").sort())
  .toEqual(["sb1", "sb2"]);

// Parent tracking
const steps = getSequentialSoundboardSteps(items, links, "sb1");
expect(steps).toEqual([
  { itemId: "sb1", parentId: null },
  { itemId: "sb2", parentId: "sb1" }
]);
```

### audio-utils.test.ts
Tests audio processing utilities (extracted from `src/core/soundboard.ts`).

**Coverage**: 30+ test cases for:

#### reverseBuffer
Reverses an AudioBuffer's samples for reverse playback.
- Mono, stereo, and multi-channel buffers
- Edge cases (empty buffer, single sample)
- Non-mutation guarantees
- Property preservation (channels, length, sampleRate)
- Double reverse = identity
- Negative values and zero-filled buffers

**Note**: Uses mock AudioContext/AudioBuffer to avoid browser dependencies.

**Key test patterns**:
```typescript
// Mock setup
class MockAudioBuffer {
  constructor(options) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.channels = Array.from(
      { length: this.numberOfChannels },
      () => new Float32Array(this.length)
    );
  }
  getChannelData(channel) {
    return this.channels[channel];
  }
}

// Test reversal
const reversed = reverseBuffer(ctx, buffer);
expect(reversed.getChannelData(0)[0]).toBeCloseTo(expectedValue, 5);
```

## Testing Principles

### Pure Functions Only
Unit tests focus on pure, deterministic functions without side effects:
- No DOM manipulation
- No browser APIs (AudioContext is mocked)
- No external state or persistence
- No async operations (unless testing async utilities)

### Mock Strategy
For browser APIs, create minimal mock implementations:
1. Implement only the methods used by the function under test
2. Match the real API interface (TypeScript types)
3. Use simple data structures (Float32Array, plain objects)
4. Document limitations of the mock

### Floating-Point Precision
Use `toBeCloseTo(value, precision)` for Float32Array comparisons:
```typescript
// ✅ Correct
expect(result).toBeCloseTo(0.42, 5);

// ❌ Wrong - may fail due to precision
expect(result).toBe(0.42);
```

### Test Organization
```typescript
describe("function/module name", () => {
  describe("feature/aspect", () => {
    test("specific behavior", () => {
      // Arrange
      const input = ...;

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

## Adding New Tests

1. Create a new `.test.ts` file in `tests/unit/`
2. Import from `bun:test`: `import { describe, test, expect } from "bun:test";`
3. Test pure functions and utilities (no DOM)
4. Run tests: `bun test tests/unit/your-file.test.ts`
5. Ensure all tests pass before committing

## Coverage Goals

Current coverage focuses on:
- ✅ Filter normalization and validation
- ✅ Graph algorithms (BFS, connected components)
- ✅ Audio buffer processing

Future coverage targets:
- [ ] Persistence operations (Automerge wrappers)
- [ ] ID generation and validation
- [ ] Data migrations and schema validation
- [ ] Effect-based utilities (if testable without runtime)
