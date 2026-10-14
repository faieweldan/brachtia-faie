/**
 * The agreement number (Dani, 12 Oct 2026): TA + the resident's ID + their own
 * agreement sequence.
 *
 *   TA-26IF0042-01   the resident's first agreement
 *   TA-26IF0042-02   their second (a renewal, an addendum)
 *
 * It used to be one counter for everybody (TA-0040), written out in three
 * places - first agreement, renewal and uploaded files - so a number said
 * nothing about whose agreement it was. Every place that makes an agreement,
 * and the Migration 1 import, now asks this one function.
 */

/** The number itself, for a resident code and a sequence. */
export function agreementNo(residentCode: string, sequence: number) {
  return `TA-${residentCode.trim().toUpperCase()}-${String(sequence).padStart(2, "0")}`;
}

/**
 * The next number for this resident: one more than the agreements they already
 * have. A number already taken (two made at once) moves on to the next.
 * `db` is the service-role client. Throws when the resident has no code yet -
 * it is given once their gender and nationality are known.
 */
export async function nextAgreementNo(db: any, residentId: string) {
  const [{ data: resident }, { data: existing }] = await Promise.all([
    db.from("residents").select("resident_code").eq("id", residentId).maybeSingle(),
    db.from("tenancy_agreements").select("agreement_no").eq("resident_id", residentId),
  ]);
  const code = String(resident?.resident_code ?? "").trim();
  if (!code) throw new Error("The resident has no Resident ID yet - add their gender and nationality first.");
  const taken = new Set(((existing ?? []) as any[]).map((a) => String(a.agreement_no)));
  let n = taken.size + 1;
  while (taken.has(agreementNo(code, n))) n += 1;
  return agreementNo(code, n);
}
