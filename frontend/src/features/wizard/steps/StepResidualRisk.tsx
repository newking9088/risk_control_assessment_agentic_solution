import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2 } from "lucide-react";
import { api } from "@/lib/api";
import clsx from "clsx";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

interface RiskRecord {
  id: string;
  name: string;
  category: string;
  source: "EXT" | "INT";
  applicable: boolean | null;
  taxonomy_risk_id: string | null;
  likelihood_score: number | null;
  financial_impact: number | null;
  regulatory_impact: number | null;
  legal_impact: number | null;
  customer_impact: number | null;
  reputational_impact: number | null;
}

interface Control {
  id: string;
  risk_id: string;
  overall_effectiveness: string | null;
}

// ── Labels ────────────────────────────────────────────────────
const LIKELIHOOD_LABELS: Record<number, string> = {
  1: "Unlikely", 2: "Possible", 3: "Likely", 4: "Almost Certain",
};
const IMPACT_LABELS: Record<number, string> = {
  1: "Low", 2: "Medium", 3: "High", 4: "Very High",
};

// 4×4 inherent risk matrix [likelihood][impact]
const IR_MATRIX: number[][] = [
  [0, 0, 0, 0, 0],
  [0, 1, 1, 2, 2],
  [0, 1, 2, 3, 3],
  [0, 2, 3, 3, 4],
  [0, 2, 3, 4, 4],
];

const IMPACT_DIM_KEYS: (keyof RiskRecord)[] = [
  "financial_impact", "regulatory_impact", "legal_impact",
  "customer_impact", "reputational_impact",
];

function sourceToL1(source: "EXT" | "INT"): string {
  return source === "EXT" ? "External Fraud" : "Internal/Insider Fraud/Risk";
}

function computeOverallImpact(r: RiskRecord): number | null {
  const vals = IMPACT_DIM_KEYS
    .map((k) => r[k] as number | null)
    .filter((v): v is number => v !== null);
  return vals.length > 0 ? Math.max(...vals) : null;
}

function computeInherentRating(likelihood: number | null, impact: number | null): number | null {
  if (likelihood === null || impact === null) return null;
  return IR_MATRIX[likelihood]?.[impact] ?? null;
}

function computeResidualRating(inherent: number | null, ctrlEff: string | null): number | null {
  if (inherent === null) return null;
  const reduction =
    ctrlEff === "Effective"           ? 2 :
    ctrlEff === "Partially Effective" ? 1 :
    0;
  return Math.max(1, inherent - reduction);
}

// ── Badge helpers ─────────────────────────────────────────────
function impactBadgeClass(score: number | null): string {
  const map: Record<number, string> = {
    1: styles.irScore1, 2: styles.irScore2, 3: styles.irScore3, 4: styles.irScore4,
  };
  return score !== null ? (map[score] ?? styles.irScoreNull) : styles.irScoreNull;
}

function likelihoodBadgeClass(score: number | null): string {
  const map: Record<number, string> = {
    1: styles.rrLikelihood1, 2: styles.rrLikelihood2,
    3: styles.rrLikelihood3, 4: styles.rrLikelihood4,
  };
  return score !== null ? (map[score] ?? styles.rrLikelihoodNull) : styles.rrLikelihoodNull;
}

function ctrlEffBadgeClass(label: string | null): string {
  if (!label) return styles.rrEffNull;
  if (label === "Effective")           return styles.rrEffEffective;
  if (label === "Partially Effective") return styles.rrEffPartial;
  if (label === "Needs Improvement")   return styles.rrEffNeeds;
  return styles.rrEffIneffective;
}

// ── Control effectiveness aggregation ────────────────────────
const EFF_SCORE: Record<string, number> = {
  "Effective": 4, "Partially Effective": 2.5,
  "Needs Improvement": 1.5, "Ineffective": 1,
};

function aggregateCtrlEff(controls: Control[]): string | null {
  const scores = controls
    .map((c) => EFF_SCORE[c.overall_effectiveness ?? ""] ?? 0)
    .filter((s) => s > 0);
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 3.5) return "Effective";
  if (avg >= 2.5) return "Partially Effective";
  if (avg >= 1.5) return "Needs Improvement";
  return "Ineffective";
}

