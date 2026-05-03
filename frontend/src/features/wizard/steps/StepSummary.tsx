import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { AlertTriangle, ShieldCheck, TrendingDown, ClipboardList, Link2, ShieldOff } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

// ── Types ─────────────────────────────────────────────────────
interface Risk {
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
  name: string;
  type: string | null;
  overall_effectiveness: string | null;
}

// ── Scoring (mirrors Steps 4 & 6) ────────────────────────────
const IR_MATRIX: number[][] = [
  [0, 0, 0, 0, 0],
  [0, 1, 1, 2, 2],
  [0, 1, 2, 3, 3],
  [0, 2, 3, 3, 4],
  [0, 2, 3, 4, 4],
];

const SCORE_LABELS: Record<number, string> = {
  1: "Low", 2: "Medium", 3: "High", 4: "Very High",
};

const EFF_SCORE: Record<string, number> = {
  "Effective": 4, "Partially Effective": 2.5,
  "Needs Improvement": 1.5, "Ineffective": 1,
};

function computeOverallImpact(r: Risk): number | null {
  const vals = [r.financial_impact, r.regulatory_impact, r.legal_impact, r.customer_impact, r.reputational_impact]
    .filter((v): v is number => v !== null);
  return vals.length > 0 ? Math.max(...vals) : null;
}

function computeInherentRating(r: Risk): number | null {
  const lh = r.likelihood_score;
  const impact = computeOverallImpact(r);
  if (lh === null || impact === null) return null;
  return IR_MATRIX[lh]?.[impact] ?? null;
}

function computeResidualRating(inherent: number | null, ctrlEff: string | null): number | null {
  if (inherent === null) return null;
  const reduction = ctrlEff === "Effective" ? 2 : ctrlEff === "Partially Effective" ? 1 : 0;
  return Math.max(1, inherent - reduction);
}

function aggregateCtrlEff(ctrlList: Control[]): string | null {
  const scores = ctrlList
    .map(c => EFF_SCORE[c.overall_effectiveness ?? ""] ?? 0)
    .filter(s => s > 0);
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 3.5) return "Effective";
  if (avg >= 2.5) return "Partially Effective";
  if (avg >= 1.5) return "Needs Improvement";
  return "Ineffective";
}

function sourceToL1(source: "EXT" | "INT"): string {
  return source === "EXT" ? "External Fraud" : "Internal/Insider Fraud/Risk";
}

// ── Badge helpers ─────────────────────────────────────────────
function scoreBadgeClass(score: number | null): string {
  const map: Record<number, string> = {
    1: styles.irScore1, 2: styles.irScore2, 3: styles.irScore3, 4: styles.irScore4,
  };
  return score !== null ? (map[score] ?? styles.irScoreNull) : styles.irScoreNull;
}

function ctrlEffBadgeClass(label: string | null): string {
  if (!label) return styles.rrEffNull;
  if (label === "Effective")           return styles.rrEffEffective;
  if (label === "Partially Effective") return styles.rrEffPartial;
  if (label === "Needs Improvement")   return styles.rrEffNeeds;
  return styles.rrEffIneffective;
}

// ── Narratives ────────────────────────────────────────────────
function inherentNarrative(worst: number | null, highCount: number, total: number): string {
  if (worst === null)
    return "Insufficient data to compute inherent risk. Complete Step 4 to score all applicable risks.";
  const label = SCORE_LABELS[worst];
  return `The overall inherent risk for this assessment is rated ${label}. Out of ${total} applicable risk${total !== 1 ? "s" : ""}, ${highCount} ${highCount !== 1 ? "are" : "is"} rated High or Very High before any controls are applied.`;
}

function ctrlNarrative(label: string | null, count: number): string {
  if (!label) return "No controls have been evaluated yet. Map controls in Step 5 to assess effectiveness.";
  const suffix =
    label === "Effective"           ? "Controls are operating as designed." :
    label === "Partially Effective" ? "Some gaps in control coverage remain." :
    label === "Needs Improvement"   ? "Significant control improvements are recommended." :
    "Controls are not providing effective risk mitigation.";
  return `${count} control${count !== 1 ? "s" : ""} ${count !== 1 ? "have" : "has"} been evaluated with aggregate effectiveness rated ${label}. ${suffix}`;
}

function residualNarrative(score: number | null, inherent: number | null): string {
  if (score === null)
    return "Residual risk has not been fully rated. Ensure Step 4 scoring and Step 5 control mapping are complete.";
  const label = SCORE_LABELS[score];
  const reduction = (inherent !== null && inherent > score)
    ? ` Risk exposure has been reduced by ${inherent - score} level${inherent - score !== 1 ? "s" : ""} through applied controls.`
    : "";
  return `After accounting for controls, the overall residual risk is rated ${label}.${reduction} Further risk treatment may be required for residual risks rated High or Very High.`;
}

