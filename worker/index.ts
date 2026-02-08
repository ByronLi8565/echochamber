import { Room } from "./room";

export { Room };

interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  AUDIO_BUCKET: R2Bucket;
}

const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB
const ROOM_CODE_SEGMENT = "(?:[a-z0-9]{8}|[a-z]{3,10}-[a-z]{3,10}-[a-z]{3,10})";
const WS_PATH_RE = new RegExp(`^/ws/(${ROOM_CODE_SEGMENT})$`);
const AUDIO_PATH_RE = new RegExp(
  `^/api/rooms/(${ROOM_CODE_SEGMENT})/audio/(.+)$`,
);
const COMMON_WORDS = [
  "amber",
  "anchor",
  "apple",
  "apron",
  "beach",
  "berry",
  "blaze",
  "bloom",
  "board",
  "brave",
  "breeze",
  "brick",
  "brook",
  "cabin",
  "cedar",
  "chalk",
  "charm",
  "cherry",
  "cloud",
  "clover",
  "coast",
  "coral",
  "cotton",
  "creek",
  "dawn",
  "delta",
  "ember",
  "fable",
  "field",
  "flame",
  "flora",
  "forest",
  "frost",
  "garden",
  "gleam",
  "glen",
  "globe",
  "grain",
  "grand",
  "grass",
  "grove",
  "harbor",
  "hazel",
  "heart",
  "hill",
  "honey",
  "ivory",
  "jade",
  "jolly",
  "juniper",
  "lagoon",
  "lantern",
  "lemon",
  "lilac",
  "linen",
  "maple",
  "meadow",
  "melon",
  "mint",
  "mist",
  "moon",
  "moss",
  "nectar",
  "olive",
  "opal",
  "orbit",
  "orchard",
  "pebble",
  "pine",
  "planet",
  "plume",
  "pond",
  "prairie",
  "quartz",
  "quest",
  "raven",
  "river",
  "robin",
  "rose",
  "saddle",
  "sage",
  "scale",
  "shadow",
  "shore",
  "silver",
  "sky",
  "smoke",
  "solar",
  "spark",
  "spice",
  "spring",
  "star",
  "stone",
  "stream",
  "sunset",
  "surf",
  "thistle",
  "timber",
  "topaz",
  "trail",
  "valley",
  "velvet",
  "vine",
  "walnut",
  "water",
  "willow",
  "wind",
  "wing",
  "winter",
  "wood",
  "wren",
  "zesty",
];

function generateRoomCode(): string {
  const pool = [...COMMON_WORDS];
  const selected: string[] = [];

  for (let i = 0; i < 3; i++) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const index = value % pool.length;
    selected.push(pool.splice(index, 1)[0]!);
  }

  return selected.join("-");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // POST /api/rooms — create a new room
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const code = generateRoomCode();
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);
      const initBytes = await request.arrayBuffer();

      // Forward the doc bytes to the DO to initialize
      const initRequest = new Request("https://room/init", {
        method: "POST",
        body: initBytes,
      });
      const initResponse = await stub.fetch(initRequest);
      if (!initResponse.ok) {
        return new Response("Failed to initialize room", { status: 500 });
      }

      return Response.json({ roomCode: code });
    }

    // GET /ws/<code> — WebSocket upgrade to Durable Object
    const wsMatch = url.pathname.match(WS_PATH_RE);
    if (wsMatch) {
      const code = wsMatch[1]!;
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    // PUT/GET/DELETE /api/rooms/:code/audio/:itemId — R2 audio storage
    const audioMatch = url.pathname.match(AUDIO_PATH_RE);
    if (audioMatch) {
      const [, code, itemId] = audioMatch;
      const key = `${code}/${itemId}`;

      if (request.method === "PUT") {
        const contentLength = parseInt(
          request.headers.get("content-length") || "0",
        );
        if (contentLength > MAX_AUDIO_SIZE) {
          return new Response("File too large", { status: 413 });
        }
        await env.AUDIO_BUCKET.put(key, request.body);
        return new Response("OK", { status: 200 });
      }

      if (request.method === "GET") {
        const object = await env.AUDIO_BUCKET.get(key);
        if (!object) {
          return new Response("Not Found", { status: 404 });
        }
        return new Response(object.body, {
          headers: { "Content-Type": "application/octet-stream" },
        });
      }

      if (request.method === "DELETE") {
        await env.AUDIO_BUCKET.delete(key);
        return new Response("OK", { status: 200 });
      }
    }

    // Everything else — static assets (SPA fallback handled by wrangler config)
    return env.ASSETS.fetch(request);
  },
};
