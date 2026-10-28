/* eslint-disable @typescript-eslint/no-explicit-any */
import { chargesOf, type Charge } from "@/lib/charge-list";

export type ResidenceCharges = { residenceName: string; charges: Charge[] };

/** a residence's Schedule B charges, by its id */
export async function residenceCharges(sb: any, residenceId: string | null | undefined): Promise<ResidenceCharges> {
  if (!residenceId) return { residenceName: "", charges: [] };
  const { data } = await sb.from("residences").select("*").eq("id", residenceId).maybeSingle();
  return { residenceName: String(data?.name ?? ""), charges: chargesOf(data) };
}

/** the charges of the residence a unit is in - Update Tenancy prices a move from the unit it leaves */
export async function unitCharges(sb: any, unitId: string | null | undefined): Promise<ResidenceCharges> {
  if (!unitId) return { residenceName: "", charges: [] };
  const { data } = await sb.from("units").select("residence_id").eq("id", unitId).maybeSingle();
  return residenceCharges(sb, data?.residence_id);
}

/** the charges of the residence the resident is placed in (placementForResident) */
export async function residentCharges(sb: any, residentId: string): Promise<ResidenceCharges> {
  const { placementForResident } = await import("@/lib/placement.server");
  const p = await placementForResident(sb, residentId);
  return { residenceName: String(p?.residence?.name ?? ""), charges: chargesOf(p?.residence as any) };
}
