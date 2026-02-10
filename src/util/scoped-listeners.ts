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
