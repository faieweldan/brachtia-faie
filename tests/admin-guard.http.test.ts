import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { toJSON } from "seroval";

/*
 * Admin server security against a running server (Phase 1, 13 Oct 2026).
 * Calls server functions over HTTP the way a script outside the app would -
 * no page, no hidden buttons - and checks what the server answers.
 *
 * Skipped unless ADMIN_GUARD_URL is set. Only read-only functions are called,
 * with ids that match nothing, so even a broken guard changes no data.
 *
 *   ADMIN_GUARD_URL=http://localhost:8081 bun --env-file=.env test tests/admin-guard.http.test.ts
 *   ADMIN_GUARD_URL=https://<staging>.vercel.app ADMIN_GUARD_IDS=build bun test tests/admin-guard.http.test.ts
 *
 * The admin half runs on localhost only, with the local test passcode.
 */
const BASE = (process.env["ADMIN_GUARD_URL"] ?? "").replace(/\/$/, "");
const IDS =
  process.env["ADMIN_GUARD_IDS"] ?? (/localhost|127\.0\.0\.1/.test(BASE) ? "dev" : "build");
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
const NONE = "00000000-0000-4000-8000-000000000000";

/** the id TanStack Start gives a server function: readable in dev, a hash in a build */
function fnId(file: string, name: string) {
  const exp = `${name}_createServerFn_handler`;
  if (IDS === "dev")
    return Buffer.from(
      JSON.stringify({ file: `/${file}?tss-serverfn-split`, export: exp }),
    ).toString("base64url");
  return createHash("sha256").update(`${file}--${exp}`).digest("hex");
}

// the dev server knows a module's server functions only once a browser has loaded it
const loaded = new Set<string>();

async function call(
  file: string,
  name: string,
  o: { method?: "GET" | "POST"; data?: unknown; cookie?: string; auth?: string } = {},
) {
  if (IDS === "dev" && !loaded.has(file)) {
    await fetch(`${BASE}/${file}`).then((r) => r.text());
    loaded.add(file);
  }
  const method = o.method ?? "GET";
  let url = `${BASE}/_serverFn/${fnId(file, name)}`;
  const body = o.data === undefined ? undefined : JSON.stringify(toJSON({ data: o.data }));
  if (method === "GET" && body) url += `?payload=${encodeURIComponent(body)}`;
  const headers: Record<string, string> = {
    "x-tsr-serverFn": "true",
    accept: "application/json",
    origin: BASE,
  };
  if (method === "POST") headers["content-type"] = "application/json";
  if (o.cookie) headers["cookie"] = o.cookie;
  if (o.auth) headers["authorization"] = o.auth;
  const started = performance.now();
  const res = await fetch(url, { method, headers, ...(method === "POST" && body ? { body } : {}) });
  const text = await res.text();
  return {
    status: res.status,
    text,
    ms: Math.round(performance.now() - started),
    cookie: res.headers.get("set-cookie") ?? "",
  };
}

/** read-only admin functions, one or more per file that was open before Phase 1 */
const PROBES: { file: string; name: string; data?: unknown; leak: RegExp }[] = [
  { file: "src/lib/admin.functions.ts", name: "listResidences", leak: /"slug"|"name"/ },
  { file: "src/lib/admin.functions.ts", name: "listEnquiries", leak: /"reference"|"full_name"/ },
  { file: "src/lib/homes.functions.ts", name: "listUnits", leak: /"unitNo"|"rooms"/ },
  {
    file: "src/lib/residents.functions.ts",
    name: "listResidents",
    leak: /"fullName"|"quickbooksId"/,
  },
  {
    file: "src/lib/rental-schedule.functions.ts",
    name: "tenancyDatesByResident",
    leak: /"start"|"end"/,
  },
  {
    file: "src/lib/tenancy-docs.functions.ts",
    name: "getTenancyDocs",
    data: { residentId: NONE },
    leak: /"agreements"/,
  },
  {
    file: "src/lib/declaration.functions.ts",
    name: "getDeclarationForResident",
    data: { residentId: NONE },
    leak: /"signed"|"declaration"/,
  },
  {
    file: "src/lib/booking-activity.functions.ts",
    name: "getBookingActivity",
    data: { enquiryId: NONE },
    leak: /"kind"|"summary"/,
  },
  {
    file: "src/lib/document-versions.functions.ts",
    name: "listQuoteVersions",
    data: { enquiryId: NONE },
    leak: /"version"/,
  },
];

const refused = (r: { text: string }, leak: RegExp) =>
  /Unauthorized/.test(r.text) && !leak.test(r.text);

describe.skipIf(!BASE)(
  `admin server functions over HTTP (${BASE || "skipped"}, ${IDS} ids)`,
  () => {
    test("the request format is right: a public function answers", async () => {
      const r = await call("src/lib/site-data.functions.ts", "fetchSiteData");
      expect(r.status).toBe(200);
      expect(r.text).not.toContain("Unauthorized");
    });

    test("anonymous callers are refused by every probed admin function", async () => {
      const open: string[] = [];
      for (const p of PROBES) {
        const r = await call(p.file, p.name, { data: p.data });
        if (!refused(r, p.leak)) open.push(`${p.name}: ${r.status} ${r.text.slice(0, 80)}`);
      }
      expect(open).toEqual([]);
    });

    test("a resident is refused: a profile/signing token, a bearer token or a forged admin cookie is not an admin session", async () => {
      // a real resident's link token, read from the test database without opening it (opening stamps opened_at)
      let token = "resident-token-without-a-database";
      const url = process.env["SUPABASE_URL"] ?? "";
      if (url.includes("zyuadtrqcgocottxyzpk") && process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
          auth: { persistSession: false },
        });
        const { data } = await sb
          .from("profile_links")
          .select("token")
          .is("revoked_at", null)
          .limit(1)
          .maybeSingle();
        if (data?.token) token = String(data.token);
      }
      const open: string[] = [];
      for (const p of PROBES) {
        for (const as of [
          { data: { ...(p.data as object), token }, auth: `Bearer ${token}` },
          { data: p.data, cookie: "brachtia-admin=forged-value" },
        ]) {
          const r = await call(p.file, p.name, as);
          if (!refused(r, p.leak)) open.push(`${p.name}: ${r.status} ${r.text.slice(0, 80)}`);
        }
      }
      expect(open).toEqual([]);
    });

    test.skipIf(!LOCAL || !process.env["ADMIN_PASSCODE"])(
      "an unlocked admin still gets every probed function (localhost only)",
      async () => {
        const unlock = await call("src/lib/admin-gate.functions.ts", "unlockAdmin", {
          method: "POST",
          data: { passcode: process.env["ADMIN_PASSCODE"] },
        });
        const cookie = unlock.cookie.split(";")[0] ?? "";
        expect(cookie.startsWith("brachtia-admin=")).toBe(true);
        const failed: string[] = [];
        for (const p of PROBES) {
          const r = await call(p.file, p.name, { data: p.data, cookie });
          if (r.status !== 200 || /Unauthorized/.test(r.text))
            failed.push(`${p.name}: ${r.status} ${r.text.slice(0, 80)}`);
        }
        expect(failed).toEqual([]);
      },
    );
  },
);
