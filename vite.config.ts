// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        // tslib's ESM entry reads the helpers off the UMD file's default export;
        // in the server build that default was undefined, so every pdf-lib PDF
        // failed on Lovable ("Cannot destructure property '__extends'", Access
        // Card preview, 27 Oct 2026). Use the plain ESM file of the tslib each
        // package already gets (pdf-lib 1.x, Supabase its own 2.x).
        name: "tslib-esm",
        enforce: "pre",
        async resolveId(source, importer, options) {
          if (source !== "tslib") return null;
          return this.resolve("tslib/tslib.es6.js", importer, { ...options, skipSelf: true });
        },
      },
    ],
  },
});
