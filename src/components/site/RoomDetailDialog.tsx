import { Bath, BedDouble, Check, Eye, Ruler, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  availabilityFor,
  bedConfig,
  formatRM,
  viewLabel,
  type Occupancy,
  type Property,
  type RoomType,
} from "@/data/properties";
import RoomGallery from "./RoomGallery";
import EnquireDialog from "./EnquireDialog";

const DEFAULT_FURNISHING = [
  "Single bed with mattress",
  "Study desk & chair",
  "Wardrobe",
  "Air-conditioning",
  "Ceiling light & power points",
];

export default function RoomDetailDialog({
  property,
  room,
  moveIn,
  open,
  onOpenChange,
  onUseInCalculator,
}: {
  property: Property;
  room: RoomType | null;
  moveIn?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseInCalculator?: (room: RoomType) => void;
}) {
  if (!room) return null;

  const availability = availabilityFor(room, moveIn);
  const facts = [
    room.sizeLabel && { icon: Ruler, label: room.sizeLabel },
    {
      icon: Bath,
      label: room.bathroom === "ensuite" ? "Private ensuite" : "Shared bathroom",
    },
    { icon: Eye, label: viewLabel(room) },
    { icon: Sparkles, label: "Fully furnished" },
  ].filter(Boolean) as { icon: typeof Ruler; label: string }[];

  const furnishing = room.furnishing ?? DEFAULT_FURNISHING;
  const bedOptions = property.singleBedOptions ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <RoomGallery
          images={room.gallery.length ? room.gallery : [room.image]}
          alt={`${room.name} at ${property.name}`}
          className="h-60 w-full rounded-t-lg sm:h-80"
        />

        <div className="space-y-6 p-6">
          <DialogHeader className="space-y-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand-deep">
                {room.unitType.replace(" Apartment", "")}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  availability.tone === "ready"
                    ? "bg-brand/10 text-brand-deep"
                    : availability.tone === "later"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {availability.label}
              </span>
            </div>
            <DialogTitle className="text-2xl font-bold text-brand-deep">{room.name}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {room.description}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            {facts.map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground"
              >
                <f.icon className="size-3.5 text-brand" /> {f.label}
              </span>
            ))}
          </div>

          <section>
            <h4 className="text-sm font-bold text-brand-deep">Bed configuration & rates</h4>
            <div className="mt-2 overflow-hidden rounded-2xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Occupancy</th>
                    <th className="px-4 py-2 font-semibold">Beds</th>
                    <th className="px-4 py-2 font-semibold">12-month</th>
                    <th className="px-4 py-2 font-semibold">Short-term</th>
                  </tr>
                </thead>
                <tbody>
                  {(["single", "twin"] as Occupancy[]).map((o) => {
                    const offered = room.occupancies.includes(o);
                    return (
                      <tr key={o} className="border-t border-border/70">
                        <td className="px-4 py-2.5 font-medium text-foreground">
                          {o === "single" ? "Single" : "Twin sharing"}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {offered ? (
                            <span className="inline-flex items-center gap-1.5">
                              <BedDouble className="size-3.5 shrink-0 text-brand" />
                              {o === "single" && bedOptions.length > 0
                                ? bedOptions.length > 1
                                  ? `Choose: ${bedOptions.join(" / ")}`
                                  : bedOptions[0]
                                : bedConfig(room, o)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-foreground">
                          {offered && room.rent.long[o]
                            ? `${formatRM(room.rent.long[o]!)}${o === "twin" ? "/pax" : ""}`
                            : "Not offered"}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-foreground">
                          {offered && room.rent.short[o]
                            ? `${formatRM(room.rent.short[o]!)}${o === "twin" ? "/pax" : ""}`
                            : "Not offered"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h4 className="text-sm font-bold text-brand-deep">In your room</h4>
              <ul className="mt-2 space-y-1.5">
                {furnishing.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-brand" /> {f}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="text-sm font-bold text-brand-deep">Shared in the apartment</h4>
              <ul className="mt-2 space-y-1.5">
                {room.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-brand" /> {f}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row">
            {onUseInCalculator && (
              <Button
                className="flex-1"
                size="lg"
                onClick={() => {
                  onUseInCalculator(room);
                  onOpenChange(false);
                }}
              >
                Select this room
              </Button>
            )}
            <Button asChild variant="outline" size="lg" className="flex-1">
              <a
                href={whatsappUrl(
                  `Hi Brachtia Homes, I'd like to check availability for ${room.name} at ${property.name}.`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-4" /> WhatsApp us
              </a>
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
