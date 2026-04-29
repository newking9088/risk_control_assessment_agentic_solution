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
  source: string;
  inherent_likelihood: string;
  inherent_impact: string;
}

interface Control {
  id: string;
  risk_id: string;
  name: string;
  control_ref: string;
  type: string;
  is_key: boolean;
  description: string;
  design_effectiveness: number;
  operating_effectiveness: number;
  overall_effectiveness: string;
  rationale: string;
}

const EFFECTIVENESS_LABELS: Record<number, string> = {
  1: "1 - Ineffective",
  2: "2 - Partially Effective",
  3: "3 - Needs Improvement",
  4: "4 - Effective",
};

const OVERALL_OPTIONS = ["Effective", "Partially Effective", "Needs Improvement", "Ineffective", "Not Tested"];

const TYPES = ["Preventive", "Detective", "Corrective", "Directive"];

function overallColor(val: string) {
  if (val === "Effective") return styles.effective;
  if (val === "Partially Effective") return styles.partial;
  return styles["needs-improvement"];
}

function inherentLevel(likelihood: string, impact: string) {
  const score = (score_of(likelihood) ?? 0) * (score_of(impact) ?? 0);
  if (score >= 12) return "Critical";
  if (score >= 6) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

function score_of(l: string) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[l] ?? 0;
}

