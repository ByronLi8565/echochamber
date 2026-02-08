/**
 * IndexedDB-based audio storage for AudioBuffer data
 */

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
  const db = await openDatabase();
  const serialized = serializeAudioBuffer(buffer);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(serialized, key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function loadAudio(
  key: string,
  audioContext: AudioContext,
): Promise<AudioBuffer | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const data = request.result as StoredAudioBuffer | undefined;
      if (data) {
        if (data.roomCode !== activeRoomCode) {
          resolve(null);
          return;
        }
        resolve(
          deserializeAudioBuffer(data as SerializedAudioBuffer, audioContext),
        );
      } else {
        resolve(null);
      }
    };
  });
}

export async function deleteAudio(key: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getAllAudioKeys(): Promise<string[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as string[]);
  });
}
