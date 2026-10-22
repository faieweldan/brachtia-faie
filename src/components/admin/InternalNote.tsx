import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, NotebookPen, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { getResidentNote, setResidentNote } from "@/lib/resident-notes.functions";

/**
 * The internal-notes box, one behaviour everywhere (Dani, 19 Oct 2026): type,
 * and it saves when you click away - only if the text changed. The booking's
 * Internal notes card and the resident profile's note line both use it.
 */
export function InternalNoteEditor({
  value,
  onSave,
  rows = 4,
  autoFocus,
  onDone,
}: {
  value: string;
  onSave: (next: string) => void;
  rows?: number;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  return (
    <Textarea
      defaultValue={value}
      rows={rows}
      autoFocus={autoFocus}
      placeholder="Add a note..."
      onBlur={(e) => {
        if (e.target.value !== value) onSave(e.target.value);
        onDone?.();
      }}
      onKeyDown={(e) => e.key === "Escape" && (e.currentTarget as HTMLTextAreaElement).blur()}
    />
  );
}

/**
 * The booking's Internal notes card. One note, one place (Dani, 19 Oct 2026):
 * before the booking has a resident it is the booking's own note; once it has
 * one, the card shows and saves the resident's note - the same note as the
 * line on their profile, so editing either changes both.
 */
export function BookingNoteBox({
  residentId,
  bookingNote,
  onSaveBooking,
}: {
  residentId?: string | null;
  bookingNote: string;
  onSaveBooking: (next: string) => void;
}) {
  const queryClient = useQueryClient();
  const key = ["admin", "resident-note", residentId ?? ""];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getResidentNote({ data: { residentId: residentId! } }),
    enabled: !!residentId,
  });
  if (!residentId || (data && !data.ready))
    return <InternalNoteEditor value={bookingNote} onSave={onSaveBooking} />;
  if (!data) return null;
  return (
    <InternalNoteEditor
      key={data.note}
      value={data.note}
      onSave={async (next) => {
        try {
          await setResidentNote({ data: { residentId, note: next } });
          await queryClient.invalidateQueries({ queryKey: key });
          toast.success("Note saved");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not save the note");
        }
      }}
    />
  );
}

/**
 * The resident's note as one short line under their labels: the note cut to
 * one line, click to open and edit; "Add note" when there is none. Under it,
 * read-only, the message they wrote on their enquiry - only when there is one.
 * Admin only.
 */
export function ResidentNoteLine({ residentId }: { residentId: string }) {
  const queryClient = useQueryClient();
  const key = ["admin", "resident-note", residentId];
  const { data } = useQuery({ queryKey: key, queryFn: () => getResidentNote({ data: { residentId } }) });
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const note = data?.note ?? "";
  useEffect(() => setOpen(false), [residentId]);

  async function save(next: string) {
    try {
      await setResidentNote({ data: { residentId, note: next } });
      await queryClient.invalidateQueries({ queryKey: key });
      toast.success("Note saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the note");
    }
  }

  if (!data?.ready) return null;
  return (
    <div className="mt-1.5 space-y-1 text-xs">
      {editing ? (
        <InternalNoteEditor value={note} rows={3} autoFocus onSave={save} onDone={() => setEditing(false)} />
      ) : note ? (
        <div className="flex items-start gap-1.5 text-foreground">
          <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Internal note" />
          <button
            type="button"
            title={open ? "Show less" : note}
            onClick={() => setOpen((o) => !o)}
            // up to four lines shown, the rest on a click (Dani, 22 Oct 2026: one line cut a group's names off)
            className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-left ${open ? "" : "line-clamp-4"}`}
          >
            {note}
          </button>
          <button type="button" onClick={() => setEditing(true)} className="inline-flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <Plus className="h-3 w-3" /> Add note
        </button>
      )}
      {data.message ? (
        <p className="flex items-start gap-1.5 text-muted-foreground">
          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate" title={data.message}>
            Message from enquiry: {data.message}
          </span>
        </p>
      ) : null}
    </div>
  );
}
