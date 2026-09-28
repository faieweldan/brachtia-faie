const GATEWAY = "https://connector-gateway.lovable.dev";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function credentials(connector: "google_docs" | "google_drive") {
  const lovable = process.env["LOVABLE_API_KEY"];
  const connection = process.env[connector === "google_docs" ? "GOOGLE_DOCS_API_KEY" : "GOOGLE_DRIVE_API_KEY"];
  if (!lovable || !connection) throw new Error("Google Docs and Google Drive must be connected first");
  return { lovable, connection };
}

async function googleFetch(connector: "google_docs" | "google_drive", path: string, init: RequestInit = {}) {
  const { lovable, connection } = credentials(connector);
  const response = await fetch(`${GATEWAY}/${connector}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": connection,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(`Google ${connector} request failed [${response.status}]: ${body}`);
    throw new Error(`Google request failed [${response.status}]: ${body}`);
  }
  return response;
}

export function googleDocumentId(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  throw new Error("Enter a valid Google Docs link");
}

function allText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.map(allText).join("");
  const record = value as Record<string, unknown>;
  const own = typeof record["content"] === "string" ? record["content"] : "";
  return own + Object.entries(record).filter(([key]) => key !== "content").map(([, child]) => allText(child)).join("");
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_][a-zA-Z0-9_ \-]*?)\s*\}\}/g;

export async function inspectGoogleDocument(documentId: string) {
  const response = await googleFetch("google_docs", `/v1/documents/${encodeURIComponent(documentId)}?includeTabsContent=true`);
  const document = await response.json() as Record<string, unknown>;
  const placeholders = new Set<string>();
  for (const match of allText(document).matchAll(PLACEHOLDER)) if (match[1]) placeholders.add(match[1]);
  return { title: String(document["title"] ?? "Google document"), placeholders: [...placeholders] };
}

function concatBytes(parts: (string | Uint8Array)[]) {
  const encoder = new TextEncoder();
  const arrays = parts.map((part) => typeof part === "string" ? encoder.encode(part) : part);
  const output = new Uint8Array(arrays.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of arrays) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

export async function importWordAsGoogleDocument(bytes: Uint8Array, name: string) {
  const boundary = `brachtia-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: name.replace(/\.docx$/i, ""), mimeType: "application/vnd.google-apps.document" });
  const body = concatBytes([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${DOCX_MIME}\r\n\r\n`, bytes, `\r\n--${boundary}--`,
  ]);
  const response = await googleFetch("google_drive", "/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Google Drive did not return an imported document ID");
  return result.id;
}

export async function copyGoogleDocument(documentId: string, name: string) {
  const response = await googleFetch("google_drive", `/drive/v3/files/${encodeURIComponent(documentId)}/copy?fields=id`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
  });
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Google Drive did not return a copy ID");
  return result.id;
}

export async function replaceGooglePlaceholders(documentId: string, values: Record<string, string>) {
  const requests = Object.entries(values).map(([key, value]) => ({ replaceAllText: { containsText: { text: `{{${key}}}`, matchCase: true }, replaceText: value } }));
  if (!requests.length) return;
  await googleFetch("google_docs", `/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requests }),
  });
}

export async function exportGoogleDocument(documentId: string, type: "pdf" | "docx") {
  const mime = type === "pdf" ? "application/pdf" : DOCX_MIME;
  const response = await googleFetch("google_drive", `/drive/v3/files/${encodeURIComponent(documentId)}/export?mimeType=${encodeURIComponent(mime)}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function deleteGoogleDocument(documentId: string) {
  try { await googleFetch("google_drive", `/drive/v3/files/${encodeURIComponent(documentId)}`, { method: "DELETE" }); }
  catch (error) { console.error("Could not remove temporary Google document", error); }
}

export async function renderGoogleDocument(sourceId: string, values: Record<string, string>, name: string) {
  const copyId = await copyGoogleDocument(sourceId, name);
  try {
    await replaceGooglePlaceholders(copyId, values);
    const [pdf, docx] = await Promise.all([exportGoogleDocument(copyId, "pdf"), exportGoogleDocument(copyId, "docx")]);
    return { pdf, docx };
  } finally {
    await deleteGoogleDocument(copyId);
  }
}

export const exportGooglePreview = (sourceId: string) => exportGoogleDocument(sourceId, "pdf");