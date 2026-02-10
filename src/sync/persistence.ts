/**
 * Automerge-based persistence layer for EchoChamber
 */

import * as Automerge from "@automerge/automerge";
import type { Doc } from "@automerge/automerge";
import { Effect, pipe } from "effect";
import {
  saveAudio,
  loadAudio,
  deleteAudio,
  getAllAudioKeys,
  serializeAudioBuffer,
} from "./audio-storage.ts";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { notifyLocalChange, requestDeleteIntent } from "./sync.ts";
import { deleteAudioFromR2 } from "./audio-sync.ts";
import { normalizeSoundboardFilters } from "../util/audio-utils.ts";
import { getConnectedSoundboardIds } from "../util/soundboard-graph.ts";
import { runSync } from "../util/utils.ts";
import {
  ImportExportError,
  StorageError,
  handleImportError,
  handleExportError,
  asyncErrorBoundary,
} from "../util/errors.ts";
import { debug } from "../util/debug";

const STORAGE_KEY = "echochamber-doc";
const VIEWPORT_STORAGE_KEY = "echochamber-viewport";
const SAVE_DEBOUNCE_MS = 500;
const VERSION = "1.0.0";

interface ThemeData {
  backgroundColor?: string;
  itemColors: { [itemId: string]: string };
}

interface LinkData {
  [edgeKey: string]: 1;
}

interface SoundboardItemData {
  type: "soundboard";
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  hotkey: string;
  filters: {
    speedRate: number;
    reverbIntensity: number;
    reversed: number;
    playConcurrently: number;
    loopEnabled: number;
    loopDelaySeconds: number;
    repeatCount: number;
    repeatDelaySeconds: number;
    slowIntensity?: number; // Legacy (migrated to speedRate)
    speedIntensity?: number; // Legacy (migrated to speedRate)
    lowpass?: number; // Legacy (migrated to speedRate)
    highpass?: number; // Legacy (migrated to speedRate)
    reverb?: number; // Legacy (migrated to reverbIntensity)
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
    destructiveIntentToken?: string;
    destructiveIntentAt?: number;
  };
  items: { [itemId: string]: SoundboardItemData | TextboxItemData };
  nextItemId: number;
  audioFiles: { [itemId: string]: string };
  theme: ThemeData;
  links: LinkData;
}

interface ViewportState {
  offsetX: number;
  offsetY: number;
  scale?: number;
}

// Subscription types
type SubscriptionCallback = (doc: EchoChamberDoc) => void;
type ItemSubscriptionCallback = (
  itemData: SoundboardItemData | TextboxItemData | null,
) => void;
type ThemeSubscriptionCallback = (theme: ThemeData) => void;

class Persistence {
  private doc: Automerge.Doc<EchoChamberDoc>;
  private saveTimeout: number | null = null;
  private globalSubscribers = new Set<SubscriptionCallback>();
  private itemSubscribers = new Map<string, Set<ItemSubscriptionCallback>>();
  private themeSubscribers = new Set<ThemeSubscriptionCallback>();
  private isNotifying = false;
  private notifyTimeout: number | null = null;
  private syncEnabled = false;
  private viewport: ViewportState;
  private localEditsBlocked = false;
  private warnedAboutBlockedEdits = false;

  private getLinkKey(itemA: string, itemB: string): string | null {
    if (!itemA || !itemB || itemA === itemB) return null;
    return itemA < itemB ? `${itemA}::${itemB}` : `${itemB}::${itemA}`;
  }

  private parseLinkKey(edgeKey: string): [string, string] | null {
    const [itemA, itemB, ...rest] = edgeKey.split("::");
    if (rest.length > 0 || !itemA || !itemB) return null;
    return [itemA, itemB];
  }

  private isSoundboardInDoc(doc: EchoChamberDoc, itemId: string): boolean {
    return doc.items?.[itemId]?.type === "soundboard";
  }

  constructor() {
    this.doc = this.ensureDocShape(this.loadDoc());
    this.viewport = this.loadViewport();
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
    return Automerge.from(
      this.createInitialDoc() as unknown as Record<string, unknown>,
    ) as Automerge.Doc<EchoChamberDoc>;
  }

  private createInitialDoc(): EchoChamberDoc {
    const now = Date.now();
    return {
      metadata: {
        version: VERSION,
        createdAt: now,
        lastModified: now,
      },
      items: {},
      nextItemId: 0,
      audioFiles: {},
      theme: { itemColors: {} },
      links: {},
    };
  }

