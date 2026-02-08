import * as Automerge from "@automerge/automerge";
import type { Doc, SyncState, SyncMessage } from "@automerge/automerge";
import { Effect, pipe } from "effect";

interface SyncConfig {
  roomCode: string;
  getDoc: () => Doc<any>;
  applyRemoteDoc: (newDoc: Doc<any>) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onConnectionCount?: (count: number) => void;
  onRemoteAudioPlay?: (itemId: string) => void;
}

interface DestructiveIntentMessage {
  type: "destructiveIntent";
  token: string;
  op: "delete-item";
  itemId: string;
  expiresAt: number;
}

interface AudioPlayMessage {
  type: "audioPlay";
  itemId: string;
}

let ws: WebSocket | null = null;
let syncState: SyncState = Automerge.initSyncState();
let config: SyncConfig | null = null;
let reconnectTimeout: number | null = null;
let connected = false;
let hasReceivedFirstSync = false;
let isJoiningRoom = false;
let reconnectAttempts = 0;
let syncAudioEnabled = false;

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const DESTRUCTIVE_INTENT_TTL_MS = 10000;

export function startSync(cfg: SyncConfig, joining: boolean = false): void {
  stopSync();
  config = cfg;
  isJoiningRoom = joining;
  hasReceivedFirstSync = !joining; // If deploying (not joining), we can send immediately
  reconnectAttempts = 0;
  connect();
}

export function stopSync(): void {
  config = null;
  if (reconnectTimeout !== null) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  const socket = ws;
  ws = null;
  if (socket) {
    socket.close();
  }
  connected = false;
  hasReceivedFirstSync = false;
  isJoiningRoom = false;
  reconnectAttempts = 0;
  syncState = Automerge.initSyncState();
}

export function isConnected(): boolean {
  return connected;
}

export function setSyncAudioEnabled(enabled: boolean): void {
  syncAudioEnabled = enabled;
}

export function sendAudioPlayEvent(itemId: string): void {
  if (!syncAudioEnabled) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const message: AudioPlayMessage = {
    type: "audioPlay",
    itemId,
  };

  ws.send(JSON.stringify(message));
}

export function updateConnectionCount(count: number): void {
  const countEl = document.getElementById("connection-count");
  if (countEl) {
    countEl.textContent = count.toString();
    console.log(`[Sync] Updated connection count display to ${count}`);
  } else {
    console.warn("[Sync] connection-count element not found");
  }
}

export function notifyLocalChange(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !config) return;

  // If joining a room, don't send until we've received the server's doc first
  if (isJoiningRoom && !hasReceivedFirstSync) {
    console.log("[Sync] Skipping send - waiting for first sync from server");
    return;
  }

  const doc = config.getDoc();
  const [newSyncState, msg] = Automerge.generateSyncMessage(doc, syncState);
  syncState = newSyncState;
  if (msg) {
    ws.send(msg as unknown as ArrayBuffer);
  }
}

export function requestDeleteIntent(itemId: string): string | null {
  if (!ws || ws.readyState !== WebSocket.OPEN) return null;

  const message: DestructiveIntentMessage = {
    type: "destructiveIntent",
    token: crypto.randomUUID(),
    op: "delete-item",
    itemId,
    expiresAt: Date.now() + DESTRUCTIVE_INTENT_TTL_MS,
  };

  return Effect.runSync(
    pipe(
      Effect.try({
        try: () => {
          ws!.send(JSON.stringify(message));
          return message.token;
        },
        catch: () => null,
      }),
      Effect.catchAll(() => Effect.succeed(null)),
    ),
  );
}

