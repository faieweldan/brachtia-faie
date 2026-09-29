import { useEffect, useMemo } from "react";

import { DocxView } from "@/components/admin/DocxView";
import { PdfPageViewer } from "@/components/admin/PdfPageViewer";

type PdfResult = { ok: true; base64: string } | { ok: false; error: string } | null | undefined;

/**
 * A tenancy document on the page, laid out the way it prints.
 *
 * The exact PDF - made by a real Word engine from the filled Word file - is
 * shown whenever it can be made, so the pages break where Word breaks them.
 * docx-preview's imitation guessed page breaks and drew a page that was only
 * a header (29 Sep 2026); it stays only as the fallback where no PDF engine is
 * set up yet, so the page is never blank.
 */
export function DocumentView({
  pdf,
  pdfLoading,
  docxBase64,
}: {
  pdf: PdfResult;
  pdfLoading: boolean;
  docxBase64?: string | undefined;
}) {
  const url = useMemo(() => {
    if (!pdf || !pdf.ok) return "";
    const bytes = Uint8Array.from(atob(pdf.base64), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  }, [pdf]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  if (url) return <PdfPageViewer url={url} />;
  if (pdfLoading && !pdf) {
    return <p className="py-24 text-center text-sm text-muted-foreground">Laying out the pages…</p>;
  }
  if (docxBase64) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-amber-700">
          Approximate layout — page breaks may differ from the printed document.
        </p>
        <DocxView base64={docxBase64} className="max-h-[80vh]" />
      </div>
    );
  }
  return (
    <p className="py-24 text-center text-sm text-destructive">
      {pdf && !pdf.ok ? pdf.error : "Could not show the document."}
    </p>
  );
}
