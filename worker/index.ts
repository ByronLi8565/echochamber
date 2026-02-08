import { Room } from "./room";

export { Room };

interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  AUDIO_BUCKET: R2Bucket;
}

const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB

function generateRoomCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (const v of values) {
    code += chars[v % chars.length];
  }
  return code;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // POST /api/rooms — create a new room
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const code = generateRoomCode();
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);

      // Forward the doc bytes to the DO to initialize
      const initRequest = new Request("https://room/init", {
        method: "POST",
        body: request.body,
      });
      const initResponse = await stub.fetch(initRequest);
      if (!initResponse.ok) {
        return new Response("Failed to initialize room", { status: 500 });
      }

      return Response.json({ roomCode: code });
    }

    // GET /ws/<code> — WebSocket upgrade to Durable Object
    const wsMatch = url.pathname.match(/^\/ws\/([a-z0-9]{8})$/);
    if (wsMatch) {
      const code = wsMatch[1]!;
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    // PUT/GET/DELETE /api/rooms/:code/audio/:itemId — R2 audio storage
    const audioMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9]{8})\/audio\/(.+)$/);
    if (audioMatch) {
      const [, code, itemId] = audioMatch;
      const key = `${code}/${itemId}`;

      if (request.method === "PUT") {
        const contentLength = parseInt(request.headers.get("content-length") || "0");
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
