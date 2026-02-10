/**
 * Tests for error handling utilities
 */

import { expect, test } from "bun:test";
import {
  EchoChamberError,
  AudioError,
  SyncError,
  StorageError,
  ImportExportError,
  ValidationError,
  errorBoundary,
  asyncErrorBoundary,
} from "../../src/util/errors";

test("AudioError should have correct category", () => {
  const error = new AudioError("Test error");
  expect(error.category).toBe("audio");
  expect(error.name).toBe("AudioError");
  expect(error.message).toBe("Test error");
  expect(error.isRecoverable).toBe(true);
});

test("SyncError should have correct category", () => {
  const error = new SyncError("Test error");
  expect(error.category).toBe("sync");
  expect(error.name).toBe("SyncError");
});

test("StorageError should have correct category", () => {
  const error = new StorageError("Test error");
  expect(error.category).toBe("persistence");
  expect(error.name).toBe("StorageError");
});

test("ImportExportError should have correct category", () => {
  const error = new ImportExportError("Test error");
  expect(error.category).toBe("app");
  expect(error.name).toBe("ImportExportError");
});

test("ValidationError should have correct category", () => {
  const error = new ValidationError("Test error");
  expect(error.category).toBe("app");
  expect(error.name).toBe("ValidationError");
});

test("Custom error options should be applied", () => {
  const error = new AudioError("Technical error", {
    userMessage: "User-friendly message",
    isRecoverable: false,
    cause: new Error("Root cause"),
  });

  expect(error.message).toBe("Technical error");
  expect(error.userMessage).toBe("User-friendly message");
  expect(error.isRecoverable).toBe(false);
  expect(error.cause).toBeInstanceOf(Error);
});

test("errorBoundary should catch errors and return fallback", () => {
  const result = errorBoundary(
    () => {
      throw new Error("Test error");
    },
    {
      operation: "test",
      fallback: "fallback value",
      showNotification: false,
    },
  );

  expect(result).toBe("fallback value");
});

test("errorBoundary should return successful result", () => {
  const result = errorBoundary(
    () => {
      return "success";
    },
    {
      operation: "test",
      fallback: "fallback value",
      showNotification: false,
    },
  );

  expect(result).toBe("success");
});

test("errorBoundary should rethrow if rethrow option is true", () => {
  expect(() => {
    errorBoundary(
      () => {
        throw new Error("Test error");
      },
      {
        operation: "test",
        rethrow: true,
        showNotification: false,
      },
    );
  }).toThrow("Test error");
});

test("asyncErrorBoundary should catch async errors", async () => {
  const result = await asyncErrorBoundary(
    async () => {
      throw new Error("Async error");
    },
    {
      operation: "test",
      fallback: "async fallback",
      showNotification: false,
    },
  );

  expect(result).toBe("async fallback");
});

test("asyncErrorBoundary should return successful result", async () => {
  const result = await asyncErrorBoundary(
    async () => {
      return "async success";
    },
    {
      operation: "test",
      fallback: "async fallback",
      showNotification: false,
    },
  );

  expect(result).toBe("async success");
});

test("asyncErrorBoundary should rethrow if rethrow option is true", async () => {
  let didThrow = false;
  try {
    await asyncErrorBoundary(
      async () => {
        throw new Error("Async error");
      },
      {
        operation: "test",
        rethrow: true,
        showNotification: false,
      },
    );
  } catch (error) {
    didThrow = true;
    expect((error as Error).message).toBe("Async error");
  }
  expect(didThrow).toBe(true);
});

test("errorBoundary should call custom error handler", () => {
  let handlerCalled = false;
  let handlerError: Error | null = null;

  errorBoundary(
    () => {
      throw new Error("Test error");
    },
    {
      operation: "test",
      showNotification: false,
      onError: (error) => {
        handlerCalled = true;
        handlerError = error;
      },
    },
  );

  expect(handlerCalled).toBe(true);
  expect(handlerError).toBeInstanceOf(Error);
  expect(handlerError?.message).toBe("Test error");
});

test("EchoChamberError should have timestamp", () => {
  const before = Date.now();
  const error = new AudioError("Test");
  const after = Date.now();

  expect(error.timestamp).toBeGreaterThanOrEqual(before);
  expect(error.timestamp).toBeLessThanOrEqual(after);
});