export function StepEvaluateControls({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [showAddControl, setShowAddControl] = useState(false);
  const [newCtrl, setNewCtrl] = useState({ name: "", type: TYPES[0], is_key: false, description: "" });

  const { data: risks = [] } = useQuery<Risk[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  const { data: controls = [] } = useQuery<Control[]>({
    queryKey: ["controls", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/controls`).then((r) => r.json()),
  });

  const selectedRisk = risks.find((r) => r.id === selectedRiskId) ?? risks[0] ?? null;
  const riskControls = controls.filter((c) => c.risk_id === (selectedRisk?.id ?? ""));

  useEffect(() => {
    if (risks.length > 0 && !selectedRiskId) setSelectedRiskId(risks[0].id);
  }, [risks, selectedRiskId]);

  useEffect(() => {
    onValidChange(controls.length > 0);
  }, [controls, onValidChange]);

  const addControl = useMutation({
    mutationFn: (body: typeof newCtrl & { risk_id: string }) =>
      api.post(`/api/v1/assessments/${assessmentId}/controls`, body).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["controls", assessmentId] });
      setNewCtrl({ name: "", type: TYPES[0], is_key: false, description: "" });
      setShowAddControl(false);
    },
  });

  const updateControl = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Control> }) =>
      api.patch(`/api/v1/assessments/${assessmentId}/controls/${id}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["controls", assessmentId] }),
  });

  const deleteControl = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/assessments/${assessmentId}/controls/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["controls", assessmentId] }),
  });

  const controlCountFor = (riskId: string) => controls.filter((c) => c.risk_id === riskId).length;

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Evaluate Controls</h2>
        <p className={styles.stepDesc}>Map and rate controls for each applicable risk.</p>
      </div>

      <div className={styles.splitLayout}>
        {/* Left panel — risk list */}
        <div>
          <div className={styles.riskList}>
            <div className={styles.riskListHeader}>Applicable Risks</div>
            {risks.map((r) => {
              const count = controlCountFor(r.id);
              const isNew = count === 0;
              return (
                <button
                  key={r.id}
                  className={clsx(styles.riskCard, { [styles.riskCardActive]: selectedRisk?.id === r.id })}
                  onClick={() => setSelectedRiskId(r.id)}
                >
                  <span className={clsx(styles.riskTypeTag, r.source === "EXT" ? styles.ext : styles.int)}>
                    {r.source}
                  </span>
                  <span className={styles.riskCardName}>{r.name}</span>
                  <div className={styles.riskCardMeta}>
                    <span className={styles.controlCount}>{count} control{count !== 1 ? "s" : ""}</span>
                    {isNew && <span className={styles.newBadge}>New</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel — control detail */}
        {selectedRisk ? (
          <div className={styles.controlDetailPanel}>
            <div className={styles.controlDetailHeader}>
              <div>
                <p style={{ fontSize: "0.7rem", color: "#64748b", margin: "0 0 0.2rem" }}>
                  {selectedRisk.source} risk
                </p>
                <span className={styles.controlDetailTitle}>{selectedRisk.name}</span>
              </div>
              <div className={styles.controlDetailBadges}>
                <span className={clsx(styles.badge, styles[inherentLevel(selectedRisk.inherent_likelihood, selectedRisk.inherent_impact).toLowerCase()])}>
                  Inherent: {inherentLevel(selectedRisk.inherent_likelihood, selectedRisk.inherent_impact)}
                </span>
                {riskControls.length > 0 && (
                  <span className={clsx(styles.badge, overallColor(riskControls[0].overall_effectiveness))}>
                    Controls: {riskControls[0].overall_effectiveness || "Not Assessed"}
                  </span>
                )}
              </div>
            </div>

            <div className={styles.controlsList}>
              {riskControls.length === 0 && (
                <div className={styles.emptyState}>
                  No controls mapped yet. Add your first control below.
                </div>
              )}

              {riskControls.map((ctrl, idx) => (
                <div key={ctrl.id} className={styles.controlRow}>
                  <div className={styles.controlRowHeader}>
                    <span className={styles.controlId}>{ctrl.control_ref || `CT-${idx + 1}`}</span>
                    <span className={styles.controlName}>{ctrl.name}</span>
                    {ctrl.is_key && <span className={styles.keyBadge}>Key</span>}
                    <button className={styles.unmapBtn} onClick={() => deleteControl.mutate(ctrl.id)}>
                      Unmap control
                    </button>
                  </div>

                  <p className={styles.controlDesc}>{ctrl.description}</p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.65rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#475569" }}>Control Effectiveness</span>
                    <select
                      className={styles.selectSm}
                      value={ctrl.overall_effectiveness || ""}
                      onChange={(e) => updateControl.mutate({ id: ctrl.id, body: { overall_effectiveness: e.target.value } })}
                    >
                      <option value="">— Select —</option>
                      {OVERALL_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </div>

                  <div className={styles.effectivenessGrid}>
                    <div className={styles.effectivenessRow}>
                      <span className={styles.effectivenessLabel}>Design Effectiveness</span>
                      <div className={styles.sliderRow}>
                        <span className={styles.sliderMin}>1</span>
                        <input
                          type="range"
                          min={1}
                          max={4}
                          value={ctrl.design_effectiveness || 1}
                          className={styles.slider}
                          onChange={(e) =>
                            updateControl.mutate({ id: ctrl.id, body: { design_effectiveness: Number(e.target.value) } })
                          }
                        />
                        <span className={styles.sliderMax}>4</span>
                      </div>
                      <span className={styles.sliderRating}>
                        {EFFECTIVENESS_LABELS[ctrl.design_effectiveness] ?? "Not rated"}
                      </span>
                    </div>

                    <div className={styles.effectivenessRow}>
                      <span className={styles.effectivenessLabel}>Operating Effectiveness</span>
                      <div className={styles.sliderRow}>
                        <span className={styles.sliderMin}>1</span>
                        <input
                          type="range"
                          min={1}
                          max={4}
                          value={ctrl.operating_effectiveness || 1}
                          className={styles.slider}
                          onChange={(e) =>
                            updateControl.mutate({ id: ctrl.id, body: { operating_effectiveness: Number(e.target.value) } })
                          }
                        />
                        <span className={styles.sliderMax}>4</span>
                      </div>
                      <span className={styles.sliderRating}>
                        {EFFECTIVENESS_LABELS[ctrl.operating_effectiveness] ?? "Not rated"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className={styles.rationaleLabel}>Overall Rationale</p>
                    <textarea
                      className={styles.noteInput}
                      rows={2}
                      value={ctrl.rationale || ""}
                      placeholder="Explain overall effectiveness assessment…"
                      onChange={(e) =>
                        updateControl.mutate({ id: ctrl.id, body: { rationale: e.target.value } })
                      }
                    />
                  </div>
                </div>
              ))}

              {/* Add control form */}
              {showAddControl ? (
                <div className={styles.controlRow}>
                  <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#374151", margin: "0 0 0.6rem" }}>
                    New Control
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <input
                      className={styles.inputSm}
                      placeholder="Control name"
                      value={newCtrl.name}
                      onChange={(e) => setNewCtrl((c) => ({ ...c, name: e.target.value }))}
                    />
                    <div className={styles.inlineRow}>
                      <select
                        className={styles.selectSm}
                        value={newCtrl.type}
                        onChange={(e) => setNewCtrl((c) => ({ ...c, type: e.target.value }))}
                      >
                        {TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.3rem", color: "#374151" }}>
                        <input
                          type="checkbox"
                          checked={newCtrl.is_key}
                          onChange={(e) => setNewCtrl((c) => ({ ...c, is_key: e.target.checked }))}
                        />
                        Key control
                      </label>
                    </div>
                    <textarea
                      className={styles.noteInput}
                      placeholder="Control description"
                      rows={2}
                      value={newCtrl.description}
                      onChange={(e) => setNewCtrl((c) => ({ ...c, description: e.target.value }))}
                    />
                    <div className={styles.inlineRow}>
                      <button
                        className={styles.addBtn}
                        disabled={!newCtrl.name.trim() || addControl.isPending}
                        onClick={() => addControl.mutate({ ...newCtrl, risk_id: selectedRisk.id })}
                      >
                        {addControl.isPending ? "Adding…" : "Add Control"}
                      </button>
                      <button
                        onClick={() => setShowAddControl(false)}
                        style={{ fontSize: "0.8rem", background: "none", border: "none", color: "#64748b", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "0.75rem 1.25rem" }}>
                  <button
                    className={styles.addBtn}
                    onClick={() => setShowAddControl(true)}
                  >
                    + Add Control
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.card}>
            <p className={styles.emptyState}>No risks identified. Go back to Step 3 to add risks first.</p>
          </div>
        )}
      </div>
    </div>
  );
}
