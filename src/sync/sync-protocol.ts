import { Either, Schema } from "effect";

const ConnectionCountMessageSchema = Schema.Struct({
  type: Schema.Literal("connectionCount"),
  count: Schema.Number,
});

const AudioPlayMessageSchema = Schema.Struct({
  type: Schema.Literal("audioPlay"),
  itemId: Schema.String,
});

const DestructiveIntentMessageSchema = Schema.Struct({
  type: Schema.Literal("destructiveIntent"),
  token: Schema.String,
  op: Schema.Literal("delete-item"),
  itemId: Schema.String,
  expiresAt: Schema.Number,
});

export type ConnectionCountMessage = Schema.Schema.Type<
  typeof ConnectionCountMessageSchema
>;
export type AudioPlayMessage = Schema.Schema.Type<typeof AudioPlayMessageSchema>;
export type DestructiveIntentMessage = Schema.Schema.Type<
  typeof DestructiveIntentMessageSchema
>;

export type ServerJsonMessage = ConnectionCountMessage | AudioPlayMessage;
export type ClientJsonMessage = AudioPlayMessage | DestructiveIntentMessage;

const decodeConnectionCount = Schema.decodeUnknownEither(
  ConnectionCountMessageSchema,
);
const decodeAudioPlay = Schema.decodeUnknownEither(AudioPlayMessageSchema);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function decodeServerJsonMessage(
  raw: string,
): Either.Either<ServerJsonMessage | null, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return Either.left(error);
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return Either.right(null);
  }

  switch (parsed.type) {
    case "connectionCount":
      return decodeConnectionCount(parsed);
    case "audioPlay":
      return decodeAudioPlay(parsed);
    default:
      return Either.right(null);
  }
}

export function createAudioPlayMessage(itemId: string): AudioPlayMessage {
  return { type: "audioPlay", itemId };
}

export function createDestructiveIntentMessage(
  itemId: string,
  expiresAt: number,
): DestructiveIntentMessage {
  return {
    type: "destructiveIntent",
    token: crypto.randomUUID(),
    op: "delete-item",
    itemId,
    expiresAt,
  };
}

export function encodeClientJsonMessage(message: ClientJsonMessage): string {
  return JSON.stringify(message);
}
