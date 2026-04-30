import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import clsx from "clsx";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

// ── Types ─────────────────────────────────────────────────────
interface Risk {
  id: string;
  name: string;
  category: string;
  source: string;
  applicable: boolean | null;
  inherent_likelihood: string | null;
  inherent_impact: string | null;
}

interface Control {
  id: string;
  risk_id: string;
  name: string;
  control_ref: string | null;
  type: string | null;
  is_key: boolean;
  description: string | null;
  design_effectiveness: number | null;
  operating_effectiveness: number | null;
  overall_effectiveness: string | null;
  rationale: string | null;
}

interface CatalogControl {
  id: string;
  name: string;
  control_type: string | null;
  is_key_control: boolean;
  description: string | null;
}

// ── Constants ─────────────────────────────────────────────────
const TYPES = ["Preventive", "Detective", "Corrective", "Directive"];

const EFF_INT_LABELS: Record<number, string> = {
  1: "Ineffective",
  2: "Partially Effective",
  3: "Needs Improvement",
  4: "Effective",
};

const OVERALL_OPTIONS = [
  "Effective",
  "Partially Effective",
  "Needs Improvement",
  "Ineffective",
  "Not Tested",
];

const RATING_MATRIX: Record<string, Record<string, string>> = {
  low:      { low: "low",    medium: "low",    high: "medium",   critical: "medium"   },
  medium:   { low: "low",    medium: "medium",  high: "high",     critical: "high"     },
  high:     { low: "medium", medium: "high",    high: "high",     critical: "critical" },
  critical: { low: "medium", medium: "high",    high: "critical", critical: "critical" },
};

function computeInherentRating(likelihood: string | null, impact: string | null) {
  if (!likelihood || !impact) return null;
  return RATING_MATRIX[likelihood]?.[impact] ?? null;
}

function overallFromInts(design: number | null, operating: number | null): string | null {
  if (!design || !operating) return null;
  const avg = (design + operating) / 2;
  if (avg >= 3.5) return "Effective";
  if (avg >= 2.5) return "Needs Improvement";
  if (avg >= 1.5) return "Partially Effective";
  return "Ineffective";
}

function effColor(val: string | null) {
  if (!val) return styles.ecEffNull;
  if (val === "Effective")           return styles.ecEffEffective;
  if (val === "Partially Effective") return styles.ecEffPartial;
  if (val === "Needs Improvement")   return styles.ecEffNeeds;
  if (val === "Ineffective")         return styles.ecEffIneffective;
  return styles.ecEffNull;
}

function inherentBadgeClass(rating: string | null) {
  if (!rating) return styles.ecBadgeNull;
  if (rating === "low")      return styles.ecBadgeLow;
  if (rating === "medium")   return styles.ecBadgeMedium;
  if (rating === "high")     return styles.ecBadgeHigh;
  if (rating === "critical") return styles.ecBadgeCritical;
  return styles.ecBadgeNull;
}

