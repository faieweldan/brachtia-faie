import { createServerFn } from "@tanstack/react-start";

const BUCKET = "residence-photos";
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

function safeSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, 60);
}

function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = (dot > -1 ? name.slice(dot + 1) : "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${Date.now().toString(36)}-${base || "photo"}.${ext}`;
}

/** Admin-only photo upload. Storage is private; files are served via /api/public/photo. */
export const uploadResidencePhoto = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const { requireAdminSession } = await import("@/lib/admin-session.server");
    await requireAdminSession();

    const file = data.get("file");
    const folder = safeSegment(String(data.get("folder") ?? "misc")) || "misc";
    if (!(file instanceof File)) throw new Error("No file provided");
    if (file.size > MAX_BYTES) throw new Error("File is larger than 15MB");
    if (file.type && !ALLOWED.includes(file.type)) throw new Error("Unsupported image type");

    const path = `${folder}/${safeName(file.name)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      ...(file.type ? { contentType: file.type } : {}),
    });
    if (error) throw new Error("Upload failed");
    return { url: `/api/public/photo/${path}` };
  });
