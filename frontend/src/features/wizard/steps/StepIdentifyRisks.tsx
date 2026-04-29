import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import clsx from "clsx";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

interface Risk {
  id: string;
  name: string;
  category: string;
  source: "EXT" | "INT";
  description: string;
}

const CATEGORIES = ["Operational", "Financial", "Compliance", "Strategic", "Technology", "Reputational", "Fraud"];

export function StepIdentifyRisks({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();
  const [newRisk, setNewRisk] = useState({ name: "", category: CATEGORIES[0], source: "EXT" as "EXT" | "INT", description: "" });

  const { data: risks = [] } = useQuery<Risk[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  useEffect(() => {
    onValidChange(risks.length > 0);
  }, [risks, onValidChange]);

  const addRisk = useMutation({
    mutationFn: (body: typeof newRisk) =>
      api.post(`/api/v1/assessments/${assessmentId}/risks`, body).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risks", assessmentId] });
      setNewRisk((r) => ({ ...r, name: "", description: "" }));
    },
  });

  const deleteRisk = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/assessments/${assessmentId}/risks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risks", assessmentId] }),
  });

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Identify Risks</h2>
        <p className={styles.stepDesc}>
          Add all risks applicable to this assessment scope using taxonomy categories.
          <span className={styles.progressHint}>{risks.length} risk{risks.length !== 1 ? "s" : ""} identified</span>
        </p>
      </div>

      <div className={styles.splitLayout}>
        {/* Left — risk list */}
        <div>
          <div className={styles.riskList}>
            <div className={styles.riskListHeader}>Identified Risks</div>
            {risks.length === 0 ? (
              <div className={styles.emptyState}>No risks added yet</div>
            ) : (
              risks.map((r) => (
                <div key={r.id} className={styles.riskCard} style={{ cursor: "default" }}>
                  <span className={clsx(styles.riskTypeTag, r.source === "EXT" ? styles.ext : styles.int)}>
                    {r.source}
                  </span>
                  <span className={styles.riskCardName}>{r.name}</span>
                  <div className={styles.riskCardMeta}>
                    <span className={styles.controlCount}>{r.category}</span>
                    <button className={styles.deleteBtn} onClick={() => deleteRisk.mutate(r.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className={styles.addRiskPanel}>
            <p className={styles.addRiskTitle}>Add Risk</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <input
                className={styles.inputSm}
                placeholder="Risk name"
                value={newRisk.name}
                onChange={(e) => setNewRisk((r) => ({ ...r, name: e.target.value }))}
              />
              <div className={styles.inlineRow}>
                <select
                  className={styles.selectSm}
                  value={newRisk.category}
                  onChange={(e) => setNewRisk((r) => ({ ...r, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select
                  className={styles.selectSm}
                  value={newRisk.source}
                  onChange={(e) => setNewRisk((r) => ({ ...r, source: e.target.value as "EXT" | "INT" }))}
                >
                  <option value="EXT">External</option>
                  <option value="INT">Internal</option>
                </select>
                <button
                  className={styles.addBtn}
                  onClick={() => addRisk.mutate(newRisk)}
                  disabled={!newRisk.name.trim() || addRisk.isPending}
                >
                  {addRisk.isPending ? "Adding…" : "+ Add"}
                </button>
              </div>
              <input
                className={styles.inputSm}
                placeholder="Description (optional)"
                value={newRisk.description}
                onChange={(e) => setNewRisk((r) => ({ ...r, description: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Right — guidance */}
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>Risk Taxonomy Guide</h3>
          {[
            { cat: "Operational", desc: "Risks from process failures, human error, or system breakdowns." },
            { cat: "Financial", desc: "Risks of financial loss due to market, credit, or liquidity exposure." },
            { cat: "Compliance", desc: "Risks arising from failure to meet regulatory or legal obligations." },
            { cat: "Strategic", desc: "Risks that threaten the organisation's ability to achieve its goals." },
            { cat: "Technology", desc: "Risks from IT systems, cyber threats, data breaches, or outages." },
            { cat: "Fraud", desc: "Internal or external fraudulent activities causing financial loss or reputational harm." },
            { cat: "Reputational", desc: "Risks that could damage public perception or stakeholder trust." },
          ].map((t) => (
            <div key={t.cat} style={{ marginBottom: "0.75rem" }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#374151", margin: "0 0 0.15rem" }}>{t.cat}</p>
              <p style={{ fontSize: "0.78rem", color: "#64748b", margin: 0, lineHeight: 1.4 }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