// ── Main component ────────────────────────────────────────────
export function StepEvaluateControls({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data: allRisks = [] } = useQuery<Risk[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  const { data: controls = [] } = useQuery<Control[]>({
    queryKey: ["controls", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/controls`).then((r) => r.json()),
  });

  const risks = allRisks.filter((r) => r.applicable === true);

  // Expand state — first risk open by default
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (risks.length > 0 && expanded.size === 0) {
      setExpanded(new Set([risks[0].id]));
    }
  }, [risks]); // eslint-disable-line react-hooks/exhaustive-deps

  const risksWithControls = risks.filter((r) => controls.some((c) => c.risk_id === r.id)).length;
  const allHaveControls   = risks.length > 0 && risksWithControls === risks.length;

  useEffect(() => {
    onValidChange(controls.length > 0);
  }, [controls, onValidChange]);

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(risks.map((r) => r.id)));
  }

  const addControl = useMutation({
    mutationFn: (body: { risk_id: string; name: string; type: string; is_key: boolean; description: string }) =>
      api.post(`/api/v1/assessments/${assessmentId}/controls`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["controls", assessmentId] }),
  });

  const updateControl = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/assessments/${assessmentId}/controls/${id}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["controls", assessmentId] }),
  });

  const deleteControl = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/assessments/${assessmentId}/controls/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["controls", assessmentId] }),
  });

  if (risks.length === 0) {
    return (
      <div className={styles.step}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Evaluate Controls</h2>
        </div>
        <div className={styles.card}>
          <p className={styles.emptyState}>No applicable risks found. Go back to Step 3 to mark risks as applicable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Evaluate Controls</h2>
        <p className={styles.stepDesc}>
          Map and rate controls for each applicable risk.
          <span className={styles.progressHint}>{risksWithControls} / {risks.length} risks have controls</span>
          {!allHaveControls && (
            <span className={styles.reviewHint}>{risks.length - risksWithControls} without controls</span>
          )}
        </p>
      </div>

      {/* Expand all */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
        <button type="button" className={styles.ecExpandAllBtn} onClick={expandAll}>
          Expand All
        </button>
      </div>

      {/* Risk accordions */}
      {risks.map((risk) => {
        const riskControls = controls.filter((c) => c.risk_id === risk.id);
        const isOpen       = expanded.has(risk.id);
        const irRating     = computeInherentRating(risk.inherent_likelihood, risk.inherent_impact);
        const ctrlCount    = riskControls.length;

        return (
          <div key={risk.id} className={styles.ecAccordion}>
            {/* Accordion header */}
            <button
              type="button"
              className={styles.ecAccordionHeader}
              onClick={() => toggleExpand(risk.id)}
            >
              <span className={clsx(
                styles.ecSourceBadge,
                risk.source === "EXT" ? styles.ecBadgeExt : styles.ecBadgeInt
              )}>
                {risk.source === "EXT" ? "External" : "Insider"}
              </span>
              <span className={styles.ecRiskName}>{risk.name}</span>
              <span className={styles.ecRiskCategory}>{risk.category}</span>
              {irRating && (
                <span className={clsx(styles.ecInherentBadge, inherentBadgeClass(irRating))}>
                  Inherent: {irRating.charAt(0).toUpperCase() + irRating.slice(1)}
                </span>
              )}
              <span className={clsx(styles.ecCtrlCount, ctrlCount === 0 && styles.ecCtrlCountZero)}>
                {ctrlCount === 0 ? "No controls" : `${ctrlCount} control${ctrlCount !== 1 ? "s" : ""}`}
              </span>
              <span className={styles.ecChevron}>{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div className={styles.ecAccordionBody}>
                {riskControls.length === 0 ? (
                  <div className={styles.ecEmptyControls}>
                    No controls mapped yet. Add a control below.
                  </div>
                ) : (
                  <div className={styles.ecTableWrapper}>
                    <table className={styles.ecTable}>
                      <thead>
                        <tr>
                          <th>Ref</th>
                          <th>Control Name</th>
                          <th>Type</th>
                          <th>Key</th>
                          <th>Design Effectiveness</th>
                          <th>Operating Effectiveness</th>
                          <th>Overall Effectiveness</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {riskControls.map((ctrl, idx) => (
                          <ControlRow
                            key={ctrl.id}
                            ctrl={ctrl}
                            idx={idx}
                            onUpdate={(body) => updateControl.mutate({ id: ctrl.id, body })}
                            onDelete={() => deleteControl.mutate(ctrl.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <AddControlRow
                  riskId={risk.id}
                  assessmentId={assessmentId}
                  onAdd={(body) => addControl.mutate({ ...body, risk_id: risk.id })}
                  isPending={addControl.isPending}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Control row ───────────────────────────────────────────────

function ControlRow({
  ctrl, idx,
  onUpdate, onDelete,
}: {
  ctrl: Control; idx: number;
  onUpdate: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [rationale, setRationale] = useState(ctrl.rationale ?? "");

  useEffect(() => { setRationale(ctrl.rationale ?? ""); }, [ctrl.rationale]);

  function handleDesign(val: string) {
    const design = Number(val);
    const overall = overallFromInts(design, ctrl.operating_effectiveness);
    onUpdate({ design_effectiveness: design, ...(overall ? { overall_effectiveness: overall } : {}) });
  }

  function handleOperating(val: string) {
    const operating = Number(val);
    const overall = overallFromInts(ctrl.design_effectiveness, operating);
    onUpdate({ operating_effectiveness: operating, ...(overall ? { overall_effectiveness: overall } : {}) });
  }

  return (
    <tr className={styles.ecRow}>
      <td className={styles.ecRefCell}>
        <span className={styles.ecRefBadge}>{ctrl.control_ref || `C-${idx + 1}`}</span>
      </td>
      <td className={styles.ecNameCell}>
        <div className={styles.ecCtrlName}>{ctrl.name}</div>
        {ctrl.description && <div className={styles.ecCtrlDesc}>{ctrl.description}</div>}
        {ctrl.is_key && <span className={styles.ecKeyBadge}>Key</span>}
      </td>
      <td>
        <select
          className={styles.ecTypeSelect}
          value={ctrl.type ?? ""}
          onChange={(e) => onUpdate({ type: e.target.value })}
        >
          <option value="">—</option>
          {["Preventive","Detective","Corrective","Directive"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="checkbox"
          checked={ctrl.is_key}
          onChange={(e) => onUpdate({ is_key: e.target.checked })}
          title="Key control"
        />
      </td>
      <td>
        <select
          className={clsx(styles.ecEffSelect, effColor(
            ctrl.design_effectiveness ? EFF_INT_LABELS[ctrl.design_effectiveness] : null
          ))}
          value={ctrl.design_effectiveness ?? ""}
          onChange={(e) => handleDesign(e.target.value)}
        >
          <option value="">— Select —</option>
          {[1, 2, 3, 4].map((v) => (
            <option key={v} value={v}>{EFF_INT_LABELS[v]}</option>
          ))}
        </select>
      </td>
      <td>
        <select
          className={clsx(styles.ecEffSelect, effColor(
            ctrl.operating_effectiveness ? EFF_INT_LABELS[ctrl.operating_effectiveness] : null
          ))}
          value={ctrl.operating_effectiveness ?? ""}
          onChange={(e) => handleOperating(e.target.value)}
        >
          <option value="">— Select —</option>
          {[1, 2, 3, 4].map((v) => (
            <option key={v} value={v}>{EFF_INT_LABELS[v]}</option>
          ))}
        </select>
      </td>
      <td>
        <select
          className={clsx(styles.ecEffSelect, effColor(ctrl.overall_effectiveness))}
          value={ctrl.overall_effectiveness ?? ""}
          onChange={(e) => onUpdate({ overall_effectiveness: e.target.value })}
        >
          <option value="">— Select —</option>
          {["Effective","Partially Effective","Needs Improvement","Ineffective","Not Tested"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </td>
      <td>
        <button
          type="button"
          className={styles.ecUnmapBtn}
          onClick={onDelete}
          title="Remove control"
        >
          Unmap
        </button>
      </td>
    </tr>
  );
}

// ── Add control inline form ───────────────────────────────────

function AddControlRow({
  riskId, assessmentId, onAdd, isPending,
}: {
  riskId: string;
  assessmentId: string;
  onAdd: (body: { name: string; type: string; is_key: boolean; description: string }) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "Preventive", is_key: false, description: "" });

  // Catalog import
  const [showCatalog, setShowCatalog] = useState(false);
  const { data: catalog = [] } = useQuery<CatalogControl[]>({
    queryKey: ["catalog-controls"],
    queryFn: () => api.get("/api/v1/controls").then((r) => r.json()),
    enabled: showCatalog,
  });

  const qc = useQueryClient();
  const importCtrl = useMutation({
    mutationFn: (c: CatalogControl) =>
      api.post(`/api/v1/assessments/${assessmentId}/controls`, {
        risk_id: riskId,
        name: c.name,
        type: c.control_type ?? "Preventive",
        is_key: c.is_key_control,
        description: c.description ?? "",
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["controls", assessmentId] });
      setShowCatalog(false);
    },
  });

  function handleAdd() {
    if (!form.name.trim()) return;
    onAdd(form);
    setForm({ name: "", type: "Preventive", is_key: false, description: "" });
    setOpen(false);
  }

  return (
    <div className={styles.ecAddArea}>
      {showCatalog && (
        <div className={styles.ecCatalogDropdown}>
          <div className={styles.ecCatalogHeader}>
            Import from Catalog
            <button type="button" className={styles.ecCatalogClose} onClick={() => setShowCatalog(false)}>✕</button>
          </div>
          {catalog.length === 0 ? (
            <div className={styles.ecCatalogEmpty}>No controls in catalog yet.</div>
          ) : (
            catalog.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.ecCatalogItem}
                onClick={() => importCtrl.mutate(c)}
                disabled={importCtrl.isPending}
              >
                <span className={styles.ecCtrlName}>{c.name}</span>
                {c.control_type && <span className={styles.ecCatalogType}>{c.control_type}</span>}
                {c.is_key_control && <span className={styles.ecKeyBadge}>Key</span>}
              </button>
            ))
          )}
        </div>
      )}

      {open ? (
        <div className={styles.ecAddForm}>
          <input
            className={styles.inputSm}
            placeholder="Control name *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className={styles.inlineRow} style={{ marginTop: "0.4rem" }}>
            <select
              className={styles.selectSm}
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <label className={styles.ecKeyLabel}>
              <input
                type="checkbox"
                checked={form.is_key}
                onChange={(e) => setForm((f) => ({ ...f, is_key: e.target.checked }))}
              />
              Key control
            </label>
            <button className={styles.addBtn} disabled={!form.name.trim() || isPending} onClick={handleAdd}>
              {isPending ? "Adding…" : "+ Add"}
            </button>
            <button type="button" className={styles.deleteBtn} onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <textarea
            className={styles.noteInput}
            placeholder="Description (optional)"
            rows={2}
            value={form.description}
            style={{ marginTop: "0.4rem" }}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      ) : (
        <div className={styles.ecAddBtns}>
          <button type="button" className={styles.ecLinkBtn} onClick={() => setOpen(true)}>
            + Link Control
          </button>
          <button
            type="button"
            className={styles.ecCatalogBtn}
            onClick={() => setShowCatalog((v) => !v)}
          >
            ⬇ Import from Catalog
          </button>
        </div>
      )}
    </div>
  );
}
