import { supabase } from "@/integrations/supabase/client";

const BUCKET = "residence-photos";

function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > -1 ? name.slice(dot + 1).toLowerCase() : "jpg";
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${Date.now().toString(36)}-${base || "photo"}.${ext}`;
}

/** Uploads an image and returns the URL to store in the database. */
export async function uploadPhoto(file: File, folder: string): Promise<string> {
  const path = `${folder}/${safeName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  return `/api/public/photo/${path}`;
}
