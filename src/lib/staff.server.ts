/* eslint-disable @typescript-eslint/no-explicit-any */
import { FIRST_STAFF, sameName, type StaffMember } from "@/lib/staff";
import { isSignatureToken, type Signatory } from "@/lib/signatory";

/*
 * Kept in the private template bucket beside the signatures, like the
 * signatory was, so nothing has to be run on either database first (4 Nov
 * 2026): staff/list.json is the list; each signature is a picture under
 * signatory/<hash>.png, never overwritten (signatory.server.ts).
 */
const BUCKET = "document-templates";
const LIST = "staff/list.json";

/**
 * The staff list. Before anything is saved in Settings → Staff it is the team
 * as it was (FIRST_STAFF), with the one signatory's signature and title on the
 * person of that name - so nobody has to sign again.
 */
export async function loadStaff(db: any): Promise<StaffMember[]> {
  const { data: file } = await db.storage.from(BUCKET).download(LIST, { cacheNonce: Date.now() });
  if (file) {
    try {
      const j = JSON.parse(await file.text());
      return ((j.staff ?? []) as any[]).map((s) => ({
        name: String(s.name ?? ""),
        title: String(s.title ?? ""),
        token: isSignatureToken(s.token) ? String(s.token).trim() : "",
        active: s.active !== false,
      }));
    } catch {
      throw new Error("The staff list could not be read. Open Settings → Staff and save it again.");
    }
  }
  const { loadSignatory } = await import("@/lib/signatory.server");
  const old = await loadSignatory(db);
  return FIRST_STAFF.map((name) => {
    const theirs = old && sameName(old.name, name);
    return { name, title: theirs ? old.title : "", token: theirs ? old.token : "", active: true };
  });
}

export async function saveStaffFile(db: any, staff: StaffMember[]) {
  const body = new Blob([JSON.stringify({ staff, savedAt: new Date().toISOString() })], { type: "application/json" });
  const { error } = await db.storage.from(BUCKET).upload(LIST, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(`Could not save the staff list: ${error.message}`);
}

/** Refused unless the name is someone working here now - every "who did this" a server function is sent. */
export async function requireStaff(db: any, name: unknown, message: string): Promise<string> {
  const n = String(name ?? "");
  if (!n || !(await loadStaff(db)).some((s) => s.active && s.name === n)) throw new Error(message);
  return n;
}

/**
 * The person who signs, with their signature - refused, saying whose
 * signature is missing, when they have none yet.
 */
export async function requireSigner(db: any, name: string): Promise<Signatory> {
  const s = (await loadStaff(db)).find((m) => m.name === name);
  if (!s) throw new Error(`${name || "Nobody"} is not on the staff list in Settings → Staff.`);
  if (!s.token) throw new Error(`Save ${s.name}'s signature in Settings → Staff first.`);
  return { name: s.name, title: s.title, token: s.token };
}

/** The person who signs, as far as they are set up - for previews, which show a gap rather than refuse. */
export async function signerFor(db: any, name: string | undefined): Promise<Signatory | null> {
  if (!name) return null;
  const s = (await loadStaff(db)).find((m) => m.name === name);
  return s ? { name: s.name, title: s.title, token: s.token } : null;
}
