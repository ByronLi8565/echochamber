import { Effect, Fiber, Queue, Ref, pipe } from "effect";
import { WebSocket as ReconnectingWebSocket } from "partysocket";
import { runFork, runSync } from "../util/effect-runtime.ts";

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

interface SyncClientHandlers {
  onOpen: () => void;
  onClose: () => void;
  onError: () => void;
  onJsonMessage: (raw: string) => void;
  onBinaryMessage: (payload: ArrayBuffer) => void;
}

type OutboundPayload = string | ArrayBuffer | ArrayBufferView;

export class SyncClient {
  private socket: ReconnectingWebSocket | null = null;
  private socketRef!: Ref.Ref<ReconnectingWebSocket | null>;
  private sendQueue!: Queue.Queue<OutboundPayload>;
  private sendFiber: Fiber.RuntimeFiber<void, never> | null = null;

  constructor(
    private readonly roomCode: string,
    private readonly handlers: SyncClientHandlers,
  ) {
    this.initializeState();
  }

  start(): void {
    this.stop();
    this.initializeState();
    this.startSendWorker();
    this.connect();
  }

  stop(): void {
    const fiber = this.sendFiber;
    this.sendFiber = null;
    if (fiber) {
      runSync(Fiber.interrupt(fiber));
    }

    const socket = this.socket;
    this.socket = null;
    runSync(Ref.set(this.socketRef, null));
    if (socket) {
      socket.close(1000, "sync-stop");
    }
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  sendJson(raw: string): boolean {
    return this.enqueue(raw);
  }

  sendBinary(payload: ArrayBuffer | ArrayBufferView): boolean {
    return this.enqueue(payload);
  }

  private initializeState(): void {
    const state = runSync(
      Effect.gen(function* () {
        const socketRef = yield* Ref.make<ReconnectingWebSocket | null>(null);
        const sendQueue = yield* Queue.unbounded<OutboundPayload>();
        return { socketRef, sendQueue };
      }),
    );

    this.socketRef = state.socketRef;
    this.sendQueue = state.sendQueue;
  }

  private enqueue(payload: OutboundPayload): boolean {
    if (!this.isOpen()) return false;

    return runSync(
      pipe(
        Queue.offer(this.sendQueue, payload),
        Effect.catchAll(() => Effect.succeed(false)),
      ),
    );
  }

  private startSendWorker(): void {
    const queue = this.sendQueue;
    const socketRef = this.socketRef;
    this.sendFiber = runFork(
      Effect.forever(
        pipe(
          Queue.take(queue),
          Effect.flatMap((payload) =>
            pipe(
              Ref.get(socketRef),
              Effect.flatMap((socket) =>
                Effect.try({
                  try: () => {
                    if (!socket || socket.readyState !== WebSocket.OPEN) return;
                    if (typeof payload === "string" || payload instanceof ArrayBuffer) {
                      socket.send(payload);
                      return;
                    }
                    socket.send(payload as ArrayBufferView<ArrayBuffer>);
                  },
                  catch: () => undefined,
                }),
              ),
            ),
          ),
          Effect.catchAll(() => Effect.void),
        ),
      ),
    );
  }

  private connect(): void {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/${this.roomCode}`;
    const socket = new ReconnectingWebSocket(url, [], {
      minReconnectionDelay: RECONNECT_BASE_MS,
      maxReconnectionDelay: RECONNECT_MAX_MS,
      reconnectionDelayGrowFactor: 2,
    });
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    runSync(Ref.set(this.socketRef, socket));

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.handlers.onOpen();
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      if (typeof event.data === "string") {
        this.handlers.onJsonMessage(event.data);
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        this.handlers.onBinaryMessage(event.data);
        return;
      }
      if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then((buffer) => {
          if (this.socket !== socket) return;
          this.handlers.onBinaryMessage(buffer);
        });
        return;
      }
      if (ArrayBuffer.isView(event.data)) {
        const view = event.data;
        const bytes = new Uint8Array(
          view.buffer,
          view.byteOffset,
          view.byteLength,
        );
        const buffer = bytes.slice().buffer;
        this.handlers.onBinaryMessage(buffer);
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.handlers.onClose();
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) return;
      this.handlers.onError();
    });
  }
}