// ── Chart colours ─────────────────────────────────────────────
const SCORE_COLORS: Record<number, string> = {
  1: "#22c55e", 2: "#f59e0b", 3: "#f97316", 4: "#ef4444",
};
const TYPE_PALETTE = ["#2563eb", "#7c3aed", "#059669", "#ea580c", "#0891b2", "#94a3b8"];

// ── CSV export ────────────────────────────────────────────────
function exportCSV(risks: Risk[], controls: Control[], ctrlEffMap: Record<string, string | null>) {
  const headers = ["L1 Risk", "L2 (Category)", "L3 (Name)", "Likelihood Score", "Overall Impact", "Inherent Rating", "Control Effectiveness", "Residual Rating"];
  const rows = risks.map(r => {
    const impact   = computeOverallImpact(r);
    const inherent = computeInherentRating(r);
    const ctrlEff  = ctrlEffMap[r.id] ?? null;
    const residual = computeResidualRating(inherent, ctrlEff);
    return [
      sourceToL1(r.source), r.category,
      r.taxonomy_risk_id ? `${r.taxonomy_risk_id} — ${r.name}` : r.name,
      r.likelihood_score ?? "—",
      impact   !== null ? SCORE_LABELS[impact]   : "—",
      inherent !== null ? SCORE_LABELS[inherent] : "—",
      ctrlEff ?? "Not Assessed",
      residual !== null ? SCORE_LABELS[residual] : "—",
    ];
  });
  const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = "assessment_risk_register.csv";
  a.click();
}

