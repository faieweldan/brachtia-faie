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

/** Throws unless the caller holds an unlocked admin session cookie. */
export async function requireAdminSession() {
  const session = await useSession<AdminSession>(sessionConfig());
  if (session.data.unlocked !== true) {
    throw new Error("Unauthorized");
  }
}
