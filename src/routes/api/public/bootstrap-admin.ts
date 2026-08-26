import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * One-time creation of the single admin account. Once an admin exists this
 * endpoint permanently refuses to do anything.
 */
const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(12).max(72),
});

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { count } = await supabaseAdmin
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count ?? 0) > 0) {
          return new Response("Admin already exists", { status: 403 });
        }

        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid payload", { status: 400 });

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: parsed.data.email,
          password: parsed.data.password,
          email_confirm: true,
        });
        if (error || !data.user) {
          return new Response(error?.message ?? "Could not create user", { status: 400 });
        }

        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: data.user.id, role: "admin" });
        if (roleError) return new Response(roleError.message, { status: 400 });

        return Response.json({ ok: true });
      },
    },
  },
});
