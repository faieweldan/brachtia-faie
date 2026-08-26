import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/website/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/website/residences" });
  },
});
