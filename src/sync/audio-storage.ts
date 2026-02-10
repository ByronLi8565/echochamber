/**
 * IndexedDB-based audio storage for AudioBuffer data
 */

import { Effect, pipe } from "effect";
import { runPromise, StorageError } from "../util/effect-runtime.ts";

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
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
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
  const serialized = serializeAudioBuffer(buffer);
  await runPromise(
    pipe(
      runDbRequestEffect("readwrite", (store) => store.put(serialized, key)),
      Effect.asVoid,
    ),
  );
}

export async function loadAudio(
  key: string,
  audioContext: AudioContext,
): Promise<AudioBuffer | null> {
  const data = await runPromise(
    runDbRequestEffect<StoredAudioBuffer | undefined>("readonly", (store) =>
      store.get(key),
    ),
  );
  if (!data) return null;
  if (data.roomCode !== activeRoomCode) return null;
  return deserializeAudioBuffer(data as SerializedAudioBuffer, audioContext);
}

export async function deleteAudio(key: string): Promise<void> {
  await runPromise(
    pipe(
      runDbRequestEffect("readwrite", (store) => store.delete(key)),
      Effect.asVoid,
    ),
  );
}

export async function getAllAudioKeys(): Promise<string[]> {
  return runPromise(
    runDbRequestEffect<IDBValidKey[]>("readonly", (store) => store.getAllKeys()),
  ).then((keys) => keys.map((key) => String(key)));
}
