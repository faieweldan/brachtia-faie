import { uploadResidencePhoto } from "@/lib/upload.functions";

/** Uploads an image through the admin-only server upload and returns the URL to store. */
export async function uploadPhoto(file: File, folder: string): Promise<string> {
  const form = new FormData();
  form.set("file", file);
  form.set("folder", folder);
  const res = await uploadResidencePhoto({ data: form });
  return res.url;
}
