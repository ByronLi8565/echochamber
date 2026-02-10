/**
 * Audio sync via Cloudflare R2.
 * Handles upload/download of audio files with Effect for retry and concurrency.
 */

import { Effect, Schedule, pipe } from "effect";
import { saveAudio, loadAudio } from "./audio-storage.ts";
import { itemRegistry } from "../core/items.ts";
import { runPromise, SyncError } from "../util/effect-runtime.ts";

// --- Module state ---

let roomCode: string | null = null;
const knownAudioKeys = new Set<string>();
const pendingDownloads = new Set<string>();
const queuedDownloadKeys = new Map<string, string>();
const BATCH_UPLOAD_CONCURRENCY = 4;

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

function withRoomCode<A>(
  run: (room: string) => Effect.Effect<A, SyncError, never>,
): Effect.Effect<A, SyncError, never> {
  if (!roomCode) {
    return Effect.fail(
      new SyncError({
        message: "Audio sync requested without an active room",
      }),
    );
  }
  return run(roomCode);
}

function logSyncError(
  action: string,
  itemId: string,
  error: unknown,
  details?: Record<string, unknown>,
): void {
  console.error("[AudioSync]", {
    action,
    itemId,
    roomCode,
    ...details,
    error,
  });
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
  return withRoomCode((room) =>
    pipe(
      Effect.try({
        try: () => serializeAudioBinary(audioBuffer),
        catch: (cause) =>
          new SyncError({
            message: `Audio serialization failed for ${itemId}`,
            cause,
          }),
      }),
      Effect.flatMap((binary) =>
        Effect.tryPromise({
          try: () =>
            fetch(`/api/rooms/${room}/audio/${itemId}`, {
              method: "PUT",
              headers: { "Content-Length": String(binary.byteLength) },
              body: binary,
            }),
          catch: (cause) =>
            new SyncError({
              message: `Audio upload request failed for ${itemId}`,
              cause,
            }),
        }),
      ),
      Effect.flatMap((response) =>
        response.ok
          ? Effect.void
          : Effect.fail(
              new SyncError({
                message: `Audio upload failed for ${itemId}: HTTP ${response.status}`,
              }),
            ),
      ),
    ),
  );
}

function downloadEffect(itemId: string) {
  return withRoomCode((room) =>
    pipe(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(`/api/rooms/${room}/audio/${itemId}`);
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
    ),
  );
}

function loadAudioEffect(
  audioKey: string,
  ctx: AudioContext,
  itemId: string,
): Effect.Effect<AudioBuffer | null, SyncError, never> {
  return Effect.tryPromise({
    try: () => loadAudio(audioKey, ctx),
    catch: (cause) =>
      new SyncError({
        message: `Failed loading IndexedDB audio key ${audioKey} for ${itemId}`,
        cause,
      }),
  });
}

function saveAudioEffect(
  audioKey: string,
  buffer: AudioBuffer,
  itemId: string,
): Effect.Effect<void, SyncError, never> {
  return Effect.tryPromise({
    try: () => saveAudio(audioKey, buffer),
    catch: (cause) =>
      new SyncError({
        message: `Failed saving IndexedDB audio key ${audioKey} for ${itemId}`,
        cause,
      }),
  });
}

function decodeAudioBinaryEffect(
  itemId: string,
  payload: ArrayBuffer,
): Effect.Effect<AudioBuffer, SyncError, never> {
  return Effect.try({
    try: () => deserializeAudioBinary(payload),
    catch: (cause) =>
      new SyncError({
        message: `Failed decoding downloaded audio for ${itemId}`,
        cause,
      }),
  });
}

function hydrateSoundboardAudio(itemId: string, buffer: AudioBuffer): void {
  const item = itemRegistry.get(itemId);
  if (item?.loadAudioBuffer) {
    item.loadAudioBuffer(buffer);
  }
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
        logSyncError("upload", itemId, err, { message: err.message });
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
    await runPromise(
      pipe(
        Effect.gen(function* () {
          const ctx = new AudioContext();
          const existing = yield* loadAudioEffect(audioKey, ctx, itemId);
          if (existing) {
            yield* Effect.sync(() => {
              markAudioKeyKnown(audioKey);
              hydrateSoundboardAudio(itemId, existing);
            });
            return;
          }

          const arrayBuffer = yield* downloadEffect(itemId);
          const buffer = yield* decodeAudioBinaryEffect(itemId, arrayBuffer);
          yield* saveAudioEffect(audioKey, buffer, itemId);
          yield* Effect.sync(() => {
            markAudioKeyKnown(audioKey);
            hydrateSoundboardAudio(itemId, buffer);
            console.log(`[AudioSync] Downloaded audio for ${itemId}`);
          });
        }),
        Effect.catchAll((err) => {
          logSyncError("download", itemId, err, { audioKey });
          return Effect.void;
        }),
      ),
    );
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
            const buffer = yield* loadAudioEffect(audioKey, ctx, itemId);
            if (buffer) {
              yield* uploadEffect(itemId, buffer);
            }
          }),
        { concurrency: BATCH_UPLOAD_CONCURRENCY },
      ),
      Effect.catchAll((err) => {
        logSyncError("upload-batch", "*", err);
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

  void runPromise(
    pipe(
      withRoomCode((room) =>
        Effect.tryPromise({
          try: () => fetch(`/api/rooms/${room}/audio/${itemId}`, { method: "DELETE" }),
          catch: (cause) =>
            new SyncError({
              message: `Audio delete request failed for ${itemId}`,
              cause,
            }),
        }),
      ),
      Effect.flatMap((response) =>
        response.ok
          ? Effect.void
          : Effect.fail(
              new SyncError({
                message: `Audio delete failed for ${itemId}: HTTP ${response.status}`,
              }),
            ),
      ),
      Effect.catchAll((err) =>
        Effect.sync(() => {
          logSyncError("delete", itemId, err);
        }),
      ),
    ),
  );
}
