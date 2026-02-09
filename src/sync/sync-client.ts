import { Effect, pipe } from "effect";
import { WebSocket as ReconnectingWebSocket } from "partysocket";
import { runSync } from "../util/effect-runtime.ts";

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

interface SyncClientHandlers {
  onOpen: () => void;
  onClose: () => void;
  onError: () => void;
  onJsonMessage: (raw: string) => void;
  onBinaryMessage: (payload: ArrayBuffer) => void;
}

export class SyncClient {
  private socket: ReconnectingWebSocket | null = null;

  constructor(
    private readonly roomCode: string,
    private readonly handlers: SyncClientHandlers,
  ) {}

  start(): void {
    this.stop();
    this.connect();
  }

  stop(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.close(1000, "sync-stop");
    }
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  sendJson(raw: string): boolean {
    return this.sendWithEffect((socket) => {
      socket.send(raw);
    });
  }

  sendBinary(payload: ArrayBuffer | ArrayBufferView): boolean {
    return this.sendWithEffect((socket) => {
      socket.send(payload);
    });
  }

  private sendWithEffect(send: (socket: ReconnectingWebSocket) => void): boolean {
    return runSync(
      pipe(
        Effect.try({
          try: () => {
            const socket = this.socket;
            if (!socket || socket.readyState !== 1) {
              return false;
            }
            send(socket);
            return true;
          },
          catch: () => false,
        }),
        Effect.catchAll(() => Effect.succeed(false)),
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
