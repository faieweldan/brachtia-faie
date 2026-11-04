import { useQuery } from "@tanstack/react-query";

import { staffChoices } from "@/lib/staff";
import { listStaff } from "@/lib/staff.functions";

/** The staff list from Settings → Staff - one query, shared by every dropdown on the page. */
export function useStaff() {
  const q = useQuery({ queryKey: ["staff"], queryFn: () => listStaff(), staleTime: 60_000 });
  const list = q.data ?? [];
  return {
    list,
    /** who a dropdown offers: who works here now, plus `current` if it is someone who has left */
    choices: (current = "") => staffChoices(list, current),
    /** every name ever on the list - for filtering old records */
    all: list.map((s) => s.name),
    /** chosen, but with no signature saved yet - they cannot sign what they make (the server refuses it too) */
    unsigned: (name: string) => !!name && list.some((s) => s.name === name && !s.hasSignature),
  };
}
