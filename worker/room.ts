import * as Automerge from "@automerge/automerge";
import type { SyncState, SyncMessage } from "@automerge/automerge";

const DOC_KEY = "doc";
const INTENT_TTL_MS = 10000;

interface DeleteIntent {
  op: "delete-item";
  itemId: string;
  expiresAt: number;
}

export class Room implements DurableObject {
  private state: DurableObjectState;
  private doc: Automerge.Doc<any> | null = null;
  private syncStates = new Map<WebSocket, SyncState>();
  private deleteIntents = new Map<WebSocket, Map<string, DeleteIntent>>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async loadDoc(): Promise<Automerge.Doc<any>> {
    if (this.doc) return this.doc;

    const stored = await this.state.storage.get<Uint8Array>(DOC_KEY);
    if (stored) {
      this.doc = Automerge.load(stored);
    } else {
      this.doc = Automerge.init();
    }
    return this.doc;
  }

  private async saveDoc(): Promise<void> {
    if (!this.doc) return;
    await this.state.storage.put(DOC_KEY, Automerge.save(this.doc));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /init — initialize the room with a doc
    if (url.pathname === "/init" && request.method === "POST") {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > 0) {
        this.doc = Automerge.load(bytes);
        await this.saveDoc();
      }
      return new Response("OK", { status: 200 });
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);

    // Initialize sync state and send initial sync message
    const doc = await this.loadDoc();
    const syncState = Automerge.initSyncState();
    this.syncStates.set(server, syncState);
    this.deleteIntents.set(server, new Map());

    // Generate and send initial sync message
    const [newSyncState, msg] = Automerge.generateSyncMessage(doc, syncState);
    this.syncStates.set(server, newSyncState);
    if (msg) {
      server.send(msg as unknown as ArrayBuffer);
    }

