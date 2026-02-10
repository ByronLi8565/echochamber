import { Effect, Fiber, Scope } from "effect";

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

type Cleanup = () => void;

export class ScopedListeners {
  private cleanups: Cleanup[] = [];

  listen<E extends Event>(
    target: EventTarget,
    type: string,
    handler: (event: E) => void,
    options?: AddEventListenerOptions | boolean,
  ): Cleanup {
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    return this.addCleanup(() => {
      target.removeEventListener(type, listener, options);
    });
  }

  addCleanup(cleanup: Cleanup): Cleanup {
    let active = true;
    const wrapped = () => {
      if (!active) return;
      active = false;
      cleanup();
      this.cleanups = this.cleanups.filter((item) => item !== wrapped);
    };
    this.cleanups.push(wrapped);
    return wrapped;
  }

  dispose(): void {
    const pending = [...this.cleanups].reverse();
    this.cleanups = [];
    for (const cleanup of pending) {
      cleanup();
    }
  }
}

export function getTouchDistance(touch1: Touch, touch2: Touch): number {
  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getTouchCenter(
  touch1: Touch,
  touch2: Touch,
): { x: number; y: number } {
  return {
    x: (touch1.clientX + touch2.clientX) / 2,
    y: (touch1.clientY + touch2.clientY) / 2,
  };
}
