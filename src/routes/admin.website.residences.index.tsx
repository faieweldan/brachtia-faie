import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

import { listResidences, saveResidence } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/website/residences/")({
  component: ResidenceListPage,
});

/* eslint-disable @typescript-eslint/no-explicit-any */

function ResidenceListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "residences"],
    queryFn: () => listResidences(),
  });

  const residences: any[] = (data as any)?.residences ?? [];
  const rooms: any[] = (data as any)?.rooms ?? [];

  const publish = useMutation({
    mutationFn: (input: { id: string; published: boolean }) =>
      saveResidence({ data: { id: input.id, values: { published: input.published } } }),
    onSuccess: () => {
      toast.success("Saved");
      void queryClient.invalidateQueries({ queryKey: ["admin", "residences"] });
    },
    onError: () => toast.error("Could not save"),
  });

  const create = useMutation({
    mutationFn: () =>
      saveResidence({
        data: {
          values: {
            slug: `new-residence-${Date.now().toString().slice(-5)}`,
            name: "New residence",
            published: false,
            sort_order: residences.length,
          },
        },
      }),
    onSuccess: (res: any) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "residences"] });
      if (res?.id) void navigate({ to: "/admin/website/residences/$id", params: { id: res.id } });
    },
    onError: () => toast.error("Could not create residence"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Edit residence content, rooms and pricing shown on the public pages.
        </p>
        <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="mr-1 size-4" /> Add residence
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : residences.length === 0 ? (
        <p className="text-sm text-muted-foreground">No residences yet.</p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {residences.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-brand-deep">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.location || "No location"} · /{r.slug} ·{" "}
                  {rooms.filter((x) => x.residence_id === r.id).length} room types
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={!!r.published}
                  onCheckedChange={(v) => publish.mutate({ id: r.id, published: v })}
                />
                {r.published ? "Published" : "Hidden"}
              </label>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/website/residences/$id" params={{ id: r.id }}>
                  <Pencil className="mr-1 size-3.5" /> Edit
                </Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
