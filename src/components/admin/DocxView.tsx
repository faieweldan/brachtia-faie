import { useEffect, useRef, useState } from "react";

/**
 * A Word file drawn as Word draws it: pages, table borders, shading, headers,
 * footers, page numbers and signature lines, all from the .docx itself.
 *
 * This replaced showing the template as a web page. The web copy kept the
 * words and lost the layout, so the preview looked nothing like the agreement
 * a resident signs (Dani and Lav, 29 Sep 2026). Nothing here reflows with the
 * panel's width - a page is a page.
 */
export function DocxView({ base64, className = "" }: { base64: string; className?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const el = body.current;
    if (!el) return;
    setError("");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    void import("docx-preview")
      .then(({ renderAsync }) =>
        renderAsync(bytes, el, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true,
        }),
      )
      .then(() => live && fit())
      .catch(() => live && setError("Could not show this document."));
    return () => {
      live = false;
    };
  }, [base64]);

  /*
   * A Word page is wider than the panel it sits in. Centred and too wide, its
   * left edge was cut off where nothing could scroll to it - so the pages are
   * shrunk to the panel's width instead, like a PDF viewer's Fit.
   */
  function fit() {
    const wrap = body.current?.querySelector<HTMLElement>(".docx-wrapper");
    const page = wrap?.querySelector<HTMLElement>("section.docx");
    if (!wrap || !page || !frame.current) return;
    wrap.style.zoom = "1";
    const room = frame.current.clientWidth - 24;
    // the wrapper's own grey margin counts too, or the right edge is clipped instead
    const scale = Math.min(1, room / Math.max(page.offsetWidth, wrap.scrollWidth));
    wrap.style.zoom = String(scale);
  }
  useEffect(() => {
    if (!frame.current) return;
    const watch = new ResizeObserver(() => fit());
    watch.observe(frame.current);
    return () => watch.disconnect();
  }, []);

  return (
    <div ref={frame} className={`overflow-auto rounded-md border border-border bg-muted ${className}`}>
      {error ? <p className="py-20 text-center text-sm text-destructive">{error}</p> : null}
      {/* docx-preview writes the pages in here, grey behind white sheets */}
      <div ref={body} className="docx-host" />
    </div>
  );
}
