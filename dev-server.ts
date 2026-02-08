#!/usr/bin/env bun

import { watch } from "fs";
import { resolve, extname } from "path";
import type { BunPlugin } from "bun";

// Bun's browser target resolves @automerge/automerge to the "bundler" WASM
// variant, which uses `import * as wasm from "...wasm"` — a webpack-style
// WASM import that Bun doesn't support. Redirect to the base64 variant which
// embeds WASM inline and works everywhere.
const automergeWasmFix: BunPlugin = {
  name: "automerge-wasm-fix",
  setup(build) {
    build.onResolve({ filter: /^@automerge\/automerge$/ }, () => ({
      path: resolve("./node_modules/@automerge/automerge/dist/mjs/entrypoints/fullfat_base64.js"),
    }));
  },
};

const PORT = 3000;
const DIST_DIR = resolve("./dist");

// Initial build
console.log("Building project...");
await build();
console.log("✓ Build complete");

// Watch for changes
console.log("Watching for changes...");
const watcher = watch("./src", { recursive: true }, async (event, filename) => {
  if (filename) {
    console.log(`\n[${event}] ${filename}`);
    console.log("Rebuilding...");
    await build();
    console.log("✓ Build complete");
  }
});

// Also watch index.html and styles.css
watch(".", async (event, filename) => {
  if (filename === "index.html" || filename === "styles.css") {
    console.log(`\n[${event}] ${filename}`);
    console.log("Rebuilding...");
    await build();
    console.log("✓ Build complete");
  }
});

// Start server
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;

    try {
      const file = Bun.file(resolve(DIST_DIR, filePath.slice(1)));

      if (await file.exists()) {
        return new Response(file, {
          headers: {
            "Content-Type": getContentType(filePath),
          },
        });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Server error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});

console.log(`\n🚀 Dev server running at http://localhost:${PORT}`);
console.log("Press Ctrl+C to stop\n");

async function build() {
  const result = await Bun.build({
    entrypoints: ["./index.html"],
    outdir: "./dist",
    plugins: [automergeWasmFix],
  });

  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
  }
}

function getContentType(path: string): string {
  const ext = extname(path).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
  };
  return types[ext] || "application/octet-stream";
}

// Cleanup on exit
process.on("SIGINT", () => {
  console.log("\n\nShutting down dev server...");
  watcher.close();
  process.exit(0);
});
