import { createFileRoute } from "@tanstack/react-router";

/**
 * The daily job for Update Tenancy (7 Oct 2026 review): an event whose day has
 * come takes effect - the bed moves, the end date changes - without anyone
 * opening the resident's page. Vercel calls it each morning (vercel.json),
 * with CRON_SECRET as its bearer token; without that secret set it refuses.
 * Billing reads run the same step, so a host without the job still catches up.
 */
export const Route = createFileRoute("/api/cron/tenancy-events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { billDueInvoices } = await import("@/lib/invoices");
        await billDueInvoices(supabaseAdmin);
        await (await import("@/lib/account-credit.server")).applyAllAccountCredit(supabaseAdmin);
        await (await import("@/lib/tenancy-events.server")).processAllEvents(supabaseAdmin);
        return Response.json({ ok: true });
      },
    },
  },
});
