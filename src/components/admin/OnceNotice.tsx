import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A short notice shown once, where it is, that closes itself (Dani, 14 Oct
 * 2026). For news that needs nothing done - "the room changed, Schedule A was
 * revised" - so it does not sit on the page bothering admin after it has been
 * read. A bar along the bottom runs down while it shows.
 *
 * `seenKey` names the news: once shown, the same key is not shown again in
 * this browser. Something admin must still act on is not this - leave it on
 * the page until it is done.
 */
export function OnceNotice({
  seenKey,
  children,
  ms = 8000,
  className = "",
}: {
  seenKey: string;
  children: ReactNode;
  ms?: number;
  className?: string;
}) {
  const storeKey = `once-notice:${seenKey}`;
  const [show, setShow] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(storeKey) === "1";
      window.localStorage.setItem(storeKey, "1");
    } catch {
      /* no storage: shown this time, as if new */
    }
    if (seen) return;
    setShow(true);
    // the bar starts full and runs down - started on the next frame so it animates
    const frame = requestAnimationFrame(() => setRunning(true));
    const done = window.setTimeout(() => setShow(false), ms);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [storeKey, ms]);

  if (!show) return null;
  return (
    <div
      role="status"
      className={`relative overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 pr-8 text-xs text-emerald-900 ${className}`}
    >
      {children}
      <button
        type="button"
        aria-label="Close"
        className="absolute right-1.5 top-1.5 rounded p-0.5 text-emerald-800/70 hover:bg-emerald-100 hover:text-emerald-900"
        onClick={() => setShow(false)}
      >
        <X className="size-3.5" />
      </button>
      <div
        aria-hidden
        className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-emerald-600/60"
        // transform, not width: the bar runs down without re-laying out the page
        style={{ transform: running ? "scaleX(0)" : "scaleX(1)", transition: `transform ${ms}ms linear` }}
      />
    </div>
  );
}
