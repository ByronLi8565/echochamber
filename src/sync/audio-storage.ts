/**
 * IndexedDB-based audio storage for AudioBuffer data
 */

import { Effect, pipe } from "effect";
import { runPromise } from "../util/utils.ts";
import { handleIndexedDBError, StorageError } from "../util/errors.ts";
import { debug } from "../util/debug";

const DB_NAME = "echochamber-audio";
const DB_VERSION = 1;
const STORE_NAME = "audioBuffers";

interface SerializedAudioBuffer {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  channelData: Float32Array[];
  roomCode: string | null;
}

interface StoredAudioBuffer {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  channelData: Float32Array[];
  roomCode?: string | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let activeRoomCode: string | null = null;

export function setAudioStorageRoom(roomCode: string | null): void {
  activeRoomCode = roomCode;
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        const error = request.error || new Error("Failed to open IndexedDB");
        debug.persistence.error("IndexedDB open failed:", error);
        handleIndexedDBError("open", error);
        reject(
          new StorageError("Failed to open audio database", {
            cause: error,
            userMessage:
              "Could not access audio storage. Please check browser settings.",
          }),
        );
      };

      request.onsuccess = () => {
        debug.persistence.log("IndexedDB opened successfully");
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
            debug.persistence.log("Created audio buffer object store");
          }
        } catch (error) {
          debug.persistence.error("IndexedDB upgrade failed:", error);
          reject(
            new StorageError("Failed to upgrade audio database", {
              cause: error,
              userMessage: "Database upgrade failed. Please refresh the page.",
            }),
          );
        }
      };

      request.onblocked = () => {
        debug.persistence.warn(
          "IndexedDB open blocked - close other tabs using this app",
        );
      };
    } catch (error) {
      debug.persistence.error("IndexedDB initialization failed:", error);
      reject(
        new StorageError("Failed to initialize audio database", {
          cause: error,
          userMessage:
            "Storage initialization failed. Please check browser settings.",
        }),
      );
    }
  });

  return dbPromise;
}

function openDatabaseEffect(): Effect.Effect<IDBDatabase, StorageError, never> {
  return Effect.tryPromise({
    try: () => openDatabase(),
    catch: (cause) =>
      new StorageError({
        message: "Failed to open IndexedDB audio database",
        cause,
      }),
  });
}

function runDbRequestEffect<T>(
  mode: IDBTransactionMode,
  runRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Effect.Effect<T, StorageError, never> {
  return pipe(
    openDatabaseEffect(),
    Effect.flatMap((db) =>
      Effect.tryPromise({
        try: () =>
          new Promise<T>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], mode);
            const store = transaction.objectStore(STORE_NAME);
            const request = runRequest(store);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          }),
        catch: (cause) =>
          new StorageError({
            message: `IndexedDB ${mode} transaction failed`,
            cause,
          }),
      }),
    ),
  );
}

export function serializeAudioBuffer(
  buffer: AudioBuffer,
): SerializedAudioBuffer {
  const channelData: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }

  return {
    sampleRate: buffer.sampleRate,
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    channelData,
    roomCode: activeRoomCode,
  };
}

export function deserializeAudioBuffer(
  data: SerializedAudioBuffer,
  audioContext: AudioContext,
): AudioBuffer {
  const buffer = audioContext.createBuffer(
    data.numberOfChannels,
    data.length,
    data.sampleRate,
  );

  for (let i = 0; i < data.numberOfChannels; i++) {
    const channel = data.channelData[i];
    if (channel) {
      buffer.copyToChannel(new Float32Array(channel), i);
    }
  }

  return buffer;
}

export async function saveAudio(
  key: string,
  buffer: AudioBuffer,
): Promise<void> {
  try {
    debug.persistence.log(`Saving audio: ${key}`);
    const serialized = serializeAudioBuffer(buffer);
    await runPromise(
      pipe(
        runDbRequestEffect("readwrite", (store) => store.put(serialized, key)),
        Effect.asVoid,
      ),
    );
    debug.persistence.log(`Audio saved successfully: ${key}`);
  } catch (error) {
    debug.persistence.error("Failed to save audio:", error);
    handleIndexedDBError("save", error);
    throw error;
  }
}

export async function loadAudio(
  key: string,
  audioContext: AudioContext,
): Promise<AudioBuffer | null> {
  try {
    const data = await runPromise(
      runDbRequestEffect<StoredAudioBuffer | undefined>("readonly", (store) =>
        store.get(key),
      ),
    );
    if (!data) {
      debug.persistence.log(`Audio not found: ${key}`);
      return null;
    }
    if (data.roomCode !== activeRoomCode) {
      debug.persistence.log(`Audio ${key} skipped - room code mismatch`);
      return null;
    }
    const buffer = deserializeAudioBuffer(
      data as SerializedAudioBuffer,
      audioContext,
    );
    debug.persistence.log(`Audio loaded successfully: ${key}`);
    return buffer;
  } catch (error) {
    debug.persistence.error("Failed to load audio:", error);
    // Don't show notification for load failures - they're often expected
    return null;
  }
}

export async function deleteAudio(key: string): Promise<void> {
  try {
    debug.persistence.log(`Deleting audio: ${key}`);
    await runPromise(
      pipe(
        runDbRequestEffect("readwrite", (store) => store.delete(key)),
        Effect.asVoid,
      ),
    );
    debug.persistence.log(`Audio deleted successfully: ${key}`);
  } catch (error) {
    debug.persistence.error("Failed to delete audio:", error);
    // Don't throw - deletion failures are often non-critical
    return;
  }
}

export async function getAllAudioKeys(): Promise<string[]> {
  try {
    const keys = await runPromise(
      runDbRequestEffect<IDBValidKey[]>("readonly", (store) =>
        store.getAllKeys(),
      ),
    );
    const stringKeys = keys.map((key) => String(key));
    debug.persistence.log(`Retrieved ${stringKeys.length} audio keys`);
    return stringKeys;
  } catch (error) {
    debug.persistence.error("Failed to get all audio keys:", error);
    // Return empty array on failure rather than throwing
    return [];
  }
}
