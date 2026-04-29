import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import clsx from "clsx";
import { api } from "@/lib/api";
import { RATING_COLORS } from "@/lib/ratingTokens";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

/* Mirrors ratings.css — used only for Recharts strokes and inline SVG */
const R = RATING_COLORS;

interface Assessment {
  title: string;
  scope: string;
  owner: string;
  business_unit: string;
  assessment_date: string;
  status: string;
}

interface Risk {
  id: string;
  name: string;
  category: string;
  source: string;
  inherent_likelihood: string;
  inherent_impact: string;
  residual_likelihood: string;
  residual_impact: string;
}

interface Control {
  id: string;
  risk_id: string;
  name: string;
  overall_effectiveness: string;
}

const SCORE: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

function riskScore(l: string, i: string) {
  return (SCORE[l] ?? 0) * (SCORE[i] ?? 0);
}

function riskLevel(s: number) {
  if (s >= 12) return "critical";
  if (s >= 6) return "high";
  if (s >= 3) return "medium";
  return "low";
}

export function StepSummary({ assessmentId, onValidChange }: StepProps) {
  const { data: assessment } = useQuery<Assessment>({
    queryKey: ["assessment", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}`).then((r) => r.json()),
  });

  const { data: risks = [] } = useQuery<Risk[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  const { data: controls = [] } = useQuery<Control[]>({
    queryKey: ["controls", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/controls`).then((r) => r.json()),
  });

  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  const radarData = risks.map((r) => ({
    subject: r.name.length > 14 ? r.name.slice(0, 12) + "…" : r.name,
    Inherent: riskScore(r.inherent_likelihood, r.inherent_impact),
    Residual: riskScore(r.residual_likelihood, r.residual_impact),
  }));

  const statsItems = [
    { label: "Total Risks", value: risks.length },
    { label: "Total Controls", value: controls.length },
    {
      label: "Critical / High Risks",
      value: risks.filter((r) => {
        const s = riskScore(r.residual_likelihood, r.residual_impact);
        return s >= 6;
      }).length,
    },
    {
      label: "Effective Controls",
      value: controls.filter((c) => c.overall_effectiveness === "Effective").length,
    },
  ];

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Assessment Summary</h2>
        <p className={styles.stepDesc}>Review the complete risk profile before finalising.</p>
      </div>

      {/* Meta cards */}
      {assessment && (
        <div className={styles.summaryGrid} style={{ marginBottom: "1rem" }}>
          {[
            { label: "Assessment Title", value: assessment.title },
            { label: "Owner", value: assessment.owner || "—" },
            { label: "Business Unit", value: assessment.business_unit || "—" },
            { label: "Assessment Date", value: assessment.assessment_date ? new Date(assessment.assessment_date).toLocaleDateString() : "—" },
          ].map((m) => (
            <div key={m.label} className={styles.metaCard}>
              <p className={styles.metaCardLabel}>{m.label}</p>
              <p className={styles.metaCardValue}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Stat pills */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {statsItems.map((s) => (
          <div key={s.label} style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "0.75rem 1.25rem",
            flex: "1",
            minWidth: "120px",
            textAlign: "center",
          }}>
            <p style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e293b", margin: "0 0 0.15rem" }}>
              {s.value}
            </p>
            <p style={{ fontSize: "0.72rem", color: "#64748b", margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Radar chart */}
      {radarData.length > 0 && (
        <div className={styles.card} style={{ marginBottom: "1rem" }}>
          <h3 className={styles.sectionTitle}>Risk Heat Map — Inherent vs Residual</h3>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#64748b" }} />
              <Radar name="Inherent" dataKey="Inherent" stroke={R.critical.bg}  fill={R.critical.bg}  fillOpacity={0.18} strokeWidth={2} />
              <Radar name="Residual" dataKey="Residual" stroke={R.completed.bg} fill={R.completed.bg} fillOpacity={0.18} strokeWidth={2} />
              <Tooltip
                contentStyle={{ fontSize: "0.8rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: "0.78rem" }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Risk register table */}
      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Risk Register</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Risk</th>
              <th>Category</th>
              <th>Source</th>
              <th>Inherent Rating</th>
              <th>Residual Rating</th>
              <th>Controls</th>
              <th>Risk Reduction</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => {
              const iScore = riskScore(r.inherent_likelihood, r.inherent_impact);
              const rScore = riskScore(r.residual_likelihood, r.residual_impact);
              const reduction = iScore > 0 ? Math.round(((iScore - rScore) / iScore) * 100) : 0;
              const ctrlCount = controls.filter((c) => c.risk_id === r.id).length;
              return (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{r.category}</td>
                  <td>
                    <span style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      padding: "0.15rem 0.4rem",
                      borderRadius: "3px",
                      background: r.source === "EXT" ? R.high.bg : R.low.bg,
                      color: r.source === "EXT" ? R.high.fg : R.low.fg,
                    }}>
                      {r.source}
                    </span>
                  </td>
                  <td>
                    <span className={clsx(styles.badge, styles[riskLevel(iScore)])}>
                      {riskLevel(iScore)}
                    </span>
                  </td>
                  <td>
                    <span className={clsx(styles.badge, styles[riskLevel(rScore)])}>
                      {riskLevel(rScore)}
                    </span>
                  </td>
                  <td style={{ color: "#64748b" }}>{ctrlCount}</td>
                  <td>
                    <span style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: reduction > 0 ? R.low.bg : R.critical.bg,
                    }}>
                      {reduction > 0 ? `↓ ${reduction}%` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
