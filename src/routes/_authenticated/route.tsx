import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        throw redirect({ to: "/auth" });
      }
      return { user: data.user };
    } catch (err: any) {
      if (err && typeof err === "object" && ("to" in err || "isRedirect" in err || err.constructor?.name === "Redirect")) {
        throw err;
      }
      console.warn("[Auth] Sessão inválida ou erro na checagem de usuário:", err);
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