function connect(): void {
  if (!config) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/ws/${config.roomCode}`;

  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  ws = socket;

  socket.addEventListener("open", () => {
    if (ws !== socket) return;
    if (!config) return;
    console.log("[Sync] WebSocket connected");
    connected = true;
    reconnectAttempts = 0; // Reset backoff on successful connection
    syncState = Automerge.initSyncState();

    // Only send initial sync message if we already have meaningful state.
    // When joining a room, the client starts with an empty Automerge.init()
    // doc — sending it would be pointless (and could pollute the server's
    // doc). The server already sends its initial sync message in its fetch
    // handler, so the client just needs to wait for that.
    if (hasReceivedFirstSync && config) {
      const doc = config.getDoc();
      const [newSyncState, msg] = Automerge.generateSyncMessage(doc, syncState);
      syncState = newSyncState;
      if (msg) {
        socket.send(msg as unknown as ArrayBuffer);
      }
    }

    config?.onConnected?.();
  });

  socket.addEventListener("message", (event) => {
    if (ws !== socket) return;
    if (!config) return;

    // Handle JSON messages (e.g., connection count)
    if (typeof event.data === "string") {
      Effect.runSync(
        pipe(
          Effect.try({
            try: () =>
              JSON.parse(event.data) as {
                type?: string;
                count?: unknown;
                itemId?: unknown;
              },
            catch: (error) => error,
          }),
          Effect.flatMap((json) => {
            const count = json.count;
            if (json.type === "connectionCount" && typeof count === "number") {
              return Effect.sync(() => {
                console.log(`[Sync] Connection count: ${count}`);
                updateConnectionCount(count);
                config?.onConnectionCount?.(count);
              });
            }

            if (
              json.type === "audioPlay" &&
              typeof json.itemId === "string" &&
              syncAudioEnabled
            ) {
              return Effect.sync(() => {
                config?.onRemoteAudioPlay?.(json.itemId as string);
              });
            }

            return Effect.void;
          }),
          Effect.catchAll((error) =>
            Effect.sync(() => {
              console.error("[Sync] Failed to parse JSON message:", error);
            }),
          ),
        ),
      );
      return;
    }

    if (!(event.data instanceof ArrayBuffer)) return;

    Effect.runSync(
      pipe(
        Effect.try({
          try: () => {
            const message = new Uint8Array(
              event.data,
            ) as unknown as SyncMessage;
            const doc = config!.getDoc();

            console.log(
              `[Sync] Received sync message, current doc has ${Object.keys(doc.items || {}).length} items`,
            );

            const [newDoc, newSyncState] = Automerge.receiveSyncMessage(
              doc,
              syncState,
              message,
            );
            syncState = newSyncState;

            console.log(
              `[Sync] After receive, new doc has ${Object.keys(newDoc.items || {}).length} items`,
            );

            // Mark that we've received first sync (important for joining rooms)
            if (!hasReceivedFirstSync) {
              hasReceivedFirstSync = true;
              console.log(
                "[Sync] First sync received - now ready to send local changes",
              );
            }

            // Apply remote changes
            config!.applyRemoteDoc(newDoc);

            // Generate response message
            const [updatedSyncState, replyMsg] = Automerge.generateSyncMessage(
              newDoc,
              syncState,
            );
            syncState = updatedSyncState;
            if (
              replyMsg &&
              ws === socket &&
              socket.readyState === WebSocket.OPEN
            ) {
              socket.send(replyMsg as unknown as ArrayBuffer);
            }
          },
          catch: (error) => error,
        }),
        Effect.catchAll((error) =>
          Effect.sync(() => {
            console.error("[Sync] Error processing sync message:", error);
          }),
        ),
      ),
    );
  });

  socket.addEventListener("close", () => {
    if (ws !== socket) return;
    console.log("[Sync] WebSocket disconnected");
    connected = false;
    ws = null;
    config?.onDisconnected?.();
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    if (ws !== socket) return;
    console.log("[Sync] WebSocket error");
    connected = false;
  });
}

function scheduleReconnect(): void {
  if (!config) return;
  if (reconnectTimeout !== null) return;

  // Exponential backoff: 2s, 4s, 8s, 16s, capped at 30s
  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
    RECONNECT_MAX_MS,
  );
  reconnectAttempts++;

  console.log(
    `[Sync] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`,
  );

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    if (config) {
      console.log("[Sync] Reconnecting...");
      connect();
    }
  }, delay) as unknown as number;
}
