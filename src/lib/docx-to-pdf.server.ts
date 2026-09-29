/**
 * A filled Word file as the PDF Word would print - the exact preview.
 *
 * docx-preview draws a .docx with web code and guesses what Word calculates:
 * page breaks, merged paragraph borders (signature lines), page numbers. Close,
 * never exact. A real Word-compatible engine lays it out the way it will print
 * and be signed, so the eye-icon preview uses one.
 *
 * Today the engine is LibreOffice, run on the machine serving the app - which
 * is a laptop with LibreOffice installed. The live app on Lovable cannot run
 * programs, so there this says plainly that the PDF preview is not set up yet;
 * a converter service (or Microsoft Word online) is the decision for live
 * (Dani and Lav, 29 Sep 2026). Only this file changes when that is chosen.
 */

const CANDIDATES = [
  process.env["SOFFICE_PATH"],
  "/opt/homebrew/bin/soffice",
  "/usr/local/bin/soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
].filter(Boolean) as string[];

export class PdfPreviewUnavailable extends Error {}

/*
 * Speed. Starting LibreOffice with a brand-new settings folder took ~4.5s a
 * page view; keeping one folder brings it to ~1.7s (measured 29 Sep 2026). One
 * folder cannot be used by two conversions at once, so they queue - and a PDF
 * already made for the exact same filled file is handed back from memory.
 */
const cache = new Map<string, Uint8Array>();
const CACHE_MAX = 40;
let queue: Promise<unknown> = Promise.resolve();

async function fingerprint(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function docxToPdf(docx: Uint8Array): Promise<Uint8Array> {
  const key = await fingerprint(docx);
  const hit = cache.get(key);
  if (hit) return hit;
  const run = queue.then(() => convert(docx));
  queue = run.catch(() => {});
  const pdf = await run;
  cache.set(key, pdf);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return pdf;
}

async function convert(docx: Uint8Array): Promise<Uint8Array> {
  let fs: typeof import("node:fs/promises");
  let path: typeof import("node:path");
  let os: typeof import("node:os");
  let cp: typeof import("node:child_process");
  try {
    [fs, path, os, cp] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
      import("node:os"),
      import("node:child_process"),
    ]);
  } catch {
    throw new PdfPreviewUnavailable("The exact PDF preview is not set up on this server yet.");
  }

  let soffice = "";
  for (const c of CANDIDATES) {
    try {
      await fs.access(c);
      soffice = c;
      break;
    } catch {
      // try the next place it is usually installed
    }
  }
  if (!soffice) {
    throw new PdfPreviewUnavailable("The exact PDF preview needs LibreOffice, which this server does not have.");
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brachtia-pdf-"));
  try {
    const input = path.join(dir, "document.docx");
    await fs.writeFile(input, docx);
    // one settings folder kept between runs - the queue keeps it to one at a time
    const profile = `file://${path.join(os.tmpdir(), "brachtia-libreoffice-profile")}`;
    await new Promise<void>((resolve, reject) => {
      cp.execFile(
        soffice,
        [`-env:UserInstallation=${profile}`, "--headless", "--convert-to", "pdf", "--outdir", dir, input],
        { timeout: 60_000 },
        (err) => (err ? reject(new Error("The PDF could not be made from this document.")) : resolve()),
      );
    });
    return new Uint8Array(await fs.readFile(path.join(dir, "document.pdf")));
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
