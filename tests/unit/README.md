# Unit Tests

This directory contains unit tests for EchoChamber utility functions and business logic.

## Running Tests

```bash
# Run all tests
bun test

# Run only unit tests
bun test tests/unit

# Run a specific test file
bun test tests/unit/soundboard-filters.test.ts

# Run tests in watch mode
bun test --watch
```

## Test Coverage

### soundboard-filters.test.ts (38 tests)

Tests for `normalizeSoundboardFilters` function which sanitizes and normalizes soundboard filter configurations.

**Coverage:**
- Default value handling
- Speed rate calculations and clamping (0.5-1.75 range)
- Legacy filter migration (lowpass, highpass, reverb → speedRate, reverbIntensity)
- Boolean flags (reversed, playConcurrently, loopEnabled)
- Numeric validation (loopDelaySeconds, repeatCount, repeatDelaySeconds)
- Invalid input handling (null, undefined, NaN, Infinity)

### soundboard-graph.test.ts (30 tests)

Tests for graph traversal algorithms used in soundboard linking and sequential playback.

**Coverage:**
- `getConnectedSoundboardIds`: BFS traversal to find all connected soundboards
  - Basic connectivity
  - Cycles and complex graphs
  - Disconnected components
  - Mixed item types (soundboards vs textboxes)
- `getSequentialSoundboardSteps`: Ordered sequence with parent tracking
  - Parent-child relationships
  - BFS level ordering
  - Cycle handling without revisiting

### audio-utils.test.ts (9 tests)

Tests for audio buffer manipulation utilities.

**Coverage:**
- `reverseBuffer` function
  - Mono audio reversal
  - Stereo audio reversal
  - Multi-channel audio (5.1 surround)
  - Edge cases (single sample, empty buffer, zeros, negative values)
  - Immutability (original buffer not mutated)

## Writing New Tests

When adding new utility functions, follow these guidelines:

1. Create a new test file in `tests/unit/` with the pattern `<module-name>.test.ts`
2. Use Bun's built-in test runner (`import { describe, expect, test } from "bun:test"`)
3. Group related tests with `describe` blocks
4. Test edge cases and error conditions
5. Keep tests fast and isolated (no network, file system, or browser dependencies)
6. Use descriptive test names that explain what is being tested

## Test Structure

```typescript
import { describe, expect, test } from "bun:test";
import { functionToTest } from "../../src/path/to/module";

describe("functionToTest", () => {
  describe("feature category", () => {
    test("should do something specific", () => {
      const result = functionToTest(input);
      expect(result).toBe(expected);
    });
  });
});
```

## Mocking

For browser APIs not available in the test environment (AudioContext, IndexedDB, etc.), create lightweight mock implementations at the top of the test file. See `audio-utils.test.ts` for an example of mocking AudioContext.

## Notes

- Unit tests should be fast (<1ms per test)
- Avoid dependencies on external state
- Mock browser APIs when necessary
- Test both success and failure paths
- Use precise assertions (`toBe`, `toEqual`, `toBeCloseTo` for floats)
