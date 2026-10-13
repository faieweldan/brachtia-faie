/**
 * A filled Word file as the PDF Word would print - the exact preview.
 *
 * docx-preview draws a .docx with web code and guesses what Word calculates:
 * page breaks, merged paragraph borders (signature lines), page numbers. Close,
 * never exact. A real Word-compatible engine lays it out the way it will print
 * and be signed, so the eye-icon preview uses one.
 *
 * The engine is LibreOffice. Vercel and Lovable cannot run programs, so there
 * it runs as a Gotenberg service (Cloud Run, Basic Auth) - decided 8 Oct 2026,
 * see docs/DOCUMENT-RENDERING-DECISION.md. With GOTENBERG_URL set the filled
 * file is sent there; without it, LibreOffice on this machine is used (a
 * laptop with LibreOffice installed). Only this file knows which.
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
  const gotenberg = gotenbergConfig();
  return gotenberg ? convertWithGotenberg(docx, gotenberg) : convertWithSoffice(docx);
}

/* ---------------- Gotenberg (deployed) ---------------- */

export type GotenbergConfig = { url: string; username?: string | undefined; password?: string | undefined };

/** GOTENBERG_URL turns the service on; the user name and password are optional. */
export function gotenbergConfig(env: Record<string, string | undefined> = process.env): GotenbergConfig | null {
  const url = env["GOTENBERG_URL"]?.trim();
  if (!url) return null;
  return { url: url.replace(/\/+$/, ""), username: env["GOTENBERG_USERNAME"], password: env["GOTENBERG_PASSWORD"] };
}

// a cold Cloud Run start plus LibreOffice can take a while; past this the page says try again
export const GOTENBERG_TIMEOUT_MS = 60_000;

/** A failure the page can show as it is. Never carries the password, the file or the reply body. */
export class PdfConversionFailed extends Error {}

/**
 * One filled .docx to Gotenberg's LibreOffice route, the PDF back.
 * Logs only the status - never the credentials, the resident's file or the PDF.
 */
export async function convertWithGotenberg(
  docx: Uint8Array,
  config: GotenbergConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = GOTENBERG_TIMEOUT_MS,
): Promise<Uint8Array> {
  const form = new FormData();
  form.append(
    "files",
    new Blob([docx as Uint8Array<ArrayBuffer>], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    "document.docx",
  );
  const headers: Record<string, string> = {};
  if (config.username || config.password) {
    headers["Authorization"] = `Basic ${btoa(`${config.username ?? ""}:${config.password ?? ""}`)}`;
  }

  let res: Response;
  try {
    res = await fetchImpl(`${config.url}/forms/libreoffice/convert`, {
      method: "POST",
      body: form,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.error(`[docx-to-pdf] Gotenberg ${timedOut ? "timed out" : "could not be reached"}`);
    throw new PdfConversionFailed(
      timedOut
        ? "The PDF took too long to make. Please try again in a moment."
        : "The PDF service could not be reached. Please try again in a moment.",
    );
  }

  if (res.status === 401 || res.status === 403) {
    console.error(`[docx-to-pdf] Gotenberg refused the login (${res.status})`);
    throw new PdfConversionFailed("The PDF service refused this server's login. Ask the admin to check its settings.");
  }
  if (!res.ok) {
    console.error(`[docx-to-pdf] Gotenberg answered ${res.status}`);
    throw new PdfConversionFailed("The PDF could not be made from this document.");
  }
  const pdf = new Uint8Array(await res.arrayBuffer());
  if (!isPdf(pdf)) {
    console.error("[docx-to-pdf] Gotenberg answered with something that is not a PDF");
    throw new PdfConversionFailed("The PDF service sent back something that is not a PDF.");
  }
  return pdf;
}

/** A PDF file starts with "%PDF-". */
export function isPdf(bytes: Uint8Array) {
  return bytes.length > 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
}

/* ---------------- LibreOffice on this machine (local) ---------------- */

async function convertWithSoffice(docx: Uint8Array): Promise<Uint8Array> {
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
