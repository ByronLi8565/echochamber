/**
 * Audio sync via Cloudflare R2.
 * Handles upload/download of audio files with Effect for retry and concurrency.
 */

import { Effect, Schedule, pipe } from "effect";
import { saveAudio, loadAudio } from "./audio-storage.ts";
import { itemRegistry, isSoundboardItem } from "../core/items.ts";
import { runPromise, SyncError } from "../util/effect-runtime.ts";

// --- Module state ---

let roomCode: string | null = null;
const knownAudioKeys = new Set<string>();
const pendingDownloads = new Set<string>();
const queuedDownloadKeys = new Map<string, string>();

// --- State management ---

export function setAudioSyncRoom(code: string): void {
  if (roomCode !== code) {
    knownAudioKeys.clear();
    pendingDownloads.clear();
    queuedDownloadKeys.clear();
  }
  roomCode = code;
}

export function markAudioKeyKnown(key: string): void {
  knownAudioKeys.add(key);
}

// --- Binary serialization ---

function serializeAudioBinary(buffer: AudioBuffer): ArrayBuffer {
  const headerSize = 12;
  const dataSize = buffer.numberOfChannels * buffer.length * 4;
  const ab = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(ab);

  view.setFloat32(0, buffer.sampleRate, true);
  view.setUint32(4, buffer.numberOfChannels, true);
  view.setUint32(8, buffer.length, true);

  let offset = headerSize;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    new Float32Array(ab, offset, buffer.length).set(channelData);
    offset += buffer.length * 4;
  }

  return ab;
}

function deserializeAudioBinary(data: ArrayBuffer): AudioBuffer {
  const view = new DataView(data);
  const sampleRate = view.getFloat32(0, true);
  const numberOfChannels = view.getUint32(4, true);
  const length = view.getUint32(8, true);

  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(numberOfChannels, length, sampleRate);

  let offset = 12;
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const channelData = new Float32Array(data, offset, length);
    buffer.copyToChannel(channelData, ch);
    offset += length * 4;
  }

  return buffer;
}

// --- Effect-based operations ---

const retrySchedule = pipe(
  Schedule.exponential("500 millis"),
  Schedule.compose(Schedule.recurs(3)),
);

function uploadEffect(itemId: string, audioBuffer: AudioBuffer) {
  return pipe(
    Effect.tryPromise({
      try: () => {
        const binary = serializeAudioBinary(audioBuffer);
        return fetch(`/api/rooms/${roomCode}/audio/${itemId}`, {
          method: "PUT",
          headers: { "Content-Length": String(binary.byteLength) },
          body: binary,
        });
      },
      catch: (cause) =>
        new SyncError({
          message: `Audio upload request failed for ${itemId}`,
          cause,
        }),
    }),
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail(
            new SyncError({
              message: `Audio upload failed for ${itemId}: HTTP ${response.status}`,
            }),
          ),
    ),
  );
}

function downloadEffect(itemId: string) {
  return pipe(
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(`/api/rooms/${roomCode}/audio/${itemId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      },
      catch: (cause) =>
        new SyncError({
          message: `Audio download request failed for ${itemId}`,
          cause,
        }),
    }),
    Effect.retry(retrySchedule),
  );
}

// --- Public API (Promise-based for callers) ---

export async function uploadAudio(
  itemId: string,
  audioBuffer: AudioBuffer,
): Promise<void> {
  if (!roomCode) return;

  await runPromise(
    pipe(
      uploadEffect(itemId, audioBuffer),
      Effect.catchAll((err) => {
        console.error(`[AudioSync] ${err.message}`, err.cause);
        return Effect.void;
      }),
    ),
  );
}

export async function downloadAudioIfMissing(
  itemId: string,
  audioKey: string,
): Promise<void> {
  if (!roomCode) return;
  if (pendingDownloads.has(itemId)) {
    queuedDownloadKeys.set(itemId, audioKey);
    return;
  }

  pendingDownloads.add(itemId);

  try {
    // Check IndexedDB first
    const ctx = new AudioContext();
    const existing = await loadAudio(audioKey, ctx);
    if (existing) {
      markAudioKeyKnown(audioKey);
      // Already have it locally, just make sure the soundboard knows
      const item = itemRegistry.get(itemId);
      if (item && isSoundboardItem(item)) {
        item.loadAudioBuffer(existing);
      }
      return;
    }

    // Fetch from R2 with retry
    const arrayBuffer = await runPromise(
      pipe(
        downloadEffect(itemId),
        Effect.catchAll((err) => {
          console.error(`[AudioSync] ${err.message}`, err.cause);
          return Effect.succeed(null);
        }),
      ),
    );

    if (!arrayBuffer) return;

    const buffer = deserializeAudioBinary(arrayBuffer);
    await saveAudio(audioKey, buffer);
    markAudioKeyKnown(audioKey);

    // Load into the soundboard component
    const item = itemRegistry.get(itemId);
    if (item && isSoundboardItem(item)) {
      item.loadAudioBuffer(buffer);
    }

    console.log(`[AudioSync] Downloaded audio for ${itemId}`);
  } finally {
    pendingDownloads.delete(itemId);
    const queuedKey = queuedDownloadKeys.get(itemId);
    queuedDownloadKeys.delete(itemId);
    if (queuedKey && queuedKey !== audioKey) {
      void downloadAudioIfMissing(itemId, queuedKey);
    }
  }
}

export async function uploadAllExistingAudio(
  audioFiles: Record<string, string>,
): Promise<void> {
  if (!roomCode) return;

  const entries = Object.entries(audioFiles);
  if (entries.length === 0) return;

  const ctx = new AudioContext();

  await runPromise(
    pipe(
      Effect.forEach(
        entries,
        ([itemId, audioKey]) =>
          Effect.gen(function* () {
            const buffer = yield* Effect.tryPromise({
              try: () => loadAudio(audioKey, ctx),
              catch: (cause) =>
                new SyncError({
                  message: `Failed loading audio ${audioKey} for ${itemId}`,
                  cause,
                }),
            });
            if (buffer) {
              yield* uploadEffect(itemId, buffer);
            }
          }),
        { concurrency: 4 },
      ),
      Effect.catchAll((err) => {
        console.error("[AudioSync] Batch upload error:", err);
        return Effect.void;
      }),
    ),
  );

  console.log(`[AudioSync] Uploaded ${entries.length} audio files`);
}

export function checkForNewAudioKeys(audioFiles: Record<string, string>): void {
  for (const [itemId, audioKey] of Object.entries(audioFiles)) {
    if (!knownAudioKeys.has(audioKey)) {
      // Fire-and-forget download
      void downloadAudioIfMissing(itemId, audioKey);
    }
  }
}

export function deleteAudioFromR2(itemId: string): void {
  if (!roomCode) return;

  fetch(`/api/rooms/${roomCode}/audio/${itemId}`, { method: "DELETE" }).catch(
    (err) => {
      console.error(`[AudioSync] Delete failed for ${itemId}:`, err);
    },
  );
}
