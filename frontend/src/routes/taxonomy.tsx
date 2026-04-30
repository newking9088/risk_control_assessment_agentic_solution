import { createRoute } from "@tanstack/react-router";
import { Route as RootRoute } from "./__root";
import { TaxonomyManagementPage } from "@/features/taxonomy/TaxonomyManagementPage";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/taxonomy",
  component: TaxonomyManagementPage,
});
