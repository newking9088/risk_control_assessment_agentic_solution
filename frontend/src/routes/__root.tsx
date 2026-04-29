import { createRootRouteWithContext, Outlet, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { getSession } from "@/lib/auth";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    const isPublic = location.pathname === "/login";
    if (!session && !isPublic) {
      throw redirect({ to: "/login" });
    }
    if (session && isPublic) {
      throw redirect({ to: "/assessments" });
    }
    return { session };
  },
  component: () => <Outlet />,
});
