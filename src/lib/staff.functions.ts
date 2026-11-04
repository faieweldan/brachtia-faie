import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function admin(): Promise<any> {
  const { requireAdminSession } = await import("@/lib/admin-session.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const toBase64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** The staff list for the dropdowns: each name, whether they work here now, and whether they can sign yet. */
export const listStaff = createServerFn({ method: "GET" }).handler(async () => {
  const { loadStaff } = await import("@/lib/staff.server");
  return (await loadStaff(await admin())).map((s) => ({ name: s.name, title: s.title, active: s.active, hasSignature: !!s.token }));
});

/** Settings → Staff: the list with each signature as a picture. */
export const getStaffSettings = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { loadStaff } = await import("@/lib/staff.server");
  const { loadSignatureImage } = await import("@/lib/signatory.server");
  const list = await loadStaff(db);
  return Promise.all(
    list.map(async (s) => {
      const png = s.token ? await loadSignatureImage(db, s.token) : null;
      return { name: s.name, title: s.title, active: s.active, image: png ? `data:image/png;base64,${toBase64(png)}` : "" };
    }),
  );
});

/**
 * Add a person, or change one's title, signature or whether they work here.
 * `original` names who is being changed; without it, a new person is added. A
 * name is never changed - old records say it. A new signature is kept beside
 * the old ones, never over them: documents already made keep theirs.
 */
export const saveStaffMember = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        original: z.string().trim().max(80).optional(),
        name: z.string().trim().min(2, "Type the name").max(80),
        title: z.string().trim().max(120),
        active: z.boolean(),
        // a PNG, base64, under ~700 KB
        png: z.string().max(1_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { loadStaff, saveStaffFile } = await import("@/lib/staff.server");
    const { sameName } = await import("@/lib/staff");
    const list = await loadStaff(db);
    let token = "";
    if (data.png) {
      const bytes = Uint8Array.from(atob(data.png), (c) => c.charCodeAt(0));
      if (bytes[0] !== 0x89 || bytes[1] !== 0x50) throw new Error("The signature must be a PNG picture.");
      const { saveSignatureImage } = await import("@/lib/signatory.server");
      token = await saveSignatureImage(db, bytes);
    }
    if (data.original) {
      const i = list.findIndex((s) => s.name === data.original);
      if (i < 0) throw new Error(`${data.original} is no longer on the staff list - reload the page.`);
      const was = list[i]!;
      list[i] = { name: was.name, title: data.title, active: data.active, token: token || was.token };
    } else {
      if (list.some((s) => sameName(s.name, data.name))) throw new Error(`${data.name} is already on the staff list.`);
      list.push({ name: data.name, title: data.title, active: data.active, token });
    }
    await saveStaffFile(db, list);
    return { ok: true as const };
  });
