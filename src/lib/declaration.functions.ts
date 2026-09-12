import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import {
  DECLARATION_TERMS,
  DECLARATION_VERSION,
  declarationBody,
  nameMatches,
} from "@/lib/declaration";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Signing the declaration.
 *
 * A signature is an event, not a field: it is written once, never updated, and
 * carries the evidence that makes it worth something - which version, which
 * token, which device, and when. Nothing here trusts the browser: the student
 * sends only their ticks and their typed name, and the server decides whether
 * that amounts to a signature.
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function sha256(text: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * The version row for the wording this build ships, created the first time it
 * is needed.
 *
 * If a row already exists for this version but its text has changed, the hash
 * no longer matches and nothing is signed. That is the point: a wording people
 * have already agreed to must not be quietly rewritten underneath them. It is
 * a new version or it is nothing.
 */
async function currentVersion(supabase: any) {
  const body = declarationBody();
  const hash = await sha256(body);

  const { data: existing } = await supabase
    .from("declaration_versions")
    .select("id, body_sha256")
    .eq("version", DECLARATION_VERSION)
    .maybeSingle();

  if (existing) {
    if (existing.body_sha256 !== hash) {
      return {
        error:
          "The declaration wording has changed since this version was published. It needs a new version number before anyone can sign it." as const,
      };
    }
    return { id: existing.id as string, body, hash };
  }

  const { data: made, error } = await supabase
    .from("declaration_versions")
    .insert({ version: DECLARATION_VERSION, body, body_sha256: hash } as any)
    .select("id")
    .single();
  if (error) return { error: error.message as string };
  return { id: made.id as string, body, hash };
}

async function residentForToken(supabase: any, token: string) {
  const { data: link } = await supabase
    .from("profile_links")
    .select("id, resident_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!link) return { error: "This link is not valid." as const };
  if (link.revoked_at) return { error: "This link has been turned off." as const };
  if (new Date(link.expires_at).getTime() < Date.now())
    return { error: "This link has expired. Ask Brachtia for a new one." as const };
  return { link };
}

export type SignedDeclaration = {
  version: string;
  signedName: string;
  signedIdNumber: string;
  signedAt: string;
  body: string;
};

/** What the student has already signed, if anything. */
export const getDeclarationByToken = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const found = await residentForToken(supabase, data.token);
    if ("error" in found) return { ok: false as const, error: found.error };

    const { data: row } = await supabase
      .from("resident_declarations")
      .select("signed_name, signed_id_number, signed_at, declaration_versions(version, body)")
      .eq("resident_id", found.link.resident_id)
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) return { ok: true as const, signed: null };
    return {
      ok: true as const,
      signed: {
        version: String(row.declaration_versions?.version ?? ""),
        signedName: String(row.signed_name ?? ""),
        signedIdNumber: String(row.signed_id_number ?? ""),
        signedAt: String(row.signed_at ?? ""),
        body: String(row.declaration_versions?.body ?? ""),
      } satisfies SignedDeclaration,
    };
  });

export const signDeclarationByToken = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      token: string;
      signedName: string;
      agreedTerms: Record<string, boolean>;
      scrolledToEnd: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const found = await residentForToken(supabase, data.token);
    if ("error" in found) return { ok: false as const, error: found.error };

    const { data: resident } = await supabase
      .from("residents")
      .select("id, full_name, id_number")
      .eq("id", found.link.resident_id)
      .single();
    if (!resident) return { ok: false as const, error: "Resident not found." };

    // every term is ticked on its own - one tick for thirteen terms got ticked
    // without reading. whatever the browser sends is recorded, but the server
    // decides whether it amounts to a signature
    const unticked = DECLARATION_TERMS.findIndex((_, i) => !data.agreedTerms?.[`term_${i + 1}`]);
    if (unticked !== -1) {
      return {
        ok: false as const,
        error: `Please tick term ${unticked + 1} to confirm you have read it before signing.`,
      };
    }

    // the typed name is checked against the name on file, because that
    // comparison is the security here - not the look of the signature
    if (!nameMatches(data.signedName, String(resident.full_name ?? ""))) {
      return {
        ok: false as const,
        error: `This does not match the name we hold (${resident.full_name}). Correct it above if the name is wrong.`,
      };
    }

    const version = await currentVersion(supabase);
    if ("error" in version) return { ok: false as const, error: version.error };

    const req = getRequest();
    const headers = req?.headers;
    const ip =
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers?.get("x-real-ip") ?? "";

    const { error } = await supabase.from("resident_declarations").insert({
      resident_id: resident.id,
      version_id: version.id,
      signed_name: data.signedName.trim(),
      signed_id_number: String(resident.id_number ?? ""),
      agreed_terms: data.agreedTerms ?? {},
      scrolled_to_end: !!data.scrolledToEnd,
      signed_ip: ip,
      signed_user_agent: headers?.get("user-agent") ?? "",
      profile_link_id: found.link.id,
    } as any);

    // signing twice is a double click, not a second signature
    if (error && !/duplicate key/i.test(error.message)) {
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });

/** For the admin Tenancy tab: has this resident signed, and which version. */
export const getDeclarationForResident = createServerFn({ method: "GET" })
  .inputValidator((data: { residentId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { data: row } = await supabase
      .from("resident_declarations")
      .select("signed_name, signed_at, scrolled_to_end, declaration_versions(version)")
      .eq("resident_id", data.residentId)
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return { signed: null };
    return {
      signed: {
        version: String(row.declaration_versions?.version ?? ""),
        signedName: String(row.signed_name ?? ""),
        signedAt: String(row.signed_at ?? ""),
        readToEnd: !!row.scrolled_to_end,
      },
    };
  });
