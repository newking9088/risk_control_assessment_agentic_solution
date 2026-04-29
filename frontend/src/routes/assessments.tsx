import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Route as RootRoute } from "./__root";
import { TopNav } from "@/features/wizard/TopNav";
import styles from "./assessments.module.scss";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/assessments",
  component: AssessmentsPage,
});

interface Assessment {
  id: string;
  title: string;
  status: string;
  current_step: number;
  created_at: string;
  owner?: string;
  business_unit?: string;
}

const STEP_LABELS: Record<number, string> = {
  1: "Preparation",
  2: "Questionnaire",
  3: "Identify Risks",
  4: "Inherent Risk",
  5: "Evaluate Controls",
  6: "Residual Risk",
  7: "Summary",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#64748b",
  in_progress: "#2563eb",
  review: "#f59e0b",
  complete: "#16a34a",
};

function AssessmentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: assessments = [], isLoading } = useQuery<Assessment[]>({
    queryKey: ["assessments"],
    queryFn: () => api.get("/api/v1/assessments").then((r) => r.json()),
  });

  const create = useMutation({
    mutationFn: (title: string) =>
      api.post("/api/v1/assessments", { title }).then((r) => r.json()),
    onSuccess: (a: Assessment) => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      navigate({ to: "/assessments/$id/wizard", params: { id: a.id } });
    },
  });

  function handleNew() {
    create.mutate(`Assessment ${new Date().toLocaleDateString()}`);
  }

  return (
    <div className={styles.page}>
      <TopNav />

      <div className={styles.body}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Assessment Dashboard</h1>
            <p className={styles.subtitle}>Manage all risk and control assessments for your organisation.</p>
          </div>
          <button onClick={handleNew} disabled={create.isPending} className={styles.newBtn}>
            {create.isPending ? "Creating…" : "+ Create New Assessment"}
          </button>
        </div>

        {isLoading ? (
          <div className={styles.loadingState}>Loading assessments…</div>
        ) : assessments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📋</div>
            <h3>No assessments yet</h3>
            <p>Create your first risk and control assessment to get started.</p>
            <button onClick={handleNew} disabled={create.isPending} className={styles.newBtn}>
              + Create New Assessment
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {assessments.map((a) => {
              const pct = Math.round(((a.current_step - 1) / 7) * 100);
              return (
                <div
                  key={a.id}
                  className={styles.card}
                  onClick={() => navigate({ to: "/assessments/$id/wizard", params: { id: a.id } })}
                >
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{a.title}</h3>
                    <span
                      className={styles.statusBadge}
                      style={{ color: STATUS_COLORS[a.status] ?? "#64748b" }}
                    >
                      {a.status?.replace("_", " ") ?? "draft"}
                    </span>
                  </div>

                  {(a.owner || a.business_unit) && (
                    <p className={styles.cardMeta}>
                      {[a.owner, a.business_unit].filter(Boolean).join(" · ")}
                    </p>
                  )}

                  <div className={styles.progressSection}>
                    <div className={styles.progressHeader}>
                      <span className={styles.progressStep}>
                        Step {a.current_step}: {STEP_LABELS[a.current_step] ?? "—"}
                      </span>
                      <span className={styles.progressPct}>{pct}%</span>
                    </div>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <p className={styles.cardDate}>
                    Created {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
