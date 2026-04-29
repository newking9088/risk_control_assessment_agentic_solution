import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Route as RootRoute } from "./__root";
import { WizardLayout } from "@/features/wizard/WizardLayout";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/assessments/$id/wizard",
  component: WizardPage,
});

function WizardPage() {
  const { id } = Route.useParams();

  const { data: assessment, isLoading } = useQuery({
    queryKey: ["assessment", id],
    queryFn: () => api.get(`/api/v1/assessments/${id}`).then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b" }}>
        Loading assessment…
      </div>
    );
  }

  if (!assessment) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#ef4444" }}>
        Assessment not found.
      </div>
    );
  }

  return (
    <WizardLayout
      assessmentId={id}
      currentStep={assessment.current_step ?? 1}
      assessmentTitle={assessment.title}
    />
  );
}
