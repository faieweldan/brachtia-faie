import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MARK_CSS, Paper } from "@/components/admin/TemplatePaper";
import { getDocumentView } from "@/lib/tenancy-docs.functions";
import { previewGeneratedPdf } from "@/lib/templates.functions";
import { DocumentView } from "@/components/admin/DocumentView";
import { renderTemplate, type MappingResult } from "@/lib/template-fields";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** shows a generated document exactly as it was generated */
export function DocumentViewDialog({
  target,
  title,
  onClose,
}: {
  target: { kind: "agreement" | "card"; id: string } | null;
  title: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["doc-view", target?.kind, target?.id],
    queryFn: () => getDocumentView({ data: target! }),
    enabled: !!target,
  });
  /*
   * The document in its real layout - the Word file it was generated from,
   * filled with the values saved then - the same pages as the pack's preview.
   * The rebuilt web copy stays only where no PDF can be made (30 Sep 2026).
   */
  const pdf = useQuery({
    queryKey: ["doc-pdf", target?.kind, target?.id],
    queryFn: () => previewGeneratedPdf({ data: target! }),
    enabled: !!target,
    staleTime: Infinity,
  });
  const exact = pdf.data?.ok ? pdf.data.base64 : "";
  function download() {
    const bytes = Uint8Array.from(atob(exact), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  const html = q.data?.html
    ? renderTemplate(
        q.data.html,
        new Proxy({} as Record<string, MappingResult>, {
          get: (_t, key: string) => {
            const v = q.data!.values[key];
            return { key, source: "", value: v ?? "", result: "mapped" } as MappingResult;
          },
        }),
      )
    : null;

  function print() {
    if (!html) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const plain = html.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/g, "$1");
    w.document.write(`<html><head><title>${esc(title)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:1in}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}</style></head><body>${plain}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6">
            <span>
              {title}
              {q.data?.version ? <span className="ml-2 text-xs font-normal text-muted-foreground">Template v{q.data.version}</span> : null}
            </span>
            {exact ? (
              <Button size="sm" variant="outline" onClick={download}>
                <Printer className="mr-1 size-4" /> Download PDF
              </Button>
            ) : html && pdf.data ? (
              <Button size="sm" variant="outline" onClick={print}>
                <Printer className="mr-1 size-4" /> Print / Save PDF
              </Button>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        {exact || (pdf.isLoading && !pdf.data) ? (
          <DocumentView pdf={pdf.data} pdfLoading={pdf.isLoading} />
        ) : q.isLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading document…</p>
        ) : q.isError ? (
          <p className="py-16 text-center text-sm text-destructive">Could not load the document.</p>
        ) : !html ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No template was active for this document when it was generated, so there is nothing to show. Activate one in Settings → Templates, then generate a new version.
          </p>
        ) : (
          <>
          {pdf.data && !pdf.data.ok ? (
            <p className="text-xs text-amber-700">Approximate layout — {pdf.data.error}</p>
          ) : null}
          <Paper>
            <div className={MARK_CSS} dangerouslySetInnerHTML={{ __html: html }} />
          </Paper>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
