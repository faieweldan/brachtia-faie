import { ChevronDown } from "lucide-react";

/**
 * Opens and closes a message card's text (Dani and Lav, 29 Sep 2026). A booking
 * can carry three or four long ready-made messages at once, and open together
 * they read as one wall of text - so each starts closed, showing only what it
 * is, and opens when it is the one being sent.
 */
export function MessageToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {open ? "Hide message" : "Show message"}
      <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}
