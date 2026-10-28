/**
 * Schedule B, clause 11 - Additional Charges. Each residence has its own list
 * (Dani, 28 Oct 2026): The Arc's lost card is RM60, Solstice's RM50. Kept on
 * the residence (`residences.additional_charges`, Admin › Website › Residences
 * › Terms & fees), not here - one list in the code charged every residence
 * The Arc's prices.
 *
 * Picked from a list on an additional-charge invoice and a checkout deduction
 * (Dani, 2 Oct 2026): the description and amount fill in, and both stay
 * editable - "Damage or missing items" becomes "Missing item (watch), kitchen".
 * No amount: the clause says "reasonable cost", so admin types it.
 */
export type Charge = { label: string; amount: number | null };

/** the residence's list, as saved - lines without a name left out */
export function chargesOf(residence: { additional_charges?: unknown } | null | undefined): Charge[] {
  const list = residence?.additional_charges;
  if (!Array.isArray(list)) return [];
  return list
    .map((c: { label?: unknown; amount?: unknown } | null) => ({
      label: String(c?.label ?? "").trim(),
      amount: c?.amount === null || c?.amount === undefined || c?.amount === "" ? null : Number(c?.amount),
    }))
    .filter((c) => c.label && (c.amount === null || Number.isFinite(c.amount)));
}

/*
 * The charges the system raises by itself find their price on the list by
 * these names - the words of clause 11. Renaming one in Settings means the
 * system no longer finds it, and says so.
 */
export const ROOM_CHANGE_CHARGE = "Resident-requested room/unit change";
export const CARD_AFTER_UNIT_CHANGE_CHARGE = "Additional access card following room/unit change";
export const CARD_LOST_CHARGE = "Residence access card (lost)";
export const CARD_DAMAGED_CHARGE = "Residence access card (damaged)";

/** the price of one named charge on a residence's list, or null when it is not there or has no price */
export function chargeAmount(list: Charge[], label: string): number | null {
  const hit = list.find((c) => c.label.toLowerCase() === label.toLowerCase());
  return hit?.amount ?? null;
}

/** the same, for a charge the system raises - a missing price is an error that says where to set it */
export function requireCharge(list: Charge[], label: string, residenceName?: string): number {
  const amount = chargeAmount(list, label);
  if (amount === null)
    throw new Error(
      `"${label}" has no price for ${residenceName || "this residence"}. Add it in Website › Residences › Terms & fees › Additional charges.`,
    );
  return amount;
}
