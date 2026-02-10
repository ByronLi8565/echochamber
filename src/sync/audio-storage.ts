/**
 * IndexedDB-based audio storage for AudioBuffer data
 */

import { StorageError, handleIndexedDBError } from "../util/error-handler";
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
          })
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
            })
          );
        }
      };

      request.onblocked = () => {
        debug.persistence.warn(
          "IndexedDB open blocked - close other tabs using this app"
        );
      };
    } catch (error) {
      debug.persistence.error("IndexedDB initialization failed:", error);
      reject(
        new StorageError("Failed to initialize audio database", {
          cause: error,
          userMessage:
            "Storage initialization failed. Please check browser settings.",
        })
      );
    }
  });

  return dbPromise;
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
    const db = await openDatabase();
    const serialized = serializeAudioBuffer(buffer);

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], "readwrite");

        transaction.onerror = () => {
          const error =
            transaction.error || new Error("Transaction failed");
          debug.persistence.error("Save transaction failed:", error);
          handleIndexedDBError("save", error);
          reject(
            new StorageError(`Failed to save audio: ${key}`, {
              cause: error,
              userMessage: "Could not save audio. Storage may be full.",
            })
          );
        };

        transaction.onabort = () => {
          debug.persistence.warn("Save transaction aborted");
          reject(
            new StorageError(`Save transaction aborted: ${key}`, {
              userMessage: "Audio save was cancelled.",
            })
          );
        };

        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(serialized, key);

        request.onerror = () => {
          const error = request.error || new Error("Put request failed");
          debug.persistence.error("Save request failed:", error);
          reject(
            new StorageError(`Failed to save audio: ${key}`, {
              cause: error,
            })
          );
        };

        request.onsuccess = () => {
          debug.persistence.log(`Audio saved successfully: ${key}`);
          resolve();
        };
      } catch (error) {
        debug.persistence.error("Failed to create save transaction:", error);
        reject(
          new StorageError(`Failed to save audio: ${key}`, {
            cause: error,
          })
        );
      }
    });
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
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], "readonly");

        transaction.onerror = () => {
          const error =
            transaction.error || new Error("Transaction failed");
          debug.persistence.error("Load transaction failed:", error);
          reject(
            new StorageError(`Failed to load audio: ${key}`, {
              cause: error,
            })
          );
        };

        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onerror = () => {
          const error = request.error || new Error("Get request failed");
          debug.persistence.error("Load request failed:", error);
          reject(
            new StorageError(`Failed to load audio: ${key}`, {
              cause: error,
            })
          );
        };

        request.onsuccess = () => {
          try {
            const data = request.result as StoredAudioBuffer | undefined;
            if (data) {
              // Check room code match
              if (data.roomCode !== activeRoomCode) {
                debug.persistence.log(
                  `Audio ${key} skipped - room code mismatch`
                );
                resolve(null);
                return;
              }

              // Deserialize audio buffer
              const buffer = deserializeAudioBuffer(
                data as SerializedAudioBuffer,
                audioContext
              );
              debug.persistence.log(`Audio loaded successfully: ${key}`);
              resolve(buffer);
            } else {
              debug.persistence.log(`Audio not found: ${key}`);
              resolve(null);
            }
          } catch (error) {
            debug.persistence.error("Failed to deserialize audio:", error);
            reject(
              new StorageError(`Failed to deserialize audio: ${key}`, {
                cause: error,
                userMessage: "Audio file may be corrupted.",
              })
            );
          }
        };
      } catch (error) {
        debug.persistence.error("Failed to create load transaction:", error);
        reject(
          new StorageError(`Failed to load audio: ${key}`, {
            cause: error,
          })
        );
      }
    });
  } catch (error) {
    debug.persistence.error("Failed to load audio:", error);
    // Don't show notification for load failures - they're often expected
    return null;
  }
}

export async function deleteAudio(key: string): Promise<void> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], "readwrite");

        transaction.onerror = () => {
          const error =
            transaction.error || new Error("Transaction failed");
          debug.persistence.error("Delete transaction failed:", error);
          reject(
            new StorageError(`Failed to delete audio: ${key}`, {
              cause: error,
            })
          );
        };

        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onerror = () => {
          const error = request.error || new Error("Delete request failed");
          debug.persistence.error("Delete request failed:", error);
          reject(
            new StorageError(`Failed to delete audio: ${key}`, {
              cause: error,
            })
          );
        };

        request.onsuccess = () => {
          debug.persistence.log(`Audio deleted successfully: ${key}`);
          resolve();
        };
      } catch (error) {
        debug.persistence.error("Failed to create delete transaction:", error);
        reject(
          new StorageError(`Failed to delete audio: ${key}`, {
            cause: error,
          })
        );
      }
    });
  } catch (error) {
    debug.persistence.error("Failed to delete audio:", error);
    // Don't throw - deletion failures are often non-critical
    return;
  }
}

export async function getAllAudioKeys(): Promise<string[]> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], "readonly");

        transaction.onerror = () => {
          const error =
            transaction.error || new Error("Transaction failed");
          debug.persistence.error("GetAllKeys transaction failed:", error);
          reject(
            new StorageError("Failed to get audio keys", {
              cause: error,
            })
          );
        };

        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAllKeys();

        request.onerror = () => {
          const error = request.error || new Error("GetAllKeys request failed");
          debug.persistence.error("GetAllKeys request failed:", error);
          reject(
            new StorageError("Failed to get audio keys", {
              cause: error,
            })
          );
        };

        request.onsuccess = () => {
          const keys = request.result as string[];
          debug.persistence.log(`Retrieved ${keys.length} audio keys`);
          resolve(keys);
        };
      } catch (error) {
        debug.persistence.error("Failed to create getAllKeys transaction:", error);
        reject(
          new StorageError("Failed to get audio keys", {
            cause: error,
          })
        );
      }
    });
  } catch (error) {
    debug.persistence.error("Failed to get all audio keys:", error);
    // Return empty array on failure rather than throwing
    return [];
  }
}
