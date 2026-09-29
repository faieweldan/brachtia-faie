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
      .catch(() => live && setError("Could not show this document."));
    return () => {
      live = false;
    };
  }, [base64]);

  return (
    <div className={`overflow-auto rounded-md border border-border bg-muted ${className}`}>
      {error ? <p className="py-20 text-center text-sm text-destructive">{error}</p> : null}
      {/* docx-preview writes the pages in here, grey behind white sheets */}
      <div ref={body} className="docx-host" />
    </div>
  );
}
