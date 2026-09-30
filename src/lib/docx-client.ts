/** Browser-side: turn an uploaded Word file into preview HTML. */
export async function docxToHtml(file: File): Promise<string> {
  // a PDF template (a scanned form) is shown as it is - there is no web copy
  if (isPdfFile(file.name)) return "";
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A template uploaded as a PDF - a scanned form - rather than a Word file. */
export const isPdfFile = (name: string) => /\.pdf$/i.test(name.trim());
