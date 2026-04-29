import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import clsx from "clsx";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

interface Risk {
  id: string;
  name: string;
  category: string;
  source: string;
  inherent_likelihood: string;
  inherent_impact: string;
  residual_likelihood: string | null;
  residual_impact: string | null;
}

const LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

function score(l: string) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[l] ?? 0;
}

export function StepResidualRisk({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data: risks = [] } = useQuery<Risk[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  const allRated = risks.length > 0 && risks.every((r) => r.residual_likelihood && r.residual_impact);
  const rated = risks.filter((r) => r.residual_likelihood && r.residual_impact).length;

  useEffect(() => {
    onValidChange(allRated);
  }, [allRated, onValidChange]);

  const updateRisk = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Risk> }) =>
      api.patch(`/api/v1/assessments/${assessmentId}/risks/${id}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risks", assessmentId] }),
  });

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Residual Risk</h2>
        <p className={styles.stepDesc}>
          Re-rate each risk after applying controls to calculate the final residual exposure.
          <span className={styles.progressHint}>{rated} / {risks.length} rated</span>
        </p>
      </div>

      <div className={styles.ratingLayout}>
        {risks.map((risk) => {
          const iScore = score(risk.inherent_likelihood) * score(risk.inherent_impact);
          const rScore = risk.residual_likelihood && risk.residual_impact
            ? score(risk.residual_likelihood) * score(risk.residual_impact)
            : null;
          const reduction = rScore !== null && iScore > 0
            ? Math.round(((iScore - rScore) / iScore) * 100)
            : null;

          return (
            <div key={risk.id} className={styles.riskRatingCard}>
              <div className={styles.riskRatingHeader}>
                <span className={styles.riskRatingName}>{risk.name}</span>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    Inherent: <strong>{risk.inherent_likelihood} / {risk.inherent_impact}</strong>
                  </span>
                  {reduction !== null && (
                    <span style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: reduction > 0 ? "#16a34a" : "#dc2626",
                      background: reduction > 0 ? "#dcfce7" : "#fee2e2",
                      padding: "0.1rem 0.4rem",
                      borderRadius: "99px",
                    }}>
                      {reduction > 0 ? `↓ ${reduction}% reduction` : "No change"}
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.ratingPanels}>
                <div className={styles.ratingPanel}>
                  <p className={styles.ratingPanelLabel}>Residual Likelihood</p>
                  <div className={styles.levelButtons}>
                    {LEVELS.map((l) => (
                      <button
                        key={l.value}
                        className={clsx(
                          styles.levelBtn,
                          styles[`level${l.label}`],
                          { [styles.levelActive]: risk.residual_likelihood === l.value }
                        )}
                        onClick={() => updateRisk.mutate({ id: risk.id, body: { residual_likelihood: l.value } })}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.ratingPanel}>
                  <p className={styles.ratingPanelLabel}>Residual Impact</p>
                  <div className={styles.levelButtons}>
                    {LEVELS.map((l) => (
                      <button
                        key={l.value}
                        className={clsx(
                          styles.levelBtn,
                          styles[`level${l.label}`],
                          { [styles.levelActive]: risk.residual_impact === l.value }
                        )}
                        onClick={() => updateRisk.mutate({ id: risk.id, body: { residual_impact: l.value } })}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {risks.length === 0 && (
          <div className={styles.card}>
            <p className={styles.emptyState}>No risks to rate. Go back to Step 3.</p>
          </div>
        )}
      </div>
    </div>
  );
}
