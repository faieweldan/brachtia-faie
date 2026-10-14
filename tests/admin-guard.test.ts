import { describe, expect, mock, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * Admin server security (Phase 1, 13 Oct 2026). Every admin server function
 * gets its service-role client through the admin session check on the server
 * (adminDb / requireAdminSession in src/lib/admin-session.server.ts). Hiding a
 * button is not security: the server function can be called without the page.
 */

// the session the request carries - set per test
let session: Record<string, unknown> = {};
let clientHandedOut = 0;
mock.module("@tanstack/react-start/server", () => ({
  useSession: async () => ({ data: session }),
}));
mock.module("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    clientHandedOut++;
    return { fake: "service-role client" };
  },
}));
process.env["ADMIN_SESSION_SECRET"] ??= "test-only-session-secret-not-real-000000";

const { adminDb, requireAdminSession, isAdminSession } =
  await import("../src/lib/admin-session.server");

describe("the admin guard", () => {
  test("an anonymous caller (no admin cookie) is refused, and never gets the client", async () => {
    session = {};
    clientHandedOut = 0;
    await expect(adminDb()).rejects.toThrow("Unauthorized");
    await expect(requireAdminSession()).rejects.toThrow("Unauthorized");
    expect(clientHandedOut).toBe(0);
  });

  test("a resident is refused: their token link never unlocks the admin session", async () => {
    // what a resident's request can carry - a profile or signing token - is not an admin session
    for (const s of [
      { token: "a-valid-profile-token" },
      { residentId: "r1" },
      { unlocked: false },
      { unlocked: "true" },
      { unlocked: 1 },
    ]) {
      session = s;
      clientHandedOut = 0;
      await expect(adminDb()).rejects.toThrow("Unauthorized");
      expect(clientHandedOut).toBe(0);
    }
  });

  test("an unlocked admin gets the client", async () => {
    session = { unlocked: true };
    clientHandedOut = 0;
    expect(await adminDb()).toEqual({ fake: "service-role client" });
    expect(clientHandedOut).toBe(1);
    expect(isAdminSession({ unlocked: true })).toBe(true);
    expect(isAdminSession(undefined)).toBe(false);
  });
});

/*
 * Every server function either goes through the guard, or is on this list of
 * functions that are public on purpose - each checks its own token, or serves
 * the public website. A new admin function that skips the guard fails here.
 */
const PUBLIC: Record<string, string> = {
  // the student's links: each finds the resident by their token first
  "signing.functions.ts": "signing link token",
  "profile-link.functions.ts:getProfileByToken": "profile link token",
  "profile-link.functions.ts:submitProfileByToken": "profile link token",
  "profile-link.functions.ts:uploadDocumentByToken": "profile link token",
  "declaration.functions.ts:getDeclarationByToken": "profile link token",
  "declaration.functions.ts:signDeclarationByToken": "profile link token",
  "checkout.functions.ts:getResidentCheckout": "signing link token",
  "checkout.functions.ts:signCheckout": "signing link token",
  // the public website: enquiry form, viewing booking and viewing link
  "public.functions.ts": "public website",
  "site-data.functions.ts": "public website",
  // the passcode screen itself
  "admin-gate.functions.ts": "admin unlock",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.functions\.ts$/.test(n) ? [p] : [];
  });
}

/** each exported server function's own source, up to the next top-level export */
function serverFns(src: string) {
  return src
    .split(/(?=^export (?:const|async function|function|type|class) )/m)
    .map((part) => ({ name: part.match(/^export const (\w+) = createServerFn/)?.[1], body: part }))
    .filter((p): p is { name: string; body: string } => !!p.name);
}

describe("every admin server function checks the admin session on the server", () => {
  const found: string[] = [];
  const open: string[] = [];
  for (const f of files("src/lib")) {
    const src = readFileSync(f, "utf8");
    const base = f.split("/").pop()!;
    // the file's admin() helper, if it has one, must itself be guarded
    const helper = src.match(/async function admin\(\)[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const helperGuarded = /adminDb\(|requireAdminSession\(/.test(helper);
    for (const fn of serverFns(src)) {
      found.push(`${base}:${fn.name}`);
      if (PUBLIC[base] || PUBLIC[`${base}:${fn.name}`]) continue;
      const guarded =
        /adminDb\(|requireAdminSession\(/.test(fn.body) ||
        (helperGuarded && /await admin\(\)/.test(fn.body));
      if (!guarded) open.push(`${base}:${fn.name}`);
    }
  }

  test("the scan sees the server functions", () => {
    expect(found.length).toBeGreaterThan(150);
  });

  test("none is left open", () => {
    expect(open).toEqual([]);
  });

  test("every public exception still exists - a stale entry would hide a renamed function", () => {
    for (const key of Object.keys(PUBLIC)) {
      if (!key.includes(":")) continue;
      expect(found).toContain(key);
    }
  });
});
