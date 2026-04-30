import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import clsx from "clsx";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

interface RiskRecord {
  id: string;
  assessment_id: string;
  name: string;
  category: string;
  source: "EXT" | "INT";
  description: string | null;
  applicable: boolean | null;
  rationale: string | null;
  applicability_confidence: number | null;
  confidence_label: string | null;
  decision_basis: string | null;
  requires_review: boolean;
  taxonomy_risk_id: string | null;
}

type SourceFilter = "ALL" | "EXT" | "INT";

export function StepIdentifyRisks({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data: risks = [], isLoading } = useQuery<RiskRecord[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  // local rationale drafts (avoids full refetch on every keystroke)
  const [rationaleMap, setRationaleMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const map: Record<string, string> = {};
    risks.forEach((r) => { map[r.id] = r.rationale ?? ""; });
    setRationaleMap(map);
  }, [risks]);

  // Filter state
  const [search, setSearch]             = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [undecidedOnly, setUndecidedOnly] = useState(false);

  const decidedCount = risks.filter((r) => r.applicable !== null).length;
  const allDecided   = risks.length > 0 && decidedCount === risks.length;

  useEffect(() => {
    onValidChange(allDecided);
  }, [allDecided, onValidChange]);

  const categories = [...new Set(risks.map((r) => r.category).filter(Boolean))].sort();

  // Filtered view
  const visible = risks.filter((r) => {
    if (sourceFilter !== "ALL" && r.source !== sourceFilter) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (undecidedOnly && r.applicable !== null) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.rationale ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Mutations
  const patchRisk = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/assessments/${assessmentId}/risks/${id}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risks", assessmentId] }),
  });

  const importMut = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/assessments/${assessmentId}/risks/import-from-taxonomy`, {}).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["risks", assessmentId] });
      setImportMsg(`Imported ${data.imported} risks (${data.skipped} already present)`);
      setTimeout(() => setImportMsg(""), 4000);
    },
  });

  const [importMsg, setImportMsg] = useState("");

  function setApplicable(risk: RiskRecord, value: boolean) {
    patchRisk.mutate({ id: risk.id, body: { applicable: value, decision_basis: "manual", confidence_label: "manual" } });
  }

  function saveRationale(risk: RiskRecord) {
    const val = rationaleMap[risk.id] ?? "";
    if (val !== (risk.rationale ?? "")) {
      patchRisk.mutate({ id: risk.id, body: { rationale: val } });
    }
  }

  const SOURCE_BTNS: { value: SourceFilter; label: string }[] = [
    { value: "ALL", label: "All Sources" },
    { value: "EXT", label: "External Fraud" },
    { value: "INT", label: "Insider Threat" },
  ];

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Identify Relevant Risks</h2>
        <p className={styles.stepDesc}>
          Decide which risks are applicable to this assessment. Provide a rationale for each decision.
          <span className={styles.progressHint}>{decidedCount} of {risks.length} decided</span>
          {risks.length > 0 && !allDecided && (
            <span className={styles.reviewHint}>{risks.length - decidedCount} undecided</span>
          )}
        </p>
      </div>

      {/* Toolbar */}
      <div className={styles.riskToolbar}>
        <div className={styles.riskToolbarLeft}>
          <input
            className={styles.riskSearch}
            type="text"
            placeholder="Search risks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={styles.riskCategorySelect}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className={styles.riskSourceBtns}>
            {SOURCE_BTNS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={clsx(styles.riskSourceBtn, { [styles.riskSourceBtnActive]: sourceFilter === value })}
                onClick={() => setSourceFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={clsx(styles.riskUndecidedBtn, { [styles.riskUndecidedBtnActive]: undecidedOnly })}
            onClick={() => setUndecidedOnly((v) => !v)}
          >
            Undecided only
          </button>
        </div>

        <div className={styles.riskToolbarRight}>
          <span className={styles.riskCount}>{visible.length} risks</span>
          <button
            type="button"
            className={styles.importBtn}
            disabled={importMut.isPending}
            onClick={() => importMut.mutate()}
          >
            {importMut.isPending ? "Importing…" : "⬇ Load from Taxonomy"}
          </button>
        </div>
      </div>

      {importMsg && <div className={styles.importBanner}>{importMsg}</div>}

      {/* Table */}
      <div className={styles.riskTableCard}>
        {isLoading ? (
          <div className={styles.emptyState} style={{ padding: "3rem" }}>Loading risks…</div>
        ) : risks.length === 0 ? (
          <div className={styles.emptyState} style={{ padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</div>
            <p style={{ margin: "0 0 0.75rem", fontWeight: 600, color: "#1e293b" }}>No risks loaded yet</p>
            <p style={{ margin: "0 0 1rem", color: "#64748b", fontSize: "0.825rem" }}>
              Click "Load from Taxonomy" to import risks from your active taxonomy, or add them manually below.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className={styles.emptyState} style={{ padding: "2rem", textAlign: "center" }}>
            No risks match the current filters.
          </div>
        ) : (
          <table className={styles.riskTable}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Source</th>
                <th>Risk Name</th>
                <th style={{ width: 160 }}>Applicable?</th>
                <th>Rationale</th>
                <th style={{ width: 90 }}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <RiskRow
                  key={r.id}
                  risk={r}
                  rationale={rationaleMap[r.id] ?? ""}
                  onRationaleChange={(v) => setRationaleMap((m) => ({ ...m, [r.id]: v }))}
                  onRationaleBlur={() => saveRationale(r)}
                  onSetApplicable={(v) => setApplicable(r, v)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual add row */}
      <AddRiskRow assessmentId={assessmentId} onAdded={() => qc.invalidateQueries({ queryKey: ["risks", assessmentId] })} />
    </div>
  );
}

// ── Risk Row ─────────────────────────────────────────────────

interface RiskRowProps {
  risk: RiskRecord;
  rationale: string;
  onRationaleChange: (v: string) => void;
  onRationaleBlur: () => void;
  onSetApplicable: (v: boolean) => void;
}

function RiskRow({ risk, rationale, onRationaleChange, onRationaleBlur, onSetApplicable }: RiskRowProps) {
  const [showRationale, setShowRationale] = useState(false);

  useEffect(() => {
    if (risk.applicable !== null) setShowRationale(true);
  }, [risk.applicable]);

  const confidenceLabel = risk.confidence_label ?? (risk.applicable !== null ? "manual" : null);

  return (
    <tr className={clsx(styles.riskRow, risk.applicable === null && styles.riskRowUndecided)}>
      <td className={styles.riskCategoryCell}>{risk.category}</td>
      <td>
        <span className={clsx(styles.riskSourceBadge, risk.source === "EXT" ? styles.riskBadgeExt : styles.riskBadgeInt)}>
          {risk.source === "EXT" ? "External" : "Insider"}
        </span>
      </td>
      <td className={styles.riskNameCell}>
        <div className={styles.riskName}>{risk.name}</div>
        {risk.description && (
          <div className={styles.riskDesc}>{risk.description}</div>
        )}
      </td>
      <td>
        <div className={styles.applicableToggle}>
          <button
            type="button"
            className={clsx(styles.applicableBtn, styles.applicableBtnYes, risk.applicable === true && styles.applicableBtnYesActive)}
            onClick={() => onSetApplicable(true)}
          >
            ✓ Yes
          </button>
          <button
            type="button"
            className={clsx(styles.applicableBtn, styles.applicableBtnNo, risk.applicable === false && styles.applicableBtnNoActive)}
            onClick={() => onSetApplicable(false)}
          >
            ✗ No
          </button>
        </div>
      </td>
      <td className={styles.rationaleCell}>
        {risk.applicable !== null ? (
          <textarea
            className={styles.rationaleInput}
            placeholder={risk.applicable ? "Why is this risk applicable?" : "Why is this risk not applicable?"}
            value={rationale}
            rows={2}
            onChange={(e) => onRationaleChange(e.target.value)}
            onBlur={onRationaleBlur}
          />
        ) : (
          <span className={styles.rationalePrompt}>Decide applicability first</span>
        )}
      </td>
      <td>
        {confidenceLabel && (
          <span className={clsx(
            styles.confidencePill,
            confidenceLabel === "high"   ? styles.confHigh :
            confidenceLabel === "medium" ? styles.confMedium :
            confidenceLabel === "low"    ? styles.confLow :
            styles.confManual
          )}>
            {confidenceLabel === "manual" ? "Manual" :
             confidenceLabel.charAt(0).toUpperCase() + confidenceLabel.slice(1)}
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Manual Add Row ────────────────────────────────────────────

const CATEGORIES = ["Operational", "Financial", "Compliance", "Technology", "Fraud", "Reputational", "Strategic"];

function AddRiskRow({ assessmentId, onAdded }: { assessmentId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: CATEGORIES[0], source: "EXT", description: "" });

  const add = useMutation({
    mutationFn: (body: typeof form) =>
      api.post(`/api/v1/assessments/${assessmentId}/risks`, body).then((r) => r.json()),
    onSuccess: () => {
      onAdded();
      setForm({ name: "", category: CATEGORIES[0], source: "EXT", description: "" });
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button type="button" className={styles.addRiskOpenBtn} onClick={() => setOpen(true)}>
        + Add Risk Manually
      </button>
    );
  }

  return (
    <div className={styles.addRiskPanel} style={{ marginTop: "0.75rem" }}>
      <p className={styles.addRiskTitle}>Add Risk Manually</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <input
          className={styles.inputSm}
          placeholder="Risk name *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div className={styles.inlineRow}>
          <select className={styles.selectSm} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={styles.selectSm} value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}>
            <option value="EXT">External Fraud</option>
            <option value="INT">Insider Threat</option>
          </select>
          <button className={styles.addBtn} onClick={() => add.mutate(form)} disabled={!form.name.trim() || add.isPending}>
            {add.isPending ? "Adding…" : "+ Add"}
          </button>
          <button className={styles.deleteBtn} onClick={() => setOpen(false)}>Cancel</button>
        </div>
        <input
          className={styles.inputSm}
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
    </div>
  );
}
