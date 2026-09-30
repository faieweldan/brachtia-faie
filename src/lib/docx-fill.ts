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

import { pngSize } from "@/lib/signatory";

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
 *
 * A value found in `images` - a signature token - becomes that picture, set
 * inline where the placeholder stood, at most 0.55in tall (30 Sep 2026).
 */
export async function fillDocx(
  bytes: Uint8Array | ArrayBuffer,
  values: Record<string, string | null>,
  images: Record<string, Uint8Array> = {},
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  // a picture's value is first written as a marker, then the marker is
  // swapped for the picture - the text filling stays exactly as it was
  const marker = (i: number) => `\u2063IMG${i}\u2063`;
  const tokens = Object.keys(images);
  const valueFor = (key: string) => {
    if (!(key in values)) return null;
    const v = values[key]!;
    const i = v === null ? -1 : tokens.indexOf(v.trim());
    return i >= 0 ? marker(i) : v;
  };
  let pic = 0;
  for (const name of Object.keys(zip.files).filter(isTextPart)) {
    const xml = await zip.file(name)!.async("string");
    let filled = fillXml(xml, valueFor);
    if (tokens.length && filled.includes("\u2063IMG")) filled = await placeImages(zip, name, filled, tokens.map((t) => images[t]!), () => ++pic);
    if (filled !== xml) zip.file(name, filled);
  }
  return zip.generateAsync({ type: "uint8array" });
}

const EMU_PER_INCH = 914400;

/** Swap each picture marker in one part for an inline picture. */
async function placeImages(zip: JSZip, part: string, xml: string, pngs: Uint8Array[], nextId: () => number) {
  const relsName = part.replace(/^word\//, "word/_rels/") + ".rels";
  let rels =
    (await zip.file(relsName)?.async("string")) ??
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const relFor = new Map<number, string>();
  const out = xml.replace(/(<w:t(?:\s[^>]*)?>)([^<]*?)\u2063IMG(\d+)\u2063([^<]*)<\/w:t>/g, (_m, open: string, before: string, n: string, after: string) => {
    const i = Number(n);
    const png = pngs[i]!;
    if (!relFor.has(i)) {
      const id = nextId();
      const target = `media/signature_${id}.png`;
      zip.file(`word/${target}`, png);
      const rId = `rIdSig${id}`;
      rels = rels.replace("</Relationships>", `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/></Relationships>`);
      relFor.set(i, rId);
    }
    const { w, h } = pngSize(png);
    // 0.55in tall, or narrower if the picture is wide - never over 2.2in
    let cy = Math.round(0.55 * EMU_PER_INCH);
    let cx = Math.round((cy * w) / Math.max(1, h));
    const maxX = Math.round(2.2 * EMU_PER_INCH);
    if (cx > maxX) {
      cy = Math.round((cy * maxX) / cx);
      cx = maxX;
    }
    const id = nextId();
    const drawing =
      `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${9000 + id}" name="Signature ${id}"/>` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${relFor.get(i)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing>`;
    const text = (t: string) => (t ? `${open.includes("xml:space") ? open : open.replace(/^<w:t/, '<w:t xml:space="preserve"')}${t}</w:t>` : "");
    return text(before) + drawing + text(after);
  });
  zip.file(relsName, rels);
  // the picture's namespaces, declared on the part's root when missing
  let fixed = out;
  const root = fixed.match(/<w:(document|hdr|ftr)\b[^>]*>/);
  if (root) {
    let tag = root[0];
    if (!/xmlns:wp=/.test(tag)) tag = tag.replace(/>$/, ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">');
    if (!/xmlns:r=/.test(tag)) tag = tag.replace(/>$/, ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
    fixed = fixed.replace(root[0], tag);
  }
  // PNG must be a known type in the package
  const types = await zip.file("[Content_Types].xml")!.async("string");
  if (!/Extension="png"/i.test(types)) zip.file("[Content_Types].xml", types.replace("<Types ", "<Types ").replace(/(<Types[^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>'));
  return fixed;
}
