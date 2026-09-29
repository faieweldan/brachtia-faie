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

export async function docxToPdf(docx: Uint8Array): Promise<Uint8Array> {
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
    // a profile of its own, so two previews at once do not fight over one
    const profile = `file://${path.join(dir, "profile")}`;
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
