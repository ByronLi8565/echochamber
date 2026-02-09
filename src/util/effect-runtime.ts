import { Data, Effect, Fiber, Scope } from "effect";

export function runPromise<A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A> {
  return Effect.runPromise(effect);
}

export function runSync<A, E>(effect: Effect.Effect<A, E, never>): A {
  return Effect.runSync(effect);
}

export function runFork<A, E>(
  effect: Effect.Effect<A, E, never>,
): Fiber.RuntimeFiber<A, E> {
  return Effect.runFork(effect);
}

export function listen<E extends Event>(
  target: EventTarget,
  type: string,
  handler: (event: E) => void,
  options?: AddEventListenerOptions | boolean,
): Effect.Effect<void, never, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.sync(() =>
      target.addEventListener(type, handler as EventListener, options),
    ),
    () =>
      Effect.sync(() =>
        target.removeEventListener(type, handler as EventListener, options),
      ),
  );
}

export class DecodeError extends Data.TaggedError("DecodeError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class SyncError extends Data.TaggedError("SyncError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
