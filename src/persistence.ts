/**
 * Automerge-based persistence layer for EchoChamber
 */

import * as Automerge from "@automerge/automerge";
import type { Doc } from "@automerge/automerge";
import { saveAudio, loadAudio, deleteAudio, getAllAudioKeys, serializeAudioBuffer } from "./audio-storage";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { notifyLocalChange } from "./sync";
import { deleteAudioFromR2 } from "./audio-sync";

const STORAGE_KEY = "echochamber-doc";
const SAVE_DEBOUNCE_MS = 500;
const VERSION = "1.0.0";

interface SoundboardItemData {
  type: "soundboard";
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  hotkey: string;
  filters: {
    lowpass: number;
    highpass: number;
    reverb: number;
    reversed: number;
  };
}

interface TextboxItemData {
  type: "textbox";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

interface EchoChamberDoc {
  metadata: {
    version: string;
    createdAt: number;
    lastModified: number;
  };
  viewport: {
    offsetX: number;
    offsetY: number;
  };
  items: { [itemId: string]: SoundboardItemData | TextboxItemData };
  nextItemId: number;
  audioFiles: { [itemId: string]: string };
}

// Subscription types
type SubscriptionCallback = (doc: EchoChamberDoc) => void;
type ItemSubscriptionCallback = (itemData: SoundboardItemData | TextboxItemData | null) => void;

class Persistence {
  private doc: Automerge.Doc<EchoChamberDoc>;
  private saveTimeout: number | null = null;
  private globalSubscribers = new Set<SubscriptionCallback>();
  private itemSubscribers = new Map<string, Set<ItemSubscriptionCallback>>();
  private isNotifying = false;
  private notifyTimeout: number | null = null;
  private syncEnabled = false;

  constructor() {
    this.doc = this.loadDoc();
  }

  private loadDoc(): Automerge.Doc<EchoChamberDoc> {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const binaryString = atob(stored);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return Automerge.load(bytes);
      } catch (error) {
        console.error("Failed to load saved document:", error);
      }
    }

