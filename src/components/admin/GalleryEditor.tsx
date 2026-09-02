import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropZone, previewSrc } from "@/components/admin/ImageUploader";

export type GalleryItem = {
  src: string;
  caption: string;
  category?: string;
  featured?: boolean;
};

const CATEGORIES = [
  { value: "building", label: "Building amenities" },
  { value: "apartment", label: "Inside your apartment" },
  { value: "room", label: "Inside your room" },
];

export function GalleryEditor({
  items,
  folder,
  onChange,
}: {
  items: GalleryItem[];
  folder: string;
  onChange: (next: GalleryItem[]) => void;
}) {
  const patch = (i: number, values: Partial<GalleryItem>) =>
    onChange(items.map((it, k) => (k === i ? { ...it, ...values } : it)));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <DropZone
        folder={folder}
        label="Drop photos here or click to upload — you can select several at once"
        onUploaded={(urls) => onChange([...items, ...urls.map((src) => ({ src, caption: "", category: "building" }))])}
      />

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No photos yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, i) => (
            <div key={`${item.src}-${i}`} className="overflow-hidden rounded-md border border-border bg-card">
              <div className="relative aspect-[4/3] bg-muted">
                {item.src ? (
                  <img src={previewSrc(item.src)} alt="" className="size-full object-cover" />
                ) : null}
                <div className="absolute right-1.5 top-1.5 flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="size-7"
                    onClick={() => move(i, -1)}
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="size-7"
                    onClick={() => move(i, 1)}
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="size-7"
                    onClick={() => onChange(items.filter((_, k) => k !== i))}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2 p-2">
                <Input
                  value={item.caption}
                  placeholder="Caption"
                  className="h-8 text-xs"
                  onChange={(e) => patch(i, { caption: e.target.value })}
                />
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  value={item.category ?? "building"}
                  onChange={(e) => patch(i, { category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Simple list of image URLs (room galleries). */
export function ImageList({
  items,
  folder,
  onChange,
}: {
  items: string[];
  folder: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      <DropZone folder={folder} onUploaded={(urls) => onChange([...items, ...urls])} label="Add photos" />
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((src, i) => (
            <div key={`${src}-${i}`} className="relative size-20 overflow-hidden rounded-md border border-border">
              <img src={previewSrc(src)} alt="" className="size-full object-cover" />
              <button
                type="button"
                className="absolute right-0.5 top-0.5 rounded bg-background/85 p-1"
                onClick={() => onChange(items.filter((_, k) => k !== i))}
              >
                <Trash2 className="size-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