// ── Component ─────────────────────────────────────────────────
export function StepResidualRisk({ assessmentId, onValidChange }: StepProps) {
  const { data: allRisks = [], isLoading } = useQuery<RiskRecord[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  const { data: controls = [] } = useQuery<Control[]>({
    queryKey: ["controls", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/controls`).then((r) => r.json()),
  });

  const risks = allRisks.filter((r) => r.applicable === true);

  // Step is valid as soon as risks are loaded (read-only summary)
  useEffect(() => {
    onValidChange(risks.length > 0);
  }, [risks.length, onValidChange]);

  if (isLoading) {
    return (
      <div className={styles.step}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Step 6: Residual Risk Rating</h2>
        </div>
        <div className={styles.emptyState}>Loading…</div>
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className={styles.step}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Step 6: Residual Risk Rating</h2>
          <p className={styles.stepDesc}>Review calculated residual risks based on inherent risk and control effectiveness.</p>
        </div>
        <div className={styles.card}>
          <p className={styles.emptyState}>No applicable risks found. Go back to Step 3.</p>
        </div>
      </div>
    );
  }

  // Build ctrl effectiveness map per risk
  const ctrlEffMap: Record<string, string | null> = {};
  risks.forEach((r) => {
    const riskControls = controls.filter((c) => c.risk_id === r.id);
    ctrlEffMap[r.id] = aggregateCtrlEff(riskControls);
  });

  // Compute overall residual risk (highest across all risks)
  const residualScores = risks
    .map((r) => {
      const lh      = r.likelihood_score;
      const impact  = computeOverallImpact(r);
      const inherit = computeInherentRating(lh, impact);
      return computeResidualRating(inherit, ctrlEffMap[r.id] ?? null);
    })
    .filter((s): s is number => s !== null);
  const overallResidual = residualScores.length > 0 ? Math.max(...residualScores) : null;

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Step 6: Residual Risk Rating</h2>
        <p className={styles.stepDesc}>
          Review calculated residual risks based on inherent risk and control effectiveness.
        </p>
      </div>

      <div className={styles.rrSummaryCard}>
        {/* Card header */}
        <div className={styles.rrSummaryHeader}>
          <div>
            <div className={styles.rrSummaryTitle}>
              <BarChart2 size={15} className={styles.rrSummaryIcon} />
              Residual Risk Summary
            </div>
            <div className={styles.rrSummarySubtitle}>
              Calculated residual risk for each applicable risk based on the risk matrix
            </div>
          </div>
          {overallResidual !== null && (
            <div className={styles.rrTopSection}>
              <span className={styles.rrTopLabel}>Overall Residual Risk</span>
              <span className={clsx(styles.rrTopBadge, impactBadgeClass(overallResidual))}>
                {IMPACT_LABELS[overallResidual]}
              </span>
            </div>
          )}
        </div>

        {/* Table */}
        <div className={styles.rrTableWrap}>
          <table className={styles.rrFlatTable}>
            <thead>
              <tr>
                <th className={styles.rrThL1}>L1 Risk</th>
                <th className={styles.rrThL2}>L2 Risk</th>
                <th className={styles.rrThL3}>L3 Risk</th>
                <th className={styles.rrThRating}>Likelihood<br />Rating</th>
                <th className={styles.rrThRating}>Overall Impact<br />Rating</th>
                <th className={styles.rrThRating}>Inherent Risk<br />Rating</th>
                <th className={styles.rrThRating}>Control Effectiveness<br />Rating</th>
                <th className={styles.rrThRating}>Residual Risk<br />Rating</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => {
                const likelihood    = r.likelihood_score;
                const overallImpact = computeOverallImpact(r);
                const inherent      = computeInherentRating(likelihood, overallImpact);
                const ctrlEff       = ctrlEffMap[r.id] ?? null;
                const residual      = computeResidualRating(inherent, ctrlEff);
                const l3Label       = r.taxonomy_risk_id
                  ? `${r.taxonomy_risk_id} — ${r.name}`
                  : r.name;

                return (
                  <tr key={r.id} className={styles.rrFlatRow}>
                    <td className={styles.rrCellL1}>{sourceToL1(r.source)}</td>
                    <td className={styles.rrCellL2}>{r.category}</td>
                    <td className={styles.rrCellL3}>{l3Label}</td>
                    <td className={styles.rrCellRating}>
                      <span className={clsx(styles.rrPill, likelihoodBadgeClass(likelihood))}>
                        {likelihood !== null ? LIKELIHOOD_LABELS[likelihood] : "—"}
                      </span>
                    </td>
                    <td className={styles.rrCellRating}>
                      <span className={clsx(styles.rrPill, impactBadgeClass(overallImpact))}>
                        {overallImpact !== null ? IMPACT_LABELS[overallImpact] : "—"}
                      </span>
                    </td>
                    <td className={styles.rrCellRating}>
                      <span className={clsx(styles.rrPill, impactBadgeClass(inherent))}>
                        {inherent !== null ? IMPACT_LABELS[inherent] : "—"}
                      </span>
                    </td>
                    <td className={styles.rrCellRating}>
                      <span className={clsx(styles.rrPill, ctrlEffBadgeClass(ctrlEff))}>
                        {ctrlEff ?? "Not Assessed"}
                      </span>
                    </td>
                    <td className={styles.rrCellRating}>
                      <span className={clsx(styles.rrPill, impactBadgeClass(residual))}>
                        {residual !== null ? IMPACT_LABELS[residual] : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
