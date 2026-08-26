import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import type { Property, RoomType } from "@/data/properties";
import { rowToProperty, rowToRoomType } from "@/lib/site-mappers";

export type SiteData = { properties: Property[]; roomTypes: RoomType[] };

export const fetchSiteData = createServerFn({ method: "GET" }).handler(async (): Promise<SiteData> => {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const [{ data: residences, error: rErr }, { data: rooms, error: roomErr }] = await Promise.all([
    supabase.from("residences").select("*").eq("published", true).order("sort_order"),
    supabase.from("room_types").select("*").order("sort_order"),
  ]);

  if (rErr || roomErr || !residences) {
    console.error("site data load failed", rErr ?? roomErr);
    return { properties: [], roomTypes: [] };
  }

  const byId = new Map<string, string>();
  const props = residences.map((row) => {
    byId.set(row.id as string, row.slug as string);
    return rowToProperty(row);
  });

  const roomTypes = (rooms ?? [])
    .map((row) => rowToRoomType(row, byId.get(row.residence_id as string) ?? ""))
    .filter((r) => r.propertySlug);

  return { properties: props, roomTypes };
});
