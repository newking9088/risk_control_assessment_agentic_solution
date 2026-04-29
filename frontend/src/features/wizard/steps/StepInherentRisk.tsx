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
  inherent_likelihood: string | null;
  inherent_impact: string | null;
}

const LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export function StepInherentRisk({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data: risks = [] } = useQuery<Risk[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  const allRated = risks.length > 0 && risks.every((r) => r.inherent_likelihood && r.inherent_impact);

  useEffect(() => {
    onValidChange(allRated);
  }, [allRated, onValidChange]);

  const updateRisk = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Risk> }) =>
      api.patch(`/api/v1/assessments/${assessmentId}/risks/${id}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risks", assessmentId] }),
  });

  const rated = risks.filter((r) => r.inherent_likelihood && r.inherent_impact).length;

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Inherent Risk Rating</h2>
        <p className={styles.stepDesc}>
          Rate each risk before controls are applied — likelihood × impact.
          <span className={styles.progressHint}>{rated} / {risks.length} rated</span>
        </p>
      </div>

      <div className={styles.ratingLayout}>
        {risks.map((risk) => (
          <div key={risk.id} className={styles.riskRatingCard}>
            <div className={styles.riskRatingHeader}>
              <span className={styles.riskRatingName}>{risk.name}</span>
              <span className={styles.riskRatingCategory}>{risk.source} · {risk.category}</span>
            </div>
            <div className={styles.ratingPanels}>
              <div className={styles.ratingPanel}>
                <p className={styles.ratingPanelLabel}>Likelihood</p>
                <div className={styles.levelButtons}>
                  {LEVELS.map((l) => (
                    <button
                      key={l.value}
                      className={clsx(
                        styles.levelBtn,
                        styles[`level${l.label}`],
                        { [styles.levelActive]: risk.inherent_likelihood === l.value }
                      )}
                      onClick={() => updateRisk.mutate({ id: risk.id, body: { inherent_likelihood: l.value } })}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.ratingPanel}>
                <p className={styles.ratingPanelLabel}>Impact</p>
                <div className={styles.levelButtons}>
                  {LEVELS.map((l) => (
                    <button
                      key={l.value}
                      className={clsx(
                        styles.levelBtn,
                        styles[`level${l.label}`],
                        { [styles.levelActive]: risk.inherent_impact === l.value }
                      )}
                      onClick={() => updateRisk.mutate({ id: risk.id, body: { inherent_impact: l.value } })}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        {risks.length === 0 && (
          <div className={styles.card}>
            <p className={styles.emptyState}>No risks identified. Go back to Step 3 to add risks first.</p>
          </div>
        )}
      </div>
    </div>
  );
}
