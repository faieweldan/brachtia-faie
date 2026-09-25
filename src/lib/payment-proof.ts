import { toast } from "sonner";

import type { ProofFile } from "@/lib/invoice-pdf";

/**
 * The slip a payment was made with, fetched so it can be bound into a receipt.
 *
 * Written once because three screens need it and a receipt that carries its
 * proof on one screen and not on another is the same payment behaving two ways
 * - and staff download these to send on, so the difference reaches the student.
 *
 * A proof that will not open says so. Quietly returning nothing would hand
 * somebody a document they believe has the slip in it, and they would only find
 * out after sending it.
 */
export async function loadProofFile(path: string): Promise<ProofFile | null> {
  if (!path) return null;
  try {
    const { paymentProofUrl } = await import("@/lib/resident-billing.functions");
    const { url } = await paymentProofUrl({ data: { path } });
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    return { name: path.split("/").pop() ?? "proof", type: blob.type, blob };
  } catch {
    toast.error("Could not add the payment proof", {
      description: "The receipt is still shown without it.",
    });
    return null;
  }
}