    // Create new document
    return Automerge.from({
      metadata: {
        version: VERSION,
        createdAt: Date.now(),
        lastModified: Date.now(),
      },
      viewport: {
        offsetX: 0,
        offsetY: 0,
      },
      items: {},
      nextItemId: 0,
      audioFiles: {},
    });
  }

  private scheduleSave(): void {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveDoc();
      this.saveTimeout = null;
    }, SAVE_DEBOUNCE_MS) as unknown as number;
  }

  private saveDoc(): void {
    try {
      const bytes = Automerge.save(this.doc);
      let binaryString = '';
      for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binaryString);
      localStorage.setItem(STORAGE_KEY, base64);
    } catch (error) {
      console.error("Failed to save document:", error);
    }
  }

  getDoc(): Automerge.Doc<EchoChamberDoc> {
    return this.doc;
  }

  // Subscribe to all document changes
  subscribeGlobal(callback: SubscriptionCallback): () => void {
    this.globalSubscribers.add(callback);
    return () => this.globalSubscribers.delete(callback);
  }

  // Subscribe to specific item changes
  subscribeToItem(itemId: string, callback: ItemSubscriptionCallback): () => void {
    if (!this.itemSubscribers.has(itemId)) {
      this.itemSubscribers.set(itemId, new Set());
    }
    this.itemSubscribers.get(itemId)!.add(callback);

    // Immediately invoke with current state
    callback(this.doc.items[itemId] || null);

    return () => {
      const subs = this.itemSubscribers.get(itemId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) this.itemSubscribers.delete(itemId);
      }
    };
  }

  // Debounced notification
  private scheduleNotify(): void {
    if (this.isNotifying) return;
    if (this.notifyTimeout !== null) clearTimeout(this.notifyTimeout);
    this.notifyTimeout = setTimeout(() => {
      this.notify();
      this.notifyTimeout = null;
    }, 16) as unknown as number; // ~60fps
  }

  private notify(): void {
    if (this.isNotifying) return;
    this.isNotifying = true;
    try {
      // Notify global subscribers
      for (const callback of this.globalSubscribers) {
        callback(this.doc);
      }
      // Notify item-specific subscribers
      for (const [itemId, callbacks] of this.itemSubscribers) {
        const itemData = this.doc.items[itemId] || null;
        for (const callback of callbacks) {
          callback(itemData);
        }
      }
    } finally {
      this.isNotifying = false;
    }
  }

  enableSync(): void {
    this.syncEnabled = true;
  }

  // Reset to a fresh empty doc. Used when joining a room so the DO's doc
  // becomes the sole source of truth (no merging with stale local state).
  resetForRoom(): void {
    this.doc = Automerge.from({
      metadata: {
        version: VERSION,
        createdAt: Date.now(),
        lastModified: Date.now(),
      },
      viewport: {
        offsetX: 0,
        offsetY: 0,
      },
      items: {},
      nextItemId: 0,
      audioFiles: {},
    });
  }

  getDocBytes(): Uint8Array {
    return Automerge.save(this.doc);
  }

  applyRemoteDoc(newDoc: Doc<EchoChamberDoc>): void {
    console.log(`[Persistence] Applying remote doc with ${Object.keys(newDoc.items).length} items`);
    console.log(`[Persistence] Remote doc items:`, Object.keys(newDoc.items));

    // Preserve local viewport offsets — each client has its own view
    const localViewport = {
      offsetX: this.doc.viewport.offsetX,
      offsetY: this.doc.viewport.offsetY,
    };

    this.doc = newDoc;

    // Re-apply local viewport WITHOUT triggering sync
    // (viewport is local-only, shouldn't propagate to other clients)
    this.doc = Automerge.change(this.doc, (doc) => {
      doc.viewport.offsetX = localViewport.offsetX;
      doc.viewport.offsetY = localViewport.offsetY;
    });

    this.scheduleSave();
    this.scheduleNotify();
    // NOTE: Do NOT call notifyLocalChange() here - we just received remote changes
  }

  // New generic change method
  change(changeFn: (doc: EchoChamberDoc) => void): void {
    this.doc = Automerge.change(this.doc, (doc) => {
      changeFn(doc);
      doc.metadata.lastModified = Date.now();
    });
    this.scheduleSave();
    this.scheduleNotify();
    if (this.syncEnabled) {
      notifyLocalChange();
    }
  }

  // Convenience methods
  updateItemPosition(itemId: string, x: number, y: number): void {
    this.change((doc) => {
      if (doc.items[itemId]) {
        doc.items[itemId].x = x;
        doc.items[itemId].y = y;
      }
    });
  }

  updateSoundboardFilters(itemId: string, filters: SoundboardItemData['filters']): void {
    this.change((doc) => {
      const item = doc.items[itemId];
      if (item && item.type === 'soundboard') {
        item.filters = filters;
      }
    });
  }

  updateSoundboardHotkey(itemId: string, hotkey: string): void {
    this.change((doc) => {
      const item = doc.items[itemId];
      if (item && item.type === 'soundboard') {
        item.hotkey = hotkey;
      }
    });
  }

  updateSoundboardName(itemId: string, name: string): void {
    this.change((doc) => {
      const item = doc.items[itemId];
      if (item && item.type === 'soundboard') {
        item.name = name;
      }
    });
  }

  updateTextboxText(itemId: string, text: string): void {
    this.change((doc) => {
      const item = doc.items[itemId];
      if (item && item.type === 'textbox') {
        item.text = text;
      }
    });
  }

  updateViewport(offsetX: number, offsetY: number): void {
    this.change((doc) => {
      doc.viewport.offsetX = offsetX;
      doc.viewport.offsetY = offsetY;
    });
  }

  addItem(itemId: string, data: SoundboardItemData | TextboxItemData): void {
    console.log(`[Persistence] Adding item ${itemId} (${data.type})`);
    this.change((doc) => {
      doc.items[itemId] = data;
    });
  }

  removeItem(itemId: string): void {
    this.change((doc) => {
      delete doc.items[itemId];
      delete doc.audioFiles[itemId];
    });

    // Side effect: delete from IndexedDB
    const audioKey = `audio-${itemId}`;
    deleteAudio(audioKey).catch((error) => {
      console.error("Failed to delete audio:", error);
    });

    // Side effect: delete from R2
    if (this.syncEnabled) {
      deleteAudioFromR2(itemId);
    }
  }

  getNextItemId(): string {
    // Use actor ID + counter to ensure globally unique IDs even with concurrent creation
    const actorId = Automerge.getActorId(this.doc);
    let counter: number;
    this.doc = Automerge.change(this.doc, (doc) => {
      counter = doc.nextItemId;
      doc.nextItemId++;
      doc.metadata.lastModified = Date.now();
    });
    this.scheduleSave();
    this.scheduleNotify();
    if (this.syncEnabled) {
      notifyLocalChange();
    }
    // Create a unique ID: first 8 chars of actor + counter
    const id = `${actorId.substring(0, 8)}-${counter!}`;
    console.log(`[Persistence] Generated ID: ${id} (actor: ${actorId}, counter: ${counter})`);
    return id;
  }

  setAudioFile(itemId: string, audioKey: string): void {
    this.change((doc) => {
      doc.audioFiles[itemId] = audioKey;
    });
  }

  async exportToFile(): Promise<Blob> {
    // Create manifest
    const manifest = {
      version: VERSION,
      createdAt: this.doc.metadata.createdAt,
      lastModified: this.doc.metadata.lastModified,
      itemCount: Object.keys(this.doc.items).length,
    };

    // Prepare files for ZIP
    const files: Record<string, Uint8Array> = {
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      "document.automerge": Automerge.save(this.doc),
    };

    // Add audio files
    const audioKeys = await getAllAudioKeys();
    for (const key of audioKeys) {
      const itemId = key.replace("audio-", "");
      if (this.doc.audioFiles[itemId]) {
        const audioContext = new AudioContext();
        const buffer = await loadAudio(key, audioContext);
        if (buffer) {
          const serialized = serializeAudioBuffer(buffer);
          const json = JSON.stringify({
            sampleRate: serialized.sampleRate,
            length: serialized.length,
            numberOfChannels: serialized.numberOfChannels,
            channelData: serialized.channelData.map((ch) => Array.from(ch)),
          });
          files[`audio/${itemId}.json`] = strToU8(json);
        }
      }
    }

    // Create ZIP
    const zipped = zipSync(files, { level: 6 });
    return new Blob([zipped], { type: "application/zip" });
  }

  async importFromFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    try {
      // Unzip
      const unzipped = unzipSync(uint8);

      // Load document
      const docBytes = unzipped["document.automerge"];
      if (!docBytes) {
        throw new Error("Invalid export: missing document.automerge");
      }

      const newDoc = Automerge.load<EchoChamberDoc>(docBytes);

      // Clear existing audio
      const existingKeys = await getAllAudioKeys();
      for (const key of existingKeys) {
        await deleteAudio(key);
      }

      // Import audio files
      const audioContext = new AudioContext();
      for (const [path, data] of Object.entries(unzipped)) {
        if (path.startsWith("audio/")) {
          const itemId = path.replace("audio/", "").replace(".json", "");
          const json = JSON.parse(strFromU8(data));
          const channelData = json.channelData.map((ch: number[]) => new Float32Array(ch));

          const buffer = audioContext.createBuffer(
            json.numberOfChannels,
            json.length,
            json.sampleRate
          );

          for (let i = 0; i < json.numberOfChannels; i++) {
            buffer.copyToChannel(channelData[i], i);
          }

          await saveAudio(`audio-${itemId}`, buffer);
        }
      }

      // Replace current document
      this.doc = newDoc;
      this.saveDoc();

      // Reload page to apply changes
      window.location.reload();
    } catch (error) {
      console.error("Failed to import file:", error);
      throw error;
    }
  }
}

export const persistence = new Persistence();
export type { SoundboardItemData, TextboxItemData };
