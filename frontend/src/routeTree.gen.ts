import { Route as RootRoute } from "./routes/__root";
import { Route as LoginRoute } from "./routes/login";
import { Route as AssessmentsRoute } from "./routes/assessments";
import { Route as WizardRoute } from "./routes/assessments_.$id.wizard";
import { Route as MethodologyRoute } from "./routes/methodology";

export const routeTree = RootRoute.addChildren([
  LoginRoute,
  AssessmentsRoute,
  WizardRoute,
  MethodologyRoute,
]);
