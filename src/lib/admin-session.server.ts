import { useSession } from "@tanstack/react-start/server";

type AdminSession = { unlocked?: boolean };

function sessionConfig() {
  const password = process.env["ADMIN_SESSION_SECRET"];
  if (!password) throw new Error("ADMIN_SESSION_SECRET is not set");
  return {
    password,
    name: "brachtia-admin",
    maxAge: 60 * 60 * 24 * 7,
    cookie: { httpOnly: true, secure: true, sameSite: "none" as const, path: "/" },
  };
}

/** Throws unless the caller holds an unlocked admin session cookie. */
export async function requireAdminSession() {
  const session = await useSession<AdminSession>(sessionConfig());
  if (session.data.unlocked !== true) {
    throw new Error("Unauthorized");
  }
}
