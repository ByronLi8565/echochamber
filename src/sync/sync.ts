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
import {
  SyncError,
  handleSyncConnectionError,
  handleSyncMessageError,
  errorBoundary,
} from "../util/error-handler";
import { debug } from "../util/debug";

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

  errorBoundary(
    () => {
      debug.sync.log("WebSocket connected");
      connected = true;
      syncState = Automerge.initSyncState();

      if (hasReceivedFirstSync) {
        sendSyncMessage(config.getDoc());
      }

      config.onConnected?.();
    },
    {
      operation: "websocket-open",
      category: "sync",
      showNotification: false,
    }
  );
}

function handleClose(): void {
  errorBoundary(
    () => {
      debug.sync.log("WebSocket disconnected");
      connected = false;
      config?.onDisconnected?.();
    },
    {
      operation: "websocket-close",
      category: "sync",
      showNotification: false,
    }
  );
}

function handleError(): void {
  errorBoundary(
    () => {
      debug.sync.warn("WebSocket error occurred");
      connected = false;
      handleSyncConnectionError(new Error("WebSocket error"));
    },
    {
      operation: "websocket-error",
      category: "sync",
      showNotification: false,
    }
  );
}

function handleJsonMessage(raw: string): void {
  const activeConfig = config;
  if (!activeConfig) return;

  errorBoundary(
    () => {
      const decoded = decodeServerJsonMessage(raw);
      if (Either.isLeft(decoded)) {
        debug.sync.error("Failed to parse JSON message:", decoded.left);
        handleSyncMessageError(
          new SyncError("Failed to parse sync message", {
            cause: decoded.left,
          })
        );
        return;
      }

      const message = decoded.right;
      if (!message) return;

      if (message.type === "connectionCount") {
        const count = message.count;
        debug.sync.log(`Connection count: ${count}`);
        updateConnectionCount(count);
        activeConfig.onConnectionCount?.(count);
        return;
      }

      if (message.type === "audioPlay" && syncAudioEnabled) {
        debug.sync.log(`Received remote audio play: ${message.itemId}`);
        activeConfig.onRemoteAudioPlay?.(message.itemId);
      }
    },
    {
      operation: "handle-json-message",
      category: "sync",
      showNotification: false,
    }
  );
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

          debug.sync.log(
            `Received sync message, current doc has ${Object.keys(doc.items || {}).length} items`
          );

          let newDoc: Doc<any>;
          let newSyncState: SyncState;

          try {
            [newDoc, newSyncState] = Automerge.receiveSyncMessage(
              doc,
              syncState,
              message
            );
            syncState = newSyncState;
          } catch (error) {
            debug.sync.error("Failed to process sync message:", error);
            handleSyncMessageError(
              new SyncError("Failed to apply sync message", {
                cause: error,
              })
            );
            throw error;
          }

          debug.sync.log(
            `After receive, new doc has ${Object.keys(newDoc.items || {}).length} items`
          );

          if (!hasReceivedFirstSync) {
            hasReceivedFirstSync = true;
            debug.sync.log(
              "First sync received - now ready to send local changes"
            );
          }

          activeConfig.applyRemoteDoc(newDoc);
          sendSyncMessage(newDoc);
        },
        catch: (error) => error,
      }),
      Effect.catchAll((error) =>
        Effect.sync(() => {
          debug.sync.error("Error processing sync message:", error);
          handleSyncMessageError(error as Error);
        })
      )
    )
  );
}
