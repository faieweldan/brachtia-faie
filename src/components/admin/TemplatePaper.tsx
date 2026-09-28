import { useEffect, useRef, useState } from "react";

export const MARK_CSS =
  "[&_mark]:rounded [&_mark]:px-0.5 [&_mark[data-ph=ph]]:bg-primary/15 [&_mark[data-ph=ph]]:text-primary [&_mark[data-ph=ok]]:bg-primary/10 [&_mark[data-ph=unmapped]]:bg-destructive/15 [&_mark[data-ph=unmapped]]:text-destructive [&_mark[data-ph=missing]]:bg-accent [&_h1]:text-[14pt] [&_h1]:font-bold [&_h2]:text-center [&_h2]:text-[12pt] [&_h2]:font-bold [&_p]:my-[6pt] [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-1 [&_td]:align-top [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 break-words";

/** A4 at 96dpi with 1-inch Word margins, scaled down to fit the column. */
const PAGE_W = 794;
export function Paper({ children }: { children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setZoom(Math.min(1, el.clientWidth / PAGE_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={wrap} className="overflow-hidden rounded-lg bg-muted p-0 sm:p-0">
      <div
        style={{ width: PAGE_W, minHeight: 1123, padding: 96, zoom, fontFamily: "Calibri, Carlito, Arial, sans-serif", fontSize: "11pt", lineHeight: 1.35 }}
        className="mx-auto bg-background text-foreground shadow-md"
      >
        {children}
      </div>
    </div>
  );
}

