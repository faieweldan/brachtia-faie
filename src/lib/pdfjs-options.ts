/**
 * Options every PDF viewer passes when it opens a file.
 *
 * pdf.js 6 keeps its image decoders - JBIG2 and CCITT fax, JPEG 2000, colour
 * profiles - in separate WebAssembly files, and needs to be told where they
 * are. Without them it quietly skips those images. A photocopier's scan
 * (The Arc's access card form, 30 Sep 2026) stores its black text as CCITT
 * images, so almost every word vanished and only the grey background showed.
 *
 * The files are copied from node_modules/pdfjs-dist/wasm into public/pdfjs/wasm
 * so they ship with the site; copy them again when pdfjs-dist is upgraded.
 */
export const PDFJS_OPTIONS = { wasmUrl: "/pdfjs/wasm/" } as const;
