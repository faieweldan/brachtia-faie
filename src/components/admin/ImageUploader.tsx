import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadPhoto } from "@/lib/upload";
import { resolveImage } from "@/data/properties";

export function previewSrc(value: string) {
  if (!value) return "";
  try {
    return resolveImage(value);
  } catch {
    return value;
  }
}

export function useUpload(folder: string) {
  const [busy, setBusy] = useState(false);
  const run = async (files: FileList | File[] | null, onDone: (urls: string[]) => void) => {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setBusy(true);
    try {
      const urls = await Promise.all(list.map((f) => uploadPhoto(f, folder)));
      onDone(urls);
      toast.success(urls.length > 1 ? `${urls.length} photos uploaded` : "Photo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Drop zone that accepts multiple images. */
export function DropZone({
  folder,
  onUploaded,
  label = "Drop photos here or click to upload",
}: {
  folder: string;
  onUploaded: (urls: string[]) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { busy, run } = useUpload(folder);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void run(e.dataTransfer.files, onUploaded);
      }}
      onClick={() => input.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-6 text-center transition ${
        over ? "border-brand-deep bg-brand-deep/5" : "border-border hover:border-brand-deep/40"
      }`}
    >
      {busy ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <ImagePlus className="size-5 text-muted-foreground" />
      )}
      <p className="text-xs text-muted-foreground">{busy ? "Uploading…" : label}</p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void run(e.target.files, onUploaded);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Single image field: preview tile + replace / remove / paste URL. */
export function ImageField({
  label,
  value,
  folder,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  folder: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [showUrl, setShowUrl] = useState(false);
  const { busy, run } = useUpload(folder);

  return (
    <div className={`space-y-2 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-start gap-3">
        <div className="relative size-28 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {value ? (
            <img src={previewSrc(value)} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ImagePlus className="size-5 text-muted-foreground" />
            </div>
          )}
          {busy ? (
            <div className="absolute inset-0 grid place-items-center bg-background/70">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>
              <Upload className="mr-1 size-3.5" /> {value ? "Replace" : "Upload"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowUrl((s) => !s)}>
              <Link2 className="mr-1 size-3.5" /> URL
            </Button>
            {value ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
                <Trash2 className="mr-1 size-3.5 text-destructive" /> Remove
              </Button>
            ) : null}
          </div>
          {showUrl ? (
            <Input
              value={value}
              placeholder="https://… or asset:key"
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <p className="truncate text-[11px] text-muted-foreground">{value || "No image set"}</p>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void run(e.target.files, (urls) => urls[0] && onChange(urls[0]));
          e.target.value = "";
        }}
      />
    </div>
  );
}
