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
    resolve: {
      // tslib's own entry files read the helpers off a default export that the
      // bundler leaves undefined, so every pdf-lib PDF failed on Lovable
      // ("Cannot destructure property '__extends'", Access Card Form, 27 Oct
      // 2026). Its plain ESM file exports them directly. One tslib for the
      // whole app: package.json "overrides".
      alias: [{ find: /^tslib$/, replacement: "tslib/tslib.es6.mjs" }],
    },
  },
});
