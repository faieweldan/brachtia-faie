import { createServerFn } from "@tanstack/react-start";

import type { MigrationPreviewRow } from "@/lib/migration/sheet3";
import type { ImportOutcome } from "@/lib/migration/import.server";

/** the service-role client - only after the admin session is checked (adminDb) */
async function admin(): Promise<any> {
  const { adminDb } = await import("@/lib/admin-session.server");
  return adminDb();
}

/**
 * Import the residents the Migration 1 check passed (Dani, 12 Oct 2026). The
 * page sends the rows exactly as it showed them; each is written by
 * importResident - one at a time, undone on failure, a QuickBooks ID already in
 * the system skipped. Blocked rows are refused here too, not only on the page.
 */
export const importMigration = createServerFn({ method: "POST" })
  .inputValidator((data: { rows: MigrationPreviewRow[]; today: string }) => data)
  .handler(async ({ data }): Promise<{ outcomes: ImportOutcome[] }> => {
    const sb = await admin();
    const { importResident } = await import("@/lib/migration/import.server");
    const today = /^\d{4}-\d{2}-\d{2}$/.test(data.today) ? data.today : new Date().toISOString().slice(0, 10);
    const outcomes: ImportOutcome[] = [];
    for (const row of data.rows) outcomes.push(await importResident(sb, row, today));
    return { outcomes };
  });