  private ensureDocShape(
    doc: Automerge.Doc<EchoChamberDoc>,
  ): Automerge.Doc<EchoChamberDoc> {
    if (
      doc.metadata &&
      typeof doc.nextItemId === "number" &&
      doc.items &&
      doc.audioFiles &&
      doc.links
    ) {
      return doc;
    }

    return Automerge.change(doc, (mutableDoc) => {
      this.ensureMutableDocShape(mutableDoc);
    });
  }

  private ensureMutableDocShape(doc: EchoChamberDoc): void {
    const mutableDoc = doc as unknown as {
      metadata?: EchoChamberDoc["metadata"];
      items?: EchoChamberDoc["items"];
      nextItemId?: number;
      audioFiles?: EchoChamberDoc["audioFiles"];
      theme?: EchoChamberDoc["theme"];
      links?: EchoChamberDoc["links"];
    };
    const now = Date.now();

    if (!mutableDoc.metadata) {
      mutableDoc.metadata = {
        version: VERSION,
        createdAt: now,
        lastModified: now,
      };
    } else {
      mutableDoc.metadata.version ??= VERSION;
      mutableDoc.metadata.createdAt ??= now;
      mutableDoc.metadata.lastModified ??= now;
    }

    if (!mutableDoc.items) mutableDoc.items = {};
    if (typeof mutableDoc.nextItemId !== "number") mutableDoc.nextItemId = 0;
    if (!mutableDoc.audioFiles) mutableDoc.audioFiles = {};
    if (!mutableDoc.theme) {
      mutableDoc.theme = { itemColors: {} };
    } else if (!mutableDoc.theme.itemColors) {
      mutableDoc.theme.itemColors = {};
    }
    if (!mutableDoc.links) mutableDoc.links = {};

    for (const item of Object.values(mutableDoc.items)) {
      if (!item || item.type !== "soundboard") continue;
      item.filters = normalizeSoundboardFilters(
        item.filters as unknown as Record<string, unknown> | undefined,
      );
    }
  }

  private loadViewport(): ViewportState {
    const stored = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (!stored) {
      return { offsetX: 0, offsetY: 0, scale: 1 };
    }

    try {
      const parsed = JSON.parse(stored) as Partial<ViewportState>;
      if (
        typeof parsed.offsetX === "number" &&
        typeof parsed.offsetY === "number"
      ) {
        return {
          offsetX: parsed.offsetX,
          offsetY: parsed.offsetY,
          scale: typeof parsed.scale === "number" ? parsed.scale : 1,
        };
      }
    } catch (error) {
      console.error("Failed to load viewport:", error);
    }

    return { offsetX: 0, offsetY: 0 };
  }

