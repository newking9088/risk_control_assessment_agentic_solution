import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Maximize2 } from "lucide-react";
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

interface Assessment {
  id: string;
  title: string;
}

function sourceToL1(source: "EXT" | "INT"): string {
  return source === "INT" ? "Internal/Insider Fraud/Risk" : "External Fraud/Risk";
}

export function StepIdentifyRisks({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data: assessment } = useQuery<Assessment>({
    queryKey: ["assessment", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}`).then((r) => r.json()),
  });

  const { data: risks = [], isLoading } = useQuery<RiskRecord[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  const [search, setSearch]       = useState("");
  const [l1Filter, setL1Filter]   = useState("All");
  const [l2Filter, setL2Filter]   = useState("All");
  const [importMsg, setImportMsg] = useState("");

  const decidedCount = risks.filter((r) => r.applicable !== null).length;
  const allDecided   = risks.length > 0 && decidedCount === risks.length;

  useEffect(() => {
    onValidChange(allDecided);
  }, [allDecided, onValidChange]);

  const l1Options = ["All", ...new Set(risks.map((r) => sourceToL1(r.source)))].sort();
  const l2Options = ["All", ...new Set(risks.map((r) => r.category).filter(Boolean))].sort();

  const visible = risks.filter((r) => {
    if (l1Filter !== "All" && sourceToL1(r.source) !== l1Filter) return false;
    if (l2Filter !== "All" && r.category !== l2Filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const patchRisk = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/assessments/${assessmentId}/risks/${id}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risks", assessmentId] }),
  });

  const importMut = useMutation<{ imported: number; skipped: number }, Error, void>({
    mutationFn: () =>
      api.post(`/api/v1/assessments/${assessmentId}/risks/import-from-taxonomy`, {}).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["risks", assessmentId] });
      setImportMsg(`Imported ${data.imported} risks (${data.skipped} already present)`);
      setTimeout(() => setImportMsg(""), 4000);
    },
  });

  function toggleApplicable(risk: RiskRecord) {
    const newVal = risk.applicable !== true;
    patchRisk.mutate({
      id: risk.id,
      body: { applicable: newVal, decision_basis: "manual", confidence_label: "manual" },
    });
  }

  const assessmentTitle = assessment?.title ?? "This Assessment Unit";

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Step 3: Identify Relevant Risks (AI Suggested)</h2>
        <p className={styles.stepDesc}>Select applicable risks for this assessment unit</p>
      </div>

      {/* ── Filter row ── */}
      <div className={styles.riskFilterCard}>
      <div className={styles.riskFilterRow}>
        <div className={clsx(styles.riskFilterGroup, styles.riskFilterGroupWide)}>
          <label className={styles.riskFilterLabel}>Search</label>
          <input
            className={styles.riskFilterSearch}
            type="text"
            placeholder="Search risk statement, name, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.riskFilterGroup}>
          <label className={styles.riskFilterLabel}>L1 Risk Type</label>
          <select
            className={styles.riskFilterSelect}
            value={l1Filter}
            onChange={(e) => { setL1Filter(e.target.value); setL2Filter("All"); }}
          >
            {l1Options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className={styles.riskFilterGroup}>
          <label className={styles.riskFilterLabel}>L2 Risk Type</label>
          <select
            className={styles.riskFilterSelect}
            value={l2Filter}
            onChange={(e) => setL2Filter(e.target.value)}
          >
            {l2Options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      </div>

      {importMsg && <div className={styles.importBanner}>{importMsg}</div>}

      {/* ── Risk Table ── */}
      <div className={styles.riskTableCard}>
        <div className={styles.riskTableSectionHeader}>
          <span className={styles.riskTableSectionTitle}>
            Applicable Fraud Risks for {assessmentTitle}
          </span>
          <div className={styles.riskTableActions}>
            <button
              type="button"
              className={styles.riskIconBtn}
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending}
              title="Load from Taxonomy"
            >
              <RotateCcw size={14} />
            </button>
            <button type="button" className={styles.riskIconBtn} title="Expand view">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className={styles.emptyState} style={{ padding: "3rem" }}>Loading risks…</div>
        ) : risks.length === 0 ? (
          <div className={styles.emptyState} style={{ padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</div>
            <p style={{ margin: "0 0 0.75rem", fontWeight: 600, color: "#1e293b" }}>No risks loaded yet</p>
            <p style={{ margin: "0 0 1rem", color: "#64748b", fontSize: "0.825rem" }}>
              Click the refresh icon above to load risks from the NGC taxonomy.
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
                <th className={styles.riskThL1}>L1 Risk</th>
                <th className={styles.riskThL2}>L2 Risk</th>
                <th className={styles.riskThL3}>L3 Risk</th>
                <th className={styles.riskThApplicable}>Applicable</th>
                <th className={styles.riskThStatement}>Risk Statement</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <RiskRow
                  key={r.id}
                  risk={r}
                  onToggle={() => toggleApplicable(r)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.riskDecidedBar}>
        <span className={styles.riskDecidedCount}>
          {decidedCount} of {risks.length} risks marked applicable
        </span>
        {risks.length > 0 && !allDecided && (
          <span className={styles.riskUndecidedHint}>
            {risks.length - decidedCount} not yet decided
          </span>
        )}
      </div>
    </div>
  );
}

// ── Risk Row ─────────────────────────────────────────────────

interface RiskRowProps {
  risk: RiskRecord;
  onToggle: () => void;
}

function RiskRow({ risk, onToggle }: RiskRowProps) {
  const isOn = risk.applicable === true;

  return (
    <tr className={styles.riskRow}>
      <td className={styles.riskL1Cell}>{sourceToL1(risk.source)}</td>
      <td className={styles.riskL2Cell}>{risk.category}</td>
      <td className={styles.riskL3Cell}>
        <div className={styles.riskL3Inner}>
          <span className={styles.riskL3Name}>{risk.name}</span>
          <button type="button" className={styles.riskInfoBtn} title="More info">?</button>
        </div>
      </td>
      <td className={styles.riskApplicableCell}>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          className={clsx(styles.riskToggleTrack, isOn && styles.riskToggleTrackOn)}
          onClick={onToggle}
        >
          <span className={styles.riskToggleThumb} />
        </button>
      </td>
      <td className={styles.riskStatementCell}>
        <p className={styles.riskStatementText}>
          {risk.description ?? risk.name}
        </p>
        <div className={styles.riskStatementFooter}>
          <span className={styles.riskEvidenceTag}>
            Evidence: <strong>Questionnaire QA</strong>
          </span>
          <span className={styles.riskAiBadge}>AI</span>
        </div>
      </td>
    </tr>
  );
}