// ── Component ─────────────────────────────────────────────────
export function StepSummary({ assessmentId, onValidChange }: StepProps) {
  const { data: allRisks = [] } = useQuery<Risk[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then(r => r.json()),
  });
  const { data: controls = [] } = useQuery<Control[]>({
    queryKey: ["controls", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/controls`).then(r => r.json()),
  });

  useEffect(() => { onValidChange(true); }, [onValidChange]);

  const ratingsSaved = useRef(false);
  const patchAssessment = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api.patch(`/api/v1/assessments/${assessmentId}`, body).then(r => r.json()),
  });

  const risks = allRisks.filter(r => r.applicable === true);

  // ── Per-risk maps ─────────────────────────────────────────
  const ctrlEffMap: Record<string, string | null> = {};
  risks.forEach(r => {
    ctrlEffMap[r.id] = aggregateCtrlEff(controls.filter(c => c.risk_id === r.id));
  });

  const inherentScores = risks
    .map(r => computeInherentRating(r))
    .filter((s): s is number => s !== null);
  const residualScores = risks
    .map(r => computeResidualRating(computeInherentRating(r), ctrlEffMap[r.id] ?? null))
    .filter((s): s is number => s !== null);

  const worstInherent  = inherentScores.length  > 0 ? Math.max(...inherentScores)  : null;
  const worstResidual  = residualScores.length  > 0 ? Math.max(...residualScores)  : null;
  const overallCtrlEff = aggregateCtrlEff(controls);

  // ── KPI counters ──────────────────────────────────────────
  const highVeryHighInherent = inherentScores.filter(s => s >= 3).length;
  const notEffectiveRisks    = risks.filter(r => {
    const eff = ctrlEffMap[r.id];
    return eff === "Ineffective" || eff === "Needs Improvement";
  }).length;

  // Auto-save computed ratings back to the assessment record so the
  // dashboard shows up-to-date ratings without manual entry.
  useEffect(() => {
    if (ratingsSaved.current) return;
    if (worstInherent === null || worstResidual === null) return;
    ratingsSaved.current = true;
    patchAssessment.mutate({
      inherent_risk_rating:          SCORE_LABELS[worstInherent],
      controls_effectiveness_rating: overallCtrlEff ?? "Not Assessed",
      residual_risk_rating:          SCORE_LABELS[worstResidual],
    });
  }, [worstInherent, worstResidual, overallCtrlEff]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chart data ────────────────────────────────────────────
  const inherentDistrib = ([1, 2, 3, 4] as const).map(s => ({
    name: SCORE_LABELS[s],
    value: inherentScores.filter(v => v === s).length,
    color: SCORE_COLORS[s],
  })).filter(d => d.value > 0);

  const residualBase = ([1, 2, 3, 4] as const).map(s => ({
    name: SCORE_LABELS[s],
    value: residualScores.filter(v => v === s).length,
    color: SCORE_COLORS[s],
  })).filter(d => d.value > 0);
  const notRated = risks.length - residualScores.length;
  const residualDistrib = notRated > 0
    ? [...residualBase, { name: "Not Rated", value: notRated, color: "#94a3b8" }]
    : residualBase;

  const typeMap = controls.reduce<Record<string, number>>((acc, c) => {
    const t = c.type ?? "Other";
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const ctrlTypeDistrib = Object.entries(typeMap).map(([name, value], i) => ({
    name, value, color: TYPE_PALETTE[i % TYPE_PALETTE.length],
  }));

  function handlePDF() {
    document.body.classList.add("pdf-capture-active");
    window.print();
    setTimeout(() => document.body.classList.remove("pdf-capture-active"), 1000);
  }

  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
    cx: number; cy: number; midAngle: number;
    innerRadius: number; outerRadius: number; percent: number;
  }) => {
    if (percent < 0.08) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className={styles.step}>
      {/* ── Header ── */}
      <div className={styles.stepHeader}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h2 className={styles.stepTitle}>Step 7: Assessment Summary</h2>
            <p className={styles.stepDesc}>Review and finalize the assessment report.</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className={styles.smExportBtn}
              onClick={() => exportCSV(risks, controls, ctrlEffMap)}>
              ⬇ Export CSV
            </button>
            <button type="button" className={styles.smPdfBtn} onClick={handlePDF}>
              🖨 Download PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Top 3 Rating Cards ── */}
      <div className={styles.smRatingCards}>
        <div className={styles.smRatingCard}>
          <div className={styles.smRatingCardTop}>
            <span className={clsx(styles.smRatingCardIconWrap, styles.smRatingIconInherent)}>
              <AlertTriangle size={13} />
            </span>
            <span className={styles.smRatingCardTypeLabel}>Inherent Risk</span>
          </div>
          <span className={clsx(styles.smRatingBadge, scoreBadgeClass(worstInherent))}>
            {worstInherent !== null ? SCORE_LABELS[worstInherent] : "Not Rated"}
          </span>
          <div className={styles.smRatingRationale}>
            <span className={styles.smRatingRationaleHead}>Rationale:</span>
            <p className={styles.smRatingRationaleText}>
              {inherentNarrative(worstInherent, highVeryHighInherent, risks.length)}
            </p>
          </div>
        </div>

        <div className={styles.smRatingCard}>
          <div className={styles.smRatingCardTop}>
            <span className={clsx(styles.smRatingCardIconWrap, styles.smRatingIconCtrl)}>
              <ShieldCheck size={13} />
            </span>
            <span className={styles.smRatingCardTypeLabel}>Control Effectiveness</span>
          </div>
          <span className={clsx(styles.smRatingBadge, ctrlEffBadgeClass(overallCtrlEff))}>
            {overallCtrlEff ?? "Not Assessed"}
          </span>
          <div className={styles.smRatingRationale}>
            <span className={styles.smRatingRationaleHead}>Rationale:</span>
            <p className={styles.smRatingRationaleText}>
              {ctrlNarrative(overallCtrlEff, controls.length)}
            </p>
          </div>
        </div>

        <div className={styles.smRatingCard}>
          <div className={styles.smRatingCardTop}>
            <span className={clsx(styles.smRatingCardIconWrap, styles.smRatingIconResidual)}>
              <TrendingDown size={13} />
            </span>
            <span className={styles.smRatingCardTypeLabel}>Residual Risk</span>
          </div>
          <span className={clsx(styles.smRatingBadge, scoreBadgeClass(worstResidual))}>
            {worstResidual !== null ? SCORE_LABELS[worstResidual] : "Not Rated"}
          </span>
          <div className={styles.smRatingRationale}>
            <span className={styles.smRatingRationaleHead}>Rationale:</span>
            <p className={styles.smRatingRationaleText}>
              {residualNarrative(worstResidual, worstInherent)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Assessment Results ── */}
      <div className={styles.smResultsSection}>
        <h3 className={styles.smSectionTitle}>Assessment Results</h3>
        <div className={styles.smResultsGrid}>
          <div className={styles.smResultTile}>
            <ClipboardList size={26} className={styles.smResultIcon} />
            <div className={styles.smResultCount}>{risks.length}</div>
            <div className={styles.smResultLabel}>Risks Evaluated</div>
          </div>
          <div className={styles.smResultTile}>
            <Link2 size={26} className={styles.smResultIcon} />
            <div className={styles.smResultCount}>{controls.length}</div>
            <div className={styles.smResultLabel}>Controls Mapped</div>
          </div>
          <div className={clsx(styles.smResultTile, highVeryHighInherent > 0 && styles.smResultTileDanger)}>
            <AlertTriangle size={26} className={clsx(styles.smResultIcon, highVeryHighInherent > 0 && styles.smResultIconDanger)} />
            <div className={styles.smResultCount}>{highVeryHighInherent}</div>
            <div className={styles.smResultLabel}>High / Very High Inherent</div>
          </div>
          <div className={clsx(styles.smResultTile, notEffectiveRisks > 0 && styles.smResultTileDanger)}>
            <ShieldOff size={26} className={clsx(styles.smResultIcon, notEffectiveRisks > 0 && styles.smResultIconDanger)} />
            <div className={styles.smResultCount}>{notEffectiveRisks}</div>
            <div className={styles.smResultLabel}>Risks w/ Not Effective Controls</div>
          </div>
        </div>
      </div>

      {/* ── Visual Analytics ── */}
      {risks.length > 0 && (
        <div className={styles.smAnalyticsSection}>
          <h3 className={styles.smSectionTitle}>Visual Analytics</h3>
          <div className={styles.smChartsGrid}>
            <div className={styles.smChartPanel}>
              <div className={styles.smChartTitle}>Inherent Risk Distribution</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={inherentDistrib.length > 0 ? inherentDistrib : [{ name: "Not Rated", value: 1, color: "#e2e8f0" }]}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    dataKey="value" labelLine={false} label={renderLabel}>
                    {(inherentDistrib.length > 0 ? inherentDistrib : [{ name: "Not Rated", value: 1, color: "#e2e8f0" }])
                      .map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: "0.78rem", borderRadius: "6px" }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "0.72rem" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className={styles.smChartPanel}>
              <div className={styles.smChartTitle}>Controls by Type Distribution</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={ctrlTypeDistrib.length > 0 ? ctrlTypeDistrib : [{ name: "No Controls", value: 1, color: "#e2e8f0" }]}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    dataKey="value" labelLine={false} label={renderLabel}>
                    {(ctrlTypeDistrib.length > 0 ? ctrlTypeDistrib : [{ name: "No Controls", value: 1, color: "#e2e8f0" }])
                      .map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: "0.78rem", borderRadius: "6px" }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "0.72rem" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className={styles.smChartPanel}>
              <div className={styles.smChartTitle}>Residual Risk Distribution</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={residualDistrib.length > 0 ? residualDistrib : [{ name: "Not Rated", value: risks.length || 1, color: "#94a3b8" }]}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    dataKey="value" labelLine={false} label={renderLabel}>
                    {(residualDistrib.length > 0 ? residualDistrib : [{ name: "Not Rated", value: risks.length || 1, color: "#94a3b8" }])
                      .map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: "0.78rem", borderRadius: "6px" }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "0.72rem" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Detailed Risk Ratings ── */}
      <div className={styles.smDetailSection}>
        <h3 className={styles.smSectionTitle}>Detailed Risk Ratings</h3>
        {risks.length === 0 ? (
          <p className={styles.emptyState}>No applicable risks found. Go back to Step 3.</p>
        ) : (
          <div className={styles.rrTableWrap}>
            <table className={styles.rrFlatTable}>
              <thead>
                <tr>
                  <th className={styles.rrThL1}>L1 Risk</th>
                  <th className={styles.rrThL2}>L2 Risk</th>
                  <th className={styles.rrThL3}>L3 Risk</th>
                  <th className={styles.rrThRating}>Inherent Risk<br />Rating</th>
                  <th className={styles.rrThRating}>Control<br />Effectiveness</th>
                  <th className={styles.rrThRating}>Residual Risk<br />Rating</th>
                </tr>
              </thead>
              <tbody>
                {risks.map(r => {
                  const inherent = computeInherentRating(r);
                  const ctrlEff  = ctrlEffMap[r.id] ?? null;
                  const residual = computeResidualRating(inherent, ctrlEff);
                  const l3Label  = r.taxonomy_risk_id ? `${r.taxonomy_risk_id} — ${r.name}` : r.name;
                  return (
                    <tr key={r.id} className={styles.rrFlatRow}>
                      <td className={styles.rrCellL1}>{sourceToL1(r.source)}</td>
                      <td className={styles.rrCellL2}>{r.category}</td>
                      <td className={styles.rrCellL3}>{l3Label}</td>
                      <td className={styles.rrCellRating}>
                        <span className={clsx(styles.rrPill, scoreBadgeClass(inherent))}>
                          {inherent !== null ? SCORE_LABELS[inherent] : "—"}
                        </span>
                      </td>
                      <td className={styles.rrCellRating}>
                        <span className={clsx(styles.rrPill, ctrlEffBadgeClass(ctrlEff))}>
                          {ctrlEff ?? "Not Assessed"}
                        </span>
                      </td>
                      <td className={styles.rrCellRating}>
                        <span className={clsx(styles.rrPill, scoreBadgeClass(residual))}>
                          {residual !== null ? SCORE_LABELS[residual] : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
