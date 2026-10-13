import { useSession } from "@tanstack/react-start/server";

type AdminSession = { unlocked?: boolean };

function sessionConfig() {
  const isProd = process.env["NODE_ENV"] === "production";
  const password = process.env["ADMIN_SESSION_SECRET"];
  if (!password) throw new Error("ADMIN_SESSION_SECRET is not set");
  return {
    password,
    name: "brachtia-admin",
    maxAge: 60 * 60 * 24 * 7,
    // a "secure" cookie is rejected over plain http, so local dev could never
    // hold a session; sameSite must relax with it since "none" requires secure
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? "none" : "lax") as "none" | "lax",
      path: "/",
    },
  };
}

/** Only an unlocked admin session counts - a resident's token link never sets one. */
export const isAdminSession = (data: AdminSession | undefined | null) => data?.unlocked === true;

/** Throws unless the caller holds an unlocked admin session cookie. */
export async function requireAdminSession() {
  const session = await useSession<AdminSession>(sessionConfig());
  if (!isAdminSession(session.data)) {
    throw new Error("Unauthorized");
  }
}

/**
 * The service-role database client, for an admin only (13 Oct 2026). Every
 * admin server function gets its client here, so none can reach the database
 * without the admin session being checked on the server first. Token links
 * (signing, profile, declaration, checkout) check their own token instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the callers' tables are not all in the generated types yet
export async function adminDb(): Promise<any> {
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
