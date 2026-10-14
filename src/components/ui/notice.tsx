import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/*
 * Notices - a core piece (Dani, 14 Oct 2026). Every quiet line of news on a
 * card uses these, so they look and behave as one kind of thing: the account
 * credit strip on Payments, the room-change line on the Tenancy tab, and
 * whatever comes next. See AGENTS.md "Shared pieces".
 */

/**
 * The look of a quiet notice on a card - "Account credit RM… available", the
 * Tenancy tab's "A-16-08 · Room C → A-15-05 · Room A · Schedule A revised".
 * One class, so they read as one kind of thing (Dani, 14 Oct 2026).
 */
export const NOTICE_CLASS = "rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900";

/**
 * News that needs nothing done, kept on the page until admin closes it with ✕
 * (Dani, 14 Oct 2026) - then not shown again in this browser. `seenKey` names
 * the news, so a new change shows a new notice.
 *
 * Something admin must still act on is not this - leave it on the page until
 * it is done.
 */
export function DismissibleNotice({
  seenKey,
  children,
  className = "",
}: {
  seenKey: string;
  children: ReactNode;
  className?: string;
}) {
  const storeKey = `once-notice:${seenKey}`;
  // hidden until read, so a closed one does not flash on load
  const [closed, setClosed] = useState(true);

  useEffect(() => {
    try {
      setClosed(window.localStorage.getItem(storeKey) === "1");
    } catch {
      setClosed(false);
    }
  }, [storeKey]);

  function close() {
    setClosed(true);
    try {
      window.localStorage.setItem(storeKey, "1");
    } catch {
      /* no storage: closed for now */
    }
  }

  if (closed) return null;
  return (
    <div role="status" className={`relative pr-8 ${NOTICE_CLASS} ${className}`}>
      {children}
      <button
        type="button"
        aria-label="Close"
        className="absolute right-1.5 top-1.5 rounded p-0.5 text-emerald-800/70 hover:bg-emerald-100 hover:text-emerald-900"
        onClick={close}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** A notice that stays - for something that is true for as long as it shows. */
export function Notice({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${NOTICE_CLASS} ${className}`}>{children}</div>;
}
