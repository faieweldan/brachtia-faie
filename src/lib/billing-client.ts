import { useMemo } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { releaseBookingRoom } from "@/lib/admin.functions";
import {
  refreshResidents,
  refreshUnits,
  residentIdOf,
  useOps,
  type Resident,
} from "@/lib/ops-store";
import {
  listBillingLedger,
  uploadPaymentProof,
  type LedgerInvoice,
} from "@/lib/resident-billing.functions";

/**
 * What the admin pages do around money, in one place.
 *
 * Recording a payment, releasing a booking's bed and uploading a proof each
 * happen on more than one page - the booking, a resident's Payments tab,
 * Collections, Homes. Written once here, a new query to refresh or a new rule
 * cannot reach one page and miss the next.
 */

/** Everything a change of money can alter on screen. */
export function refreshMoney(queryClient: QueryClient) {
  return Promise.all(
    [["resident-billing"], ["billing-ledger"], ["admin"]].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

/**
 * After recordPayment: say so, refresh the money, and - only when the payment
 * made a resident or filled a bed - reload residents and beds too.
 */
export async function afterPaymentRecorded(
  queryClient: QueryClient,
  res: {
    receipt?: { number?: unknown } | null;
    /** the booking fee in full makes the resident - see recordPayment */
    residentCreated?: boolean | undefined;
    residentCode?: string | undefined;
  },
) {
  toast.success(`Payment recorded — receipt ${String(res.receipt?.number ?? "")}`);
  if (res.residentCreated) {
    toast.success(
      res.residentCode ? `Resident created · ${res.residentCode}` : "Resident created",
      { description: "The booking fee is in, so their record and bed are set up." },
    );
    // they now hold a bed and appear in Residents
    await Promise.all([refreshResidents(), refreshUnits()]);
  }
  await refreshMoney(queryClient);
}

/** Whose folder a proof is filed in: the resident, or the booking before there is one. */
export const proofOwner = (residentId?: string | null, enquiryId?: string | null) =>
  residentId || `booking-${enquiryId ?? ""}`;

/** A bank slip is private: it goes to the documents bucket. Returns its path. */
export async function uploadProof(file: File, owner: string) {
  const form = new FormData();
  form.set("file", file);
  form.set("owner", owner);
  return (await uploadPaymentProof({ data: form })).path;
}

/**
 * Before a booking's bed is emptied, from any page: check it may be, cancel an
 * unpaid invoice with it, and say what happened. False means leave the bed as it is.
 */
export async function releaseBookingFor(
  queryClient: QueryClient,
  enquiryId: string,
  paidMessage: string,
) {
  const check = await releaseBookingRoom({ data: { enquiryId } }).catch((err: unknown) => {
    // e.g. nobody is assigned to the booking yet - say so, not just "could not"
    toast.error(err instanceof Error ? err.message : "Could not release the bed");
    return null;
  });
  if (!check) return false;
  if (!check.ok) {
    toast.error(paidMessage);
    return false;
  }
  void refreshMoney(queryClient);
  if (check.voided.length) toast.success(`Invoice ${check.voided.join(", ")} cancelled`);
  return true;
}

export type LedgerRow = LedgerInvoice & {
  residentId: string;
  residentName: string;
  quickbooksId: string;
  /** the ID the resident goes by - their resident ID, or the Brachtia ID they kept */
  residentCode: string;
};

/**
 * Every invoice, each matched to its resident here in the page.
 *
 * The residents are already loaded for every admin page, so the server sends
 * the invoices only - not a second copy of every resident with every document.
 */
export function useBillingLedger() {
  const { residents } = useOps();
  const { data, isLoading } = useQuery({
    queryKey: ["billing-ledger"],
    queryFn: () => listBillingLedger(),
  });

  const rows = useMemo<LedgerRow[]>(() => {
    // billing may be filed under the resident's uuid or their QuickBooks id
    const byRef = new Map<string, Resident>();
    for (const r of residents) {
      byRef.set(r.id, r);
      if (r.quickbooksId) byRef.set(r.quickbooksId, r);
    }
    return (data ?? []).map((inv) => {
      const person = byRef.get(inv.residentRef);
      return {
        ...inv,
        residentId: person?.id ?? "",
        residentName: person?.fullName || inv.invoiceName,
        quickbooksId: person?.quickbooksId ?? "",
        residentCode: person ? residentIdOf(person) : "",
      };
    });
  }, [data, residents]);

  // rent made ahead is listed apart: nobody owes it yet, so it is in no total
  const billed = useMemo(() => rows.filter((r) => !r.scheduled), [rows]);
  const scheduled = useMemo(() => rows.filter((r) => r.scheduled), [rows]);
  return { rows: billed, scheduled, isLoading };
}