    // Broadcast connection count to all connected clients
    this.broadcastConnectionCount();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    data: ArrayBuffer | string,
  ): Promise<void> {
    if (typeof data === "string") {
      this.handleControlMessage(ws, data);
      return;
    }

    const doc = await this.loadDoc();
    const workingDoc = Automerge.clone(doc);
    let syncState = this.syncStates.get(ws);
    if (!syncState) {
      syncState = Automerge.initSyncState();
    }

    const oldItems = doc.items || {};
    const oldItemIds = Object.keys(oldItems);
    const oldItemCount = oldItemIds.length;
    console.log(`[Room] Before receive: doc has ${oldItemCount} items`);

    // Receive the sync message
    const message = new Uint8Array(data) as unknown as SyncMessage;
    let newDoc: Automerge.Doc<any>;
    let newSyncState: SyncState;
    try {
      [newDoc, newSyncState] = Automerge.receiveSyncMessage(
        workingDoc,
        syncState,
        message,
      );
    } catch (error) {
      console.error("[Room] Failed to receive sync message:", error);
      this.resyncPeer(ws);
      return;
    }

    const newItems = newDoc.items || {};
    const newItemCount = Object.keys(newItems).length;
    console.log(`[Room] After receive: doc has ${newItemCount} items`);
    console.log(`[Room] Items in doc:`, Object.keys(newItems));

    const deletedItemIds = oldItemIds.filter((itemId) => !(itemId in newItems));
    if (
      deletedItemIds.length > 0 &&
      !this.hasDeleteIntent(ws, newDoc, deletedItemIds, oldItemCount)
    ) {
      console.warn(
        `[Room] REJECTED sync delete: ${deletedItemIds.join(", ")}. Keeping current doc.`,
      );
      this.resyncPeer(ws);
      return;
    }

    this.doc = newDoc;
    this.syncStates.set(ws, newSyncState);
    await this.saveDoc();

    // Send response back to sender
    const [updatedSyncState, replyMsg] = Automerge.generateSyncMessage(
      this.doc,
      newSyncState,
    );
    this.syncStates.set(ws, updatedSyncState);
    if (replyMsg) {
      ws.send(replyMsg as unknown as ArrayBuffer);
    }

    // Broadcast to all other connected peers
    for (const peer of this.state.getWebSockets()) {
      if (peer === ws) continue;

      let peerSyncState = this.syncStates.get(peer);
      if (!peerSyncState) {
        peerSyncState = Automerge.initSyncState();
      }

      const [newPeerSyncState, peerMsg] = Automerge.generateSyncMessage(
        this.doc,
        peerSyncState,
      );
      this.syncStates.set(peer, newPeerSyncState);
      if (peerMsg) {
        peer.send(peerMsg as unknown as ArrayBuffer);
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.syncStates.delete(ws);
    this.deleteIntents.delete(ws);
    // Broadcast updated connection count to remaining clients
    this.broadcastConnectionCount();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.syncStates.delete(ws);
    this.deleteIntents.delete(ws);
    // Broadcast updated connection count to remaining clients
    this.broadcastConnectionCount();
  }

  private handleControlMessage(ws: WebSocket, data: string): void {
    try {
      const message = JSON.parse(data) as {
        type?: string;
        token?: unknown;
        op?: unknown;
        itemId?: unknown;
        expiresAt?: unknown;
      };

      if (message.type !== "destructiveIntent") {
        return;
      }

      if (
        typeof message.token !== "string" ||
        message.op !== "delete-item" ||
        typeof message.itemId !== "string"
      ) {
        return;
      }

      const expiresAt =
        typeof message.expiresAt === "number"
          ? Math.min(message.expiresAt, Date.now() + INTENT_TTL_MS)
          : Date.now() + INTENT_TTL_MS;
      if (expiresAt <= Date.now()) return;

      const intents =
        this.deleteIntents.get(ws) ?? new Map<string, DeleteIntent>();
      intents.set(message.token, {
        op: "delete-item",
        itemId: message.itemId,
        expiresAt,
      });
      this.deleteIntents.set(ws, intents);
    } catch (error) {
      console.error("[Room] Failed to parse control message:", error);
    }
  }

  private hasDeleteIntent(
    ws: WebSocket,
    newDoc: Automerge.Doc<any>,
    deletedItemIds: string[],
    oldItemCount: number,
  ): boolean {
    // Product rule: full-board deletion is never valid.
    if (oldItemCount > 0 && deletedItemIds.length === oldItemCount) {
      return false;
    }

    if (deletedItemIds.length !== 1) {
      return false;
    }

    const metadata = newDoc.metadata as
      | { destructiveIntentToken?: unknown; destructiveIntentAt?: unknown }
      | undefined;
    const token = metadata?.destructiveIntentToken;
    if (typeof token !== "string") {
      return false;
    }

    const intents = this.deleteIntents.get(ws);
    if (!intents) {
      return false;
    }

    this.pruneExpiredIntents(intents);

    const intent = intents.get(token);
    if (!intent) {
      return false;
    }
    if (intent.itemId !== deletedItemIds[0]) {
      return false;
    }

    intents.delete(token);
    return true;
  }

  private pruneExpiredIntents(intents: Map<string, DeleteIntent>): void {
    const now = Date.now();
    for (const [token, intent] of intents) {
      if (intent.expiresAt <= now) {
        intents.delete(token);
      }
    }
  }

  private resyncPeer(ws: WebSocket): void {
    const freshSyncState = Automerge.initSyncState();
    const [updatedSyncState, replyMsg] = Automerge.generateSyncMessage(
      this.doc!,
      freshSyncState,
    );
    this.syncStates.set(ws, updatedSyncState);
    if (replyMsg) {
      ws.send(replyMsg as unknown as ArrayBuffer);
    }
  }

  private broadcastConnectionCount(): void {
    const count = this.state.getWebSockets().length;
    const message = JSON.stringify({ type: "connectionCount", count });
    console.log(
      `[Room] Broadcasting connection count: ${count} to ${count} clients`,
    );
    for (const peer of this.state.getWebSockets()) {
      try {
        peer.send(message);
      } catch (error) {
        console.error("[Room] Failed to send connection count:", error);
      }
    }
  }
}
