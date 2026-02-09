import { resolve } from "path";
import type { BunPlugin } from "bun";

// Bun's browser target resolves @automerge/automerge to the "bundler" WASM
// variant, which uses `import * as wasm from "...wasm"` — a webpack-style
// WASM import that Bun doesn't support. Redirect to the base64 variant which
// embeds WASM inline and works everywhere.
export const automergeWasmFix: BunPlugin = {
  name: "automerge-wasm-fix",
  setup(build) {
    build.onResolve({ filter: /^@automerge\/automerge$/ }, () => ({
      path: resolve("./node_modules/@automerge/automerge/dist/mjs/entrypoints/fullfat_base64.js"),
    }));
  },
};

export async function buildClient(): Promise<boolean> {
  const result = await Bun.build({
    entrypoints: ["./src/ui/index.html"],
    outdir: "./dist",
    plugins: [automergeWasmFix],
  });

  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    return false;
  }
  return true;
}

// Run directly when executed as a script
if (import.meta.main) {
  console.log("Building client...");
  const ok = await buildClient();
  if (ok) {
    console.log("Build complete");
  } else {
    process.exit(1);
  }
}
