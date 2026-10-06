import { useEffect, useState } from "react";

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
  onLastPage,
  fileName,
}: {
  pdf: PdfResult;
  /** the name a download is saved under */
  fileName?: string | undefined;
  pdfLoading: boolean;
  docxBase64?: string | undefined;
  /** once the reader has reached the last page */
  onLastPage?: () => void;
}) {
  /*
   * The link is made and thrown away by the same effect. Made in useMemo and
   * revoked in an effect's cleanup, it could be revoked while the viewer was
   * still opening it - React runs effects twice in development - and the
   * master agreement showed "Could not open this PDF preview" (30 Sep 2026).
   */
  const base64 = pdf && pdf.ok ? pdf.base64 : "";
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!base64) {
      setUrl("");
      return;
    }
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const made = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [base64]);

  if (url) return <PdfPageViewer url={url} {...(onLastPage ? { onLastPage } : {})} {...(fileName ? { fileName } : {})} />;
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
