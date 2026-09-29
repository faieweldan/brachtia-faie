/**
 * Filling a Word template without rebuilding it.
 *
 * A .docx is a zip of XML files. The words sit in <w:t> text runs, and
 * everything else - fonts, table borders, shading, alignment, numbering,
 * headers, footers, page size, signature lines - sits around them. Turning the
 * file into a web page (what mammoth did) keeps the words and drops the rest,
 * which is why the preview looked nothing like the agreement.
 *
 * So the placeholders are filled where they stand, in the XML, and nothing
 * else is touched: {{Resident_full_name}} becomes "shantini" in the same run,
 * the same font, the same table cell.
 *
 * Word often splits one placeholder over several runs - "{{Resident_" in one,
 * "full_name}}" in the next - when part of it was retyped or spell-checked. So
 * each paragraph's runs are read as one string, the placeholder is found in
 * that, and the value goes into the run where it starts; the rest of the
 * placeholder is cleared from the runs it spilled into.
 */
import JSZip from "jszip";

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_][a-zA-Z0-9_ \-]*?)\s*\}\}/g;

/** The parts of a .docx that hold text a placeholder can sit in. */
const isTextPart = (name: string) =>
  name === "word/document.xml" || /^word\/(header|footer)\d*\.xml$/.test(name);

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&apos;",
  );

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const RUN_TEXT = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;

/** Fill every placeholder in one paragraph's XML. */
function fillParagraph(xml: string, valueFor: (key: string) => string | null): string {
  const runs: { start: number; end: number; open: string; text: string }[] = [];
  for (const m of xml.matchAll(RUN_TEXT)) {
    runs.push({
      start: m.index!,
      end: m.index! + m[0].length,
      open: m[1]!,
      text: unescapeXml(m[2]!),
    });
  }
  if (!runs.length) return xml;

  const joined = runs.map((r) => r.text).join("");
  if (!joined.includes("{{")) return xml;

  // where each run's text begins in the joined string
  const offsets: number[] = [];
  let at = 0;
  for (const r of runs) {
    offsets.push(at);
    at += r.text.length;
  }
  const runAt = (pos: number) => {
    let i = 0;
    while (i + 1 < runs.length && offsets[i + 1]! <= pos) i += 1;
    return i;
  };

  const texts = runs.map((r) => r.text);
  // right to left, so an earlier edit never shifts a later match
  const matches = [...joined.matchAll(PLACEHOLDER)].reverse();
  let changed = false;
  // the runs a value was written into or cleared from
  const filled = new Set<number>();
  for (const m of matches) {
    const value = valueFor(m[1]!.trim());
    if (value === null) continue; // not mapped: leave it showing
    const from = m.index!;
    const to = from + m[0].length; // exclusive
    const first = runAt(from);
    const last = runAt(to - 1);
    for (let i = first; i <= last; i += 1) filled.add(i);
    if (first === last) {
      const local = from - offsets[first]!;
      const t = texts[first]!;
      texts[first] = t.slice(0, local) + value + t.slice(local + m[0].length);
    } else {
      const startLocal = from - offsets[first]!;
      texts[first] = texts[first]!.slice(0, startLocal) + value;
      for (let i = first + 1; i < last; i += 1) texts[i] = "";
      const endLocal = to - offsets[last]!;
      texts[last] = texts[last]!.slice(endLocal);
    }
    changed = true;
  }
  if (!changed) return xml;

  // rebuild, right to left, keeping each run's own tag and attributes; a run
  // that now starts or ends with a space must say so, or Word trims it
  let out = xml;
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const r = runs[i]!;
    let open = r.open;
    if (/^\s|\s$/.test(texts[i]!) && !/xml:space=/.test(open)) {
      open = open.replace(/^<w:t/, '<w:t xml:space="preserve"');
    }
    out = out.slice(0, r.start) + open + escapeXml(texts[i]!) + "</w:t>" + out.slice(r.end);
    /*
     * The template marks its placeholders in yellow so they can be found while
     * it is written. A filled value is part of the agreement, not a note, so
     * the yellow comes off the run it now sits in - and only that run.
     */
    if (filled.has(i)) {
      // the <w:r> this text belongs to - "<w:r>" or "<w:r w:rsidR=...>"
      const runStart = Math.max(out.lastIndexOf("<w:r>", r.start), out.lastIndexOf("<w:r ", r.start));
      if (runStart !== -1) {
        const head = out.slice(runStart, r.start);
        const clean = head.replace(/<w:highlight\b[^>]*\/>/g, "").replace(/<w:shd\b[^>]*\/>/g, "");
        if (clean !== head) out = out.slice(0, runStart) + clean + out.slice(r.start);
      }
    }
  }
  return out;
}

/** Fill every paragraph in one XML part. */
export function fillXml(xml: string, valueFor: (key: string) => string | null): string {
  return xml.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, (p) => fillParagraph(p, valueFor));
}

/** Every placeholder in the body, headers and footers, in the order met. */
export async function docxPlaceholders(bytes: Uint8Array | ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const seen = new Set<string>();
  for (const name of Object.keys(zip.files).filter(isTextPart).sort()) {
    const xml = await zip.file(name)!.async("string");
    for (const p of xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []) {
      const text = [...p.matchAll(RUN_TEXT)].map((m) => unescapeXml(m[2]!)).join("");
      for (const m of text.matchAll(PLACEHOLDER)) seen.add(m[1]!.trim());
    }
  }
  return [...seen];
}

/**
 * The template with its placeholders filled. A key with no value (null) is
 * left as {{key}} so a gap shows rather than disappearing.
 */
export async function fillDocx(
  bytes: Uint8Array | ArrayBuffer,
  values: Record<string, string | null>,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const valueFor = (key: string) => (key in values ? values[key]! : null);
  for (const name of Object.keys(zip.files).filter(isTextPart)) {
    const xml = await zip.file(name)!.async("string");
    const filled = fillXml(xml, valueFor);
    if (filled !== xml) zip.file(name, filled);
  }
  return zip.generateAsync({ type: "uint8array" });
}
