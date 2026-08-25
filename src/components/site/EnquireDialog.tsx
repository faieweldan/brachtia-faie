import { useState, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  formatDate,
  formatRM,
  whatsappUrl,
  type ContractTerm,
  type Occupancy,
  type Property,
  type RoomType,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function EnquireDialog({
  property,
  room,
  term = "long",
  occupancy = "single",
  trigger,
}: {
  property: Property;
  room?: RoomType;
  term?: ContractTerm;
  occupancy?: Occupancy;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rent = room ? room.rent[term][occupancy] : null;

  const message = room
    ? `Hi Brachtia Homes, I'd like to enquire about the ${room.name} (${
        occupancy === "single" ? "single occupancy" : "twin sharing"
      }, ${term === "long" ? "12-month" : "short-term"}) at ${property.name}.`
    : `Hi Brachtia Homes, I'd like to enquire about ${property.name}.`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-brand-deep">Enquire now</DialogTitle>
          <DialogDescription>
            Tell us what you're after and our team will reach out by email or WhatsApp with
            availability and next steps.
          </DialogDescription>
        </DialogHeader>

        {room && (
          <div className="flex items-center gap-3 rounded-2xl bg-brand-tint p-3">
            <img
              src={room.image}
              alt={room.name}
              width={160}
              height={160}
              className="size-16 shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-deep">{room.name}</p>
              <p className="truncate text-xs text-muted-foreground">{property.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {rent ? `${formatRM(rent)}/month · ` : ""}
                Available {formatDate(room.availableFrom)}
              </p>
            </div>
          </div>
        )}

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
            toast.success("Enquiry sent", {
              description: "Our team will reach out by email or WhatsApp shortly.",
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eq-first">First name</Label>
              <Input id="eq-first" name="firstName" required placeholder="Aisha" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-last">Last name</Label>
              <Input id="eq-last" name="lastName" required placeholder="Rahman" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-email">Email</Label>
              <Input id="eq-email" name="email" type="email" required placeholder="you@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-phone">Phone / WhatsApp</Label>
              <Input id="eq-phone" name="phone" required placeholder="+60..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-occupancy">Occupancy</Label>
              <select
                id="eq-occupancy"
                name="occupancy"
                defaultValue={occupancy}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="single">Single occupancy</option>
                <option value="twin">Twin sharing</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-term">Stay length</Label>
              <select
                id="eq-term"
                name="term"
                defaultValue={term}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="long">12 months</option>
                <option value="short">Short-term (under 6 months)</option>
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="eq-movein">Preferred move-in date</Label>
              <Input id="eq-movein" name="moveIn" type="date" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eq-message">Message</Label>
            <Textarea
              id="eq-message"
              name="message"
              rows={3}
              placeholder="Tell us your university, preferences or any questions."
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" size="lg" className="flex-1">
              Send enquiry
            </Button>
            <Button asChild type="button" size="lg" variant="outline" className="flex-1">
              <a href={whatsappUrl(message)} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Admin reviews every enquiry and confirms the exact unit with you — you're not booking a
            specific unit number here.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
