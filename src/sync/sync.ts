import * as Automerge from "@automerge/automerge";
import type { Doc, SyncState, SyncMessage } from "@automerge/automerge";
import { Either, Effect, pipe } from "effect";
import { runSync } from "../util/effect-runtime.ts";
import {
  createAudioPlayMessage,
  createDestructiveIntentMessage,
  decodeServerJsonMessage,
  encodeClientJsonMessage,
} from "./sync-protocol.ts";
import { SyncClient } from "./sync-client.ts";

interface SyncConfig {
  roomCode: string;
  getDoc: () => Doc<any>;
  applyRemoteDoc: (newDoc: Doc<any>) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onConnectionCount?: (count: number) => void;
  onRemoteAudioPlay?: (itemId: string) => void;
}

let syncState: SyncState = Automerge.initSyncState();
let config: SyncConfig | null = null;
let syncClient: SyncClient | null = null;
let connected = false;
let hasReceivedFirstSync = false;
let isJoiningRoom = false;
let syncAudioEnabled = false;
const DESTRUCTIVE_INTENT_TTL_MS = 10000;

export function startSync(cfg: SyncConfig, joining: boolean = false): void {
  stopSync();
  config = cfg;
  isJoiningRoom = joining;
  hasReceivedFirstSync = !joining;
  syncState = Automerge.initSyncState();

  syncClient = new SyncClient(cfg.roomCode, {
    onOpen: handleOpen,
    onClose: handleClose,
    onError: handleError,
    onJsonMessage: handleJsonMessage,
    onBinaryMessage: handleBinaryMessage,
  });
  syncClient.start();
}

export function stopSync(): void {
  config = null;
  const client = syncClient;
  syncClient = null;
  client?.stop();
  connected = false;
  hasReceivedFirstSync = false;
  isJoiningRoom = false;
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
  syncClient?.sendJson(encodeClientJsonMessage(createAudioPlayMessage(itemId)));
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
  if (!syncClient?.isOpen() || !config) return;

  if (isJoiningRoom && !hasReceivedFirstSync) {
    console.log("[Sync] Skipping send - waiting for first sync from server");
    return;
  }

  sendSyncMessage(config.getDoc());
}

export function forceResync(): void {
  if (!syncClient?.isOpen() || !config) return;

  syncState = Automerge.initSyncState();
  sendSyncMessage(config.getDoc());
}

export function requestDeleteIntent(itemId: string): string | null {
  if (!syncClient?.isOpen()) return null;

  const message = createDestructiveIntentMessage(
    itemId,
    Date.now() + DESTRUCTIVE_INTENT_TTL_MS,
  );

  return runSync(
    pipe(
      Effect.try({
        try: () => {
          return syncClient!.sendJson(encodeClientJsonMessage(message))
            ? message.token
            : null;
        },
        catch: () => null,
      }),
      Effect.catchAll(() => Effect.succeed(null)),
    ),
  );
}

function sendSyncMessage(doc: Doc<any>): void {
  if (!syncClient?.isOpen()) return;
  const [newSyncState, msg] = Automerge.generateSyncMessage(doc, syncState);
  syncState = newSyncState;
  if (msg) {
    syncClient.sendBinary(msg);
  }
}

function handleOpen(): void {
  if (!config) return;
  console.log("[Sync] WebSocket connected");
  connected = true;
  syncState = Automerge.initSyncState();

  if (hasReceivedFirstSync) {
    sendSyncMessage(config.getDoc());
  }

  config.onConnected?.();
}

function handleClose(): void {
  console.log("[Sync] WebSocket disconnected");
  connected = false;
  config?.onDisconnected?.();
}

function handleError(): void {
  console.log("[Sync] WebSocket error");
  connected = false;
}

function handleJsonMessage(raw: string): void {
  const activeConfig = config;
  if (!activeConfig) return;

  const decoded = decodeServerJsonMessage(raw);
  if (Either.isLeft(decoded)) {
    console.error("[Sync] Failed to parse JSON message:", decoded.left);
    return;
  }

  const message = decoded.right;
  if (!message) return;

  if (message.type === "connectionCount") {
    const count = message.count;
    console.log(`[Sync] Connection count: ${count}`);
    updateConnectionCount(count);
    activeConfig.onConnectionCount?.(count);
    return;
  }

  if (message.type === "audioPlay" && syncAudioEnabled) {
    activeConfig.onRemoteAudioPlay?.(message.itemId);
  }
}

function handleBinaryMessage(payload: ArrayBuffer): void {
  const activeConfig = config;
  if (!activeConfig) return;

  runSync(
    pipe(
      Effect.try({
        try: () => {
          const message = new Uint8Array(payload) as unknown as SyncMessage;
          const doc = activeConfig.getDoc();

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

          if (!hasReceivedFirstSync) {
            hasReceivedFirstSync = true;
            console.log(
              "[Sync] First sync received - now ready to send local changes",
            );
          }

          activeConfig.applyRemoteDoc(newDoc);
          sendSyncMessage(newDoc);
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
}