  private saveViewport(): void {
    localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(this.viewport));
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
      let binaryString = "";
      for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i] ?? 0);
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

  getViewport(): ViewportState {
    return { ...this.viewport };
  }

  canApplyLocalEdits(): boolean {
    return !this.localEditsBlocked;
  }

  // Subscribe to all document changes
  subscribeGlobal(callback: SubscriptionCallback): () => void {
    this.globalSubscribers.add(callback);
    return () => this.globalSubscribers.delete(callback);
  }

  // Subscribe to specific item changes
  subscribeToItem(
    itemId: string,
    callback: ItemSubscriptionCallback,
  ): () => void {
    if (!this.itemSubscribers.has(itemId)) {
      this.itemSubscribers.set(itemId, new Set());
    }
    this.itemSubscribers.get(itemId)!.add(callback);

    // Immediately invoke with current state
    callback(this.doc.items?.[itemId] || null);

    return () => {
      const subs = this.itemSubscribers.get(itemId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) this.itemSubscribers.delete(itemId);
      }
    };
  }

  // Subscribe to theme changes
  subscribeToTheme(callback: ThemeSubscriptionCallback): () => void {
    this.themeSubscribers.add(callback);
    callback(this.doc.theme ?? { itemColors: {} });
    return () => this.themeSubscribers.delete(callback);
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
        const itemData = this.doc.items?.[itemId] || null;
        for (const callback of callbacks) {
          callback(itemData);
        }
      }
      // Notify theme subscribers
      const theme = this.doc.theme ?? { itemColors: {} };
      for (const callback of this.themeSubscribers) {
        callback(theme);
      }
    } finally {
      this.isNotifying = false;
    }
  }

  private runPersistencePipeline(options: {
    save: boolean;
    notify: boolean;
    sync: boolean;
  }): Effect.Effect<void, never, never> {
    return Effect.sync(() => {
      if (options.save) this.scheduleSave();
      if (options.notify) this.scheduleNotify();
      if (options.sync && this.syncEnabled) {
        notifyLocalChange();
      }
    });
  }

  private commitMutation(
    mutate: () => void,
    options: {
      save: boolean;
      notify: boolean;
      sync: boolean;
    },
  ): void {
    runSync(
      pipe(
        Effect.sync(() => {
          mutate();
        }),
        Effect.tap(() => this.runPersistencePipeline(options)),
      ),
    );
  }

  enableSync(): void {
    this.syncEnabled = true;
  }

  // Reset to a truly empty doc. Used when joining a room so the DO's doc
  // becomes the sole source of truth. Using Automerge.init() (instead of
  // Automerge.from) ensures ZERO local change history — nothing gets merged
  // into the server's doc when sync begins.
  resetForRoom(): void {
    this.doc = Automerge.init<EchoChamberDoc>();
    this.localEditsBlocked = true;
    this.warnedAboutBlockedEdits = false;
  }

  getDocBytes(): Uint8Array {
    return Automerge.save(this.doc);
  }

  applyRemoteDoc(newDoc: Doc<EchoChamberDoc>): void {
    console.log(
      `[Persistence] Applying remote doc with ${Object.keys(newDoc.items ?? {}).length} items`,
    );
    console.log(
      `[Persistence] Remote doc items:`,
      Object.keys(newDoc.items ?? {}),
    );
    this.commitMutation(
      () => {
        this.doc = this.ensureDocShape(newDoc);
        this.localEditsBlocked = false;
        this.warnedAboutBlockedEdits = false;
      },
      { save: true, notify: true, sync: false },
    );
    // NOTE: Do NOT call notifyLocalChange() here - this is a remote apply
  }

  // New generic change method
  private changeLocal(changeFn: () => void): void {
    changeFn();
  }

  change(changeFn: (doc: EchoChamberDoc) => void): void {
    if (this.localEditsBlocked) {
      if (!this.warnedAboutBlockedEdits) {
        console.warn(
          "[Persistence] Ignoring local edit before first sync snapshot",
        );
        this.warnedAboutBlockedEdits = true;
      }
      return;
    }

    this.commitMutation(
      () => {
        this.doc = Automerge.change(this.doc, (doc) => {
          this.ensureMutableDocShape(doc);
          changeFn(doc);
          doc.metadata.lastModified = Date.now();
        });
      },
      { save: true, notify: true, sync: true },
    );
  }

  // Convenience methods
  updateItemPosition(itemId: string, x: number, y: number): void {
    if (!this.doc.items?.[itemId]) return;
    this.change((doc) => {
      if (doc.items[itemId]) {
        doc.items[itemId].x = x;
        doc.items[itemId].y = y;
      }
    });
  }

  updateSoundboardFilters(
    itemId: string,
    filters: SoundboardItemData["filters"],
  ): void {
    if (!this.doc.items?.[itemId]) return;
    this.change((doc) => {
      const item = doc.items[itemId];
      if (item && item.type === "soundboard") {
        item.filters = filters;
      }
    });
  }

  updateSoundboardHotkey(itemId: string, hotkey: string): void {
    if (!this.doc.items?.[itemId]) return;
    this.change((doc) => {
      const item = doc.items[itemId];
      if (item && item.type === "soundboard") {
        item.hotkey = hotkey;
      }
    });
  }

  updateSoundboardName(itemId: string, name: string): void {
    if (!this.doc.items?.[itemId]) return;
    this.change((doc) => {
      const item = doc.items[itemId];
      if (item && item.type === "soundboard") {
        item.name = name;
      }
    });
  }

  updateTextboxText(itemId: string, text: string): void {
    if (!this.doc.items?.[itemId]) return;
    this.change((doc) => {
      const item = doc.items[itemId];
      if (item && item.type === "textbox") {
        item.text = text;
      }
    });
  }

  updateBackgroundColor(color: string): void {
    this.change((doc) => {
      doc.theme.backgroundColor = color;
    });
  }

  updateItemColor(itemId: string, color: string): void {
    this.change((doc) => {
      doc.theme.itemColors[itemId] = color;
    });
  }

  clearItemColor(itemId: string): void {
    this.change((doc) => {
      delete doc.theme.itemColors[itemId];
    });
  }

  updateViewport(offsetX: number, offsetY: number, scale?: number): void {
    this.changeLocal(() => {
      this.viewport = {
        offsetX,
        offsetY,
        scale: scale ?? this.viewport.scale ?? 1,
      };
      this.saveViewport();
    });
  }

  addItem(itemId: string, data: SoundboardItemData | TextboxItemData): void {
    console.log(`[Persistence] Adding item ${itemId} (${data.type})`);
    this.change((doc) => {
      doc.items[itemId] = data;
    });
  }

  removeItem(itemId: string): void {
    if (!this.doc.items?.[itemId] && !this.doc.audioFiles?.[itemId]) {
      return;
    }
    const removedAudioKey = this.doc.audioFiles?.[itemId];

    let destructiveIntentToken: string | undefined;
    if (this.syncEnabled) {
      destructiveIntentToken = requestDeleteIntent(itemId) ?? undefined;
      if (!destructiveIntentToken) {
        console.warn(
          "[Persistence] Cannot remove item while sync is disconnected",
        );
        return;
      }
    }

    this.change((doc) => {
      if (destructiveIntentToken) {
        doc.metadata.destructiveIntentToken = destructiveIntentToken;
        doc.metadata.destructiveIntentAt = Date.now();
      }
      delete doc.items[itemId];
      delete doc.audioFiles[itemId];
      if (doc.theme?.itemColors?.[itemId]) {
        delete doc.theme.itemColors[itemId];
      }
      for (const edgeKey of Object.keys(doc.links ?? {})) {
        const pair = this.parseLinkKey(edgeKey);
        if (!pair) continue;
        if (pair[0] === itemId || pair[1] === itemId) {
          delete doc.links[edgeKey];
        }
      }
    });

    // Side effect: delete from IndexedDB
    const audioKey = removedAudioKey ?? `audio-${itemId}`;
    deleteAudio(audioKey).catch((error) => {
      console.error("Failed to delete audio:", error);
    });

    // Side effect: delete from R2
    if (this.syncEnabled) {
      deleteAudioFromR2(itemId);
    }
  }

  getNextItemId(): string {
    if (this.localEditsBlocked) {
      throw new Error(
        "Local edits are blocked until the first sync snapshot arrives",
      );
    }

    // Use actor ID + counter to ensure globally unique IDs even with concurrent creation
    const actorId = Automerge.getActorId(this.doc);
    let counter = 0;
    this.commitMutation(
      () => {
        this.doc = Automerge.change(this.doc, (doc) => {
          this.ensureMutableDocShape(doc);
          counter = doc.nextItemId;
          doc.nextItemId++;
          doc.metadata.lastModified = Date.now();
        });
      },
      { save: true, notify: true, sync: true },
    );
    // Create a unique ID: first 8 chars of actor + counter
    const id = `${actorId.substring(0, 8)}-${counter!}`;
    console.log(
      `[Persistence] Generated ID: ${id} (actor: ${actorId}, counter: ${counter})`,
    );
    return id;
  }

  setAudioFile(itemId: string, audioKey: string): void {
    this.change((doc) => {
      doc.audioFiles[itemId] = audioKey;
    });
  }

  getLinks(): Array<{ itemA: string; itemB: string }> {
    const links: Array<{ itemA: string; itemB: string }> = [];
    for (const edgeKey of Object.keys(this.doc.links ?? {})) {
      const pair = this.parseLinkKey(edgeKey);
      if (!pair) continue;
      links.push({ itemA: pair[0], itemB: pair[1] });
    }
    return links;
  }

  areSoundboardsLinked(itemA: string, itemB: string): boolean {
    const edgeKey = this.getLinkKey(itemA, itemB);
    if (!edgeKey) return false;
    return Number(this.doc.links?.[edgeKey] ?? 0) > 0;
  }

  toggleSoundboardLink(itemA: string, itemB: string): boolean {
    const edgeKey = this.getLinkKey(itemA, itemB);
    if (!edgeKey) return false;
    if (
      !this.isSoundboardInDoc(this.doc, itemA) ||
      !this.isSoundboardInDoc(this.doc, itemB)
    ) {
      return false;
    }

    let nowLinked = false;
    this.change((doc) => {
      if (
        !this.isSoundboardInDoc(doc, itemA) ||
        !this.isSoundboardInDoc(doc, itemB)
      ) {
        return;
      }

      if (doc.links[edgeKey]) {
        delete doc.links[edgeKey];
        nowLinked = false;
      } else {
        doc.links[edgeKey] = 1;
        nowLinked = true;
      }
    });

    return nowLinked;
  }

  getLinkedSoundboardIds(itemId: string): string[] {
    return getConnectedSoundboardIds(
      this.doc.items ?? {},
      this.getLinks(),
      itemId,
    );
  }

  updateLinkedLoopRepeatSettings(
    itemId: string,
    settings: {
      playConcurrently: number;
      loopEnabled: number;
      loopDelaySeconds: number;
      repeatCount: number;
      repeatDelaySeconds: number;
    },
  ): void {
    const linkedIds = this.getLinkedSoundboardIds(itemId);
    if (linkedIds.length === 0) return;

    const playConcurrently = settings.playConcurrently > 0 ? 1 : 0;
    const loopEnabled = settings.loopEnabled > 0 ? 1 : 0;
    const loopDelaySeconds = Math.max(0, settings.loopDelaySeconds);
    const repeatCount = Math.max(1, Math.round(settings.repeatCount));
    const repeatDelaySeconds = Math.max(0, settings.repeatDelaySeconds);

    this.change((doc) => {
      for (const linkedId of linkedIds) {
        const item = doc.items[linkedId];
        if (!item || item.type !== "soundboard") continue;
        item.filters.playConcurrently = playConcurrently;
        item.filters.loopEnabled = loopEnabled;
        item.filters.loopDelaySeconds = loopDelaySeconds;
        item.filters.repeatCount = repeatCount;
        item.filters.repeatDelaySeconds = repeatDelaySeconds;
      }
    });
  }

  async exportToFile(): Promise<Blob> {
    return asyncErrorBoundary(
      async () => {
        debug.persistence.log("Starting export...");

        const metadata = this.doc.metadata ?? {
          version: VERSION,
          createdAt: Date.now(),
          lastModified: Date.now(),
        };

        // Create manifest
        const manifest = {
          version: VERSION,
          createdAt: metadata.createdAt,
          lastModified: metadata.lastModified,
          itemCount: Object.keys(this.doc.items ?? {}).length,
        };

        // Prepare files for ZIP
        const files: Record<string, Uint8Array> = {
          "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
          "document.automerge": Automerge.save(this.doc),
        };

        // Add audio files
        const audioFiles = Object.entries(this.doc.audioFiles ?? {});
        debug.persistence.log(`Exporting ${audioFiles.length} audio files...`);

        for (const [itemId, audioKey] of audioFiles) {
          try {
            const audioContext = new AudioContext();
            const buffer = await loadAudio(audioKey, audioContext);
            if (buffer) {
              const serialized = serializeAudioBuffer(buffer);
              const json = JSON.stringify({
                sampleRate: serialized.sampleRate,
                length: serialized.length,
                numberOfChannels: serialized.numberOfChannels,
                channelData: serialized.channelData.map((ch) => Array.from(ch)),
              });
              files[`audio/${itemId}.json`] = strToU8(json);
              debug.persistence.log(`Exported audio for item ${itemId}`);
            } else {
              debug.persistence.warn(
                `Audio buffer not found for item ${itemId}`,
              );
            }
          } catch (error) {
            debug.persistence.warn(
              `Failed to export audio for item ${itemId}:`,
              error,
            );
            // Continue with other audio files
          }
        }

        // Create ZIP
        try {
          const zipped = zipSync(files, { level: 6 });
          const zippedCopy = new Uint8Array(zipped);
          const blob = new Blob([zippedCopy], { type: "application/zip" });
          debug.persistence.log(
            `Export complete: ${blob.size} bytes, ${Object.keys(files).length} files`,
          );
          return blob;
        } catch (error) {
          debug.persistence.error("Failed to create ZIP:", error);
          throw new ImportExportError("Failed to compress export data", {
            cause: error,
            userMessage: "Export compression failed. Please try again.",
          });
        }
      },
      {
        operation: "export",
        category: "persistence",
        showNotification: true,
        onError: handleExportError,
        rethrow: true,
      },
    ).then((result) => result!);
  }

  async importFromFile(file: File): Promise<void> {
    return asyncErrorBoundary(
      async () => {
        debug.persistence.log(`Starting import from file: ${file.name}`);

        // Read file
        let arrayBuffer: ArrayBuffer;
        try {
          arrayBuffer = await file.arrayBuffer();
        } catch (error) {
          throw new ImportExportError("Failed to read import file", {
            cause: error,
            userMessage: "Could not read the file. Please try again.",
          });
        }

        const uint8 = new Uint8Array(arrayBuffer);

        // Unzip
        let unzipped: Record<string, Uint8Array>;
        try {
          unzipped = unzipSync(uint8);
          debug.persistence.log(
            `Unzipped ${Object.keys(unzipped).length} files`,
          );
        } catch (error) {
          debug.persistence.error("Failed to unzip import file:", error);
          throw new ImportExportError("Failed to decompress import file", {
            cause: error,
            userMessage:
              "The file appears to be corrupted or is not a valid export.",
          });
        }

        // Validate manifest
        const manifestBytes = unzipped["manifest.json"];
        if (manifestBytes) {
          try {
            const manifest = JSON.parse(strFromU8(manifestBytes));
            debug.persistence.log(
              `Import manifest: version=${manifest.version}, items=${manifest.itemCount}`,
            );

            // Version check (optional - can be enhanced)
            if (manifest.version && manifest.version !== VERSION) {
              debug.persistence.warn(
                `Version mismatch: file=${manifest.version}, current=${VERSION}`,
              );
            }
          } catch (error) {
            debug.persistence.warn("Failed to parse manifest:", error);
          }
        }

        // Load document
        const docBytes = unzipped["document.automerge"];
        if (!docBytes) {
          throw new ImportExportError(
            "Invalid export: missing document.automerge",
            {
              userMessage:
                "The file is missing required data and cannot be imported.",
            },
          );
        }

        let newDoc: Automerge.Doc<EchoChamberDoc>;
        try {
          newDoc = this.ensureDocShape(
            Automerge.load<EchoChamberDoc>(docBytes),
          );
          debug.persistence.log(
            `Loaded document with ${Object.keys(newDoc.items ?? {}).length} items`,
          );
        } catch (error) {
          debug.persistence.error("Failed to load Automerge document:", error);
          throw new ImportExportError("Failed to load document data", {
            cause: error,
            userMessage: "The document data is corrupted or invalid.",
          });
        }

        // Clear existing audio
        try {
          const existingKeys = await getAllAudioKeys();
          debug.persistence.log(
            `Clearing ${existingKeys.length} existing audio files...`,
          );
          for (const key of existingKeys) {
            await deleteAudio(key);
          }
        } catch (error) {
          debug.persistence.warn("Failed to clear existing audio:", error);
          // Continue - not critical
        }

        // Import audio files
        const audioContext = new AudioContext();
        let successCount = 0;
        let failCount = 0;

        for (const [path, data] of Object.entries(unzipped)) {
          if (path.startsWith("audio/")) {
            const itemId = path.replace("audio/", "").replace(".json", "");
            try {
              const json = JSON.parse(strFromU8(data));

              // Validate audio data structure
              if (
                !json.numberOfChannels ||
                !json.length ||
                !json.sampleRate ||
                !Array.isArray(json.channelData)
              ) {
                throw new Error("Invalid audio data structure");
              }

              const channelData = json.channelData.map(
                (ch: number[]) => new Float32Array(ch),
              );

              const buffer = audioContext.createBuffer(
                json.numberOfChannels,
                json.length,
                json.sampleRate,
              );

              for (let i = 0; i < json.numberOfChannels; i++) {
                if (channelData[i]) {
                  buffer.copyToChannel(channelData[i], i);
                }
              }

              const docAudioKey =
                newDoc.audioFiles?.[itemId] ?? `audio-${itemId}`;
              await saveAudio(docAudioKey, buffer);
              successCount++;
              debug.persistence.log(`Imported audio for item ${itemId}`);
            } catch (error) {
              failCount++;
              debug.persistence.warn(
                `Failed to import audio for item ${itemId}:`,
                error,
              );
              // Continue with other audio files
            }
          }
        }

        debug.persistence.log(
          `Audio import complete: ${successCount} succeeded, ${failCount} failed`,
        );

        // Replace current document
        this.doc = newDoc;
        this.localEditsBlocked = false;
        this.saveDoc();

        debug.persistence.log("Import complete - reloading page");

        // Reload page to apply changes
        window.location.reload();
      },
      {
        operation: "import",
        category: "persistence",
        showNotification: true,
        onError: handleImportError,
        rethrow: true,
      },
    ).then(() => {});
  }
}

export const persistence = new Persistence();
export type { SoundboardItemData, TextboxItemData, ThemeData };
