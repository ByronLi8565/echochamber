import * as Automerge from "@automerge/automerge";
import type { SyncState, SyncMessage } from "@automerge/automerge";

const DOC_KEY = "doc";

export class Room implements DurableObject {
  private state: DurableObjectState;
  private doc: Automerge.Doc<any> | null = null;
  private syncStates = new Map<WebSocket, SyncState>();

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

  async webSocketMessage(ws: WebSocket, data: ArrayBuffer | string): Promise<void> {
    if (typeof data === "string") return;

    const doc = await this.loadDoc();
    let syncState = this.syncStates.get(ws);
    if (!syncState) {
      syncState = Automerge.initSyncState();
    }

    const oldItemCount = Object.keys(doc.items || {}).length;
    console.log(`[Room] Before receive: doc has ${oldItemCount} items`);

    // Receive the sync message
    const message = new Uint8Array(data) as unknown as SyncMessage;
    const [newDoc, newSyncState] = Automerge.receiveSyncMessage(
      doc,
      syncState,
      message,
    );

    const newItemCount = Object.keys(newDoc.items || {}).length;
    console.log(`[Room] After receive: doc has ${newItemCount} items`);
    console.log(`[Room] Items in doc:`, Object.keys(newDoc.items || {}));

    // Guard: reject merges that would wipe server state.
    // A client with fewer items (e.g. after a reload/reset) should never
    // cause the server to lose items.
    if (oldItemCount > 0 && newItemCount < oldItemCount) {
      console.warn(
        `[Room] REJECTED sync: would reduce items from ${oldItemCount} to ${newItemCount}. Keeping current doc.`,
      );
      // Reset this peer's sync state so the server re-sends its full doc,
      // bringing the client up to date cleanly.
      const freshSyncState = Automerge.initSyncState();
      const [updatedSyncState, replyMsg] = Automerge.generateSyncMessage(this.doc, freshSyncState);
      this.syncStates.set(ws, updatedSyncState);
      if (replyMsg) {
        ws.send(replyMsg as unknown as ArrayBuffer);
      }
      return;
    }

    this.doc = newDoc;
    this.syncStates.set(ws, newSyncState);
    await this.saveDoc();

    // Send response back to sender
    const [updatedSyncState, replyMsg] = Automerge.generateSyncMessage(this.doc, newSyncState);
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

      const [newPeerSyncState, peerMsg] = Automerge.generateSyncMessage(this.doc, peerSyncState);
      this.syncStates.set(peer, newPeerSyncState);
      if (peerMsg) {
        peer.send(peerMsg as unknown as ArrayBuffer);
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.syncStates.delete(ws);
    // Broadcast updated connection count to remaining clients
    this.broadcastConnectionCount();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.syncStates.delete(ws);
    // Broadcast updated connection count to remaining clients
    this.broadcastConnectionCount();
  }

  private broadcastConnectionCount(): void {
    const count = this.state.getWebSockets().length;
    const message = JSON.stringify({ type: "connectionCount", count });
    console.log(`[Room] Broadcasting connection count: ${count} to ${count} clients`);
    for (const peer of this.state.getWebSockets()) {
      try {
        peer.send(message);
      } catch (error) {
        console.error("[Room] Failed to send connection count:", error);
      }
    }
  }
}
