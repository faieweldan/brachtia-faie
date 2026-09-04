import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/data/properties";

/**
 * Slim sticky action bar shown on mobile once the user scrolls past the hero.
 * Hidden from `md:` upwards, where the sticky calculator sidebar takes over.
 */
export default function MobileCtaBar({
  label,
  hint,
  targetId = "stay-calculator",
  message,
}: {
  label: string;
  hint?: string;
  targetId?: string;
  message: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur transition-transform duration-300 md:hidden ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-2">
        <Button
          className="h-12 min-w-0 flex-1 rounded-full text-sm font-bold"
          onClick={() =>
            document
              .getElementById(targetId)
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        >
          <span className="truncate">{label}</span>
        </Button>
        <Button
          asChild
          variant="outline"
          className="size-12 shrink-0 rounded-full p-0"
          aria-label="WhatsApp us"
        >
          <a href={whatsappUrl(message)} target="_blank" rel="noreferrer">
            <MessageCircle className="size-5" />
          </a>
        </Button>
      </div>
      {hint ? (
        <p className="mt-1 truncate text-center text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
