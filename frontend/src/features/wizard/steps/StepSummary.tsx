import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

// ── Types ─────────────────────────────────────────────────────
interface Assessment {
  title: string; scope: string; owner: string;
  business_unit: string; assessment_date: string; status: string;
}
interface Risk {
  id: string; name: string; category: string; source: string;
  applicable: boolean | null;
  inherent_likelihood: string | null; inherent_impact: string | null;
  residual_likelihood: string | null; residual_impact: string | null;
  rationale: string | null;
}
interface Control {
  id: string; risk_id: string; name: string; type: string | null;
  overall_effectiveness: string | null;
  design_effectiveness: number | null; operating_effectiveness: number | null;
}

// ── Helpers ───────────────────────────────────────────────────
const SCORE: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
const RATING_MATRIX: Record<string, Record<string, string>> = {
  low:      { low:"low",    medium:"low",    high:"medium",   critical:"medium"   },
  medium:   { low:"low",    medium:"medium",  high:"high",     critical:"high"     },
  high:     { low:"medium", medium:"high",    high:"high",     critical:"critical" },
  critical: { low:"medium", medium:"high",    high:"critical", critical:"critical" },
};
const LEVEL_ORDER = ["low","medium","high","critical"];
const LEVEL_LABEL: Record<string,string> = { low:"Low", medium:"Medium", high:"High", critical:"Critical" };

function computeRating(l: string|null, i: string|null): string|null {
  if (!l || !i) return null;
  return RATING_MATRIX[l]?.[i] ?? null;
}
function worstRating(ratings: (string|null)[]): string|null {
  let worst = -1; let result: string|null = null;
  ratings.forEach(r => { if (r && LEVEL_ORDER.indexOf(r) > worst) { worst = LEVEL_ORDER.indexOf(r); result = r; } });
  return result;
}
const EFF_SCORE: Record<string,number> = { "Effective":4,"Partially Effective":2,"Needs Improvement":1.5,"Ineffective":1 };
function avgEffLabel(controls: Control[]): string {
  const scores = controls.map(c => EFF_SCORE[c.overall_effectiveness??""]).filter(Boolean);
  if (!scores.length) return "—";
  const avg = scores.reduce((a,b)=>a+b,0)/scores.length;
  if (avg>=3.5) return "Effective";
  if (avg>=2.5) return "Partially Effective";
  if (avg>=1.5) return "Needs Improvement";
  return "Ineffective";
}

// Chart colours
const PIE_COLORS: Record<string,string> = {
  low:"#22c55e", medium:"#f59e0b", high:"#f97316", critical:"#ef4444",
  EXT:"#f9a8d4", INT:"#6ee7b7",
};
const EFF_COLORS: Record<string,string> = {
  "Effective":"#22c55e","Partially Effective":"#f59e0b",
  "Needs Improvement":"#f97316","Ineffective":"#ef4444","Not Tested":"#94a3b8",
};

function badgeClass(rating: string|null) {
  if (!rating) return styles.rrBadgeNull;
  return styles[`irRating_${rating}`] ?? styles.rrBadgeNull;
}
function effBadgeClass(label: string) {
  if (label==="Effective")           return styles.rrEffEffective;
  if (label==="Partially Effective") return styles.rrEffPartial;
  if (label==="Needs Improvement")   return styles.rrEffNeeds;
  if (label==="Ineffective")         return styles.rrEffIneffective;
  return styles.rrEffNull;
}

// Narrative generator
function inherentNarrative(rating: string|null, count: number): string {
  if (!rating) return "Insufficient data to compute inherent risk rating.";
  const label = LEVEL_LABEL[rating] ?? rating;
  return `Across ${count} applicable risk${count!==1?"s":""}, the worst-case inherent risk is rated ${label}. This reflects the gross risk exposure before any controls are applied.`;
}
function ctrlNarrative(label: string, count: number): string {
  if (label==="—") return "No controls have been evaluated yet.";
  return `${count} control${count!==1?"s":""} evaluated with an aggregate effectiveness of ${label}. ${
    label==="Effective" ? "Controls are performing as designed." :
    label==="Partially Effective" ? "Some gaps in control coverage remain." :
    "Significant control improvements are recommended."
  }`;
}
function residualNarrative(rating: string|null, reduction: number): string {
  if (!rating) return "Residual risk has not been fully rated yet.";
  const label = LEVEL_LABEL[rating] ?? rating;
  return `After applying controls, the worst-case residual risk is ${label}. ${
    reduction>0 ? `Overall risk exposure has been reduced by approximately ${reduction}%.` :
    "Controls have not yet reduced the overall risk exposure."
  }`;
}

// CSV export
function exportCSV(risks: Risk[], controls: Control[]) {
  const rows = [
    ["Risk Name","Category","Source","Applicable","Inherent Rating","Residual Rating","Controls","Risk Reduction %"],
    ...risks.map(r => {
      const ir = computeRating(r.inherent_likelihood, r.inherent_impact);
      const rr = computeRating(r.residual_likelihood, r.residual_impact);
      const iScore = (SCORE[r.inherent_likelihood??""??0]??0)*(SCORE[r.inherent_impact??""??0]??0);
      const rScore = (SCORE[r.residual_likelihood??""??0]??0)*(SCORE[r.residual_impact??""??0]??0);
      const red = iScore>0 ? Math.round(((iScore-rScore)/iScore)*100) : 0;
      const ctrlCount = controls.filter(c=>c.risk_id===r.id).length;
      return [r.name, r.category, r.source, r.applicable?"Yes":"No",
        LEVEL_LABEL[ir??""??""] ?? "—", LEVEL_LABEL[rr??""??""] ?? "—",
        ctrlCount, red>0?`${red}%`:"—"];
    }),
  ];
  const csv = rows.map(r=>r.join(",")).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
  a.download = "assessment_risk_register.csv";
  a.click();
}

// ── Main component ────────────────────────────────────────────
export function StepSummary({ assessmentId, onValidChange }: StepProps) {
  const pageRef = useRef<HTMLDivElement>(null);

  const { data: assessment } = useQuery<Assessment>({
    queryKey: ["assessment", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}`).then(r=>r.json()),
  });
  const { data: allRisks = [] } = useQuery<Risk[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then(r=>r.json()),
  });
  const { data: controls = [] } = useQuery<Control[]>({
    queryKey: ["controls", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/controls`).then(r=>r.json()),
  });

  useEffect(() => { onValidChange(true); }, [onValidChange]);

  const risks = allRisks.filter(r => r.applicable === true);

  // ── Computed KPIs ─────────────────────────────────────────
  const inherentRatings = risks.map(r => computeRating(r.inherent_likelihood, r.inherent_impact));
  const residualRatings = risks.map(r => computeRating(r.residual_likelihood, r.residual_impact));
  const worstInherent   = worstRating(inherentRatings);
  const worstResidual   = worstRating(residualRatings);
  const ctrlEffLabel    = avgEffLabel(controls);

  const totalInherentScore = risks.reduce((s,r)=>s+(SCORE[r.inherent_likelihood??""??0]??0)*(SCORE[r.inherent_impact??""??0]??0),0);
  const totalResidualScore = risks.reduce((s,r)=>s+(SCORE[r.residual_likelihood??""??0]??0)*(SCORE[r.residual_impact??""??0]??0),0);
  const overallReduction   = totalInherentScore>0 ? Math.round(((totalInherentScore-totalResidualScore)/totalInherentScore)*100) : 0;

  const highCriticalCount  = risks.filter(r => { const rr=computeRating(r.residual_likelihood,r.residual_impact); return rr==="high"||rr==="critical"; }).length;
  const effectiveCtrlCount = controls.filter(c=>c.overall_effectiveness==="Effective").length;
  const effectivePct       = controls.length>0 ? Math.round((effectiveCtrlCount/controls.length)*100) : 0;

  // ── Chart data ────────────────────────────────────────────
  // Inherent distribution pie
  const inherentDistrib = LEVEL_ORDER.map(l => ({
    name: LEVEL_LABEL[l], value: inherentRatings.filter(r=>r===l).length, color: PIE_COLORS[l],
  })).filter(d=>d.value>0);

  // Source distribution pie
  const extCount = risks.filter(r=>r.source==="EXT").length;
  const intCount = risks.filter(r=>r.source==="INT").length;
  const sourcePie = [
    { name:"External Fraud", value:extCount, color:PIE_COLORS.EXT },
    { name:"Insider Threat",  value:intCount, color:PIE_COLORS.INT },
  ].filter(d=>d.value>0);

  // Residual by category bar
  const categories = [...new Set(risks.map(r=>r.category))].sort();
  const residualByCategory = categories.map(cat => {
    const catRisks = risks.filter(r=>r.category===cat);
    const obj: Record<string,number|string> = { category: cat };
    LEVEL_ORDER.forEach(l => { obj[LEVEL_LABEL[l]] = catRisks.filter(r=>computeRating(r.residual_likelihood,r.residual_impact)===l).length; });
    return obj;
  });

  // Control effectiveness distribution
  const effDistrib = Object.entries(EFF_COLORS).map(([label, color]) => ({
    name: label, value: controls.filter(c=>c.overall_effectiveness===label).length, color,
  })).filter(d=>d.value>0);

  // Residual matrix (category × level)
  const residualMatrix = categories.map(cat => {
    const catRisks = risks.filter(r=>r.category===cat);
    return {
      category: cat,
      counts: LEVEL_ORDER.map(l => catRisks.filter(r=>computeRating(r.residual_likelihood,r.residual_impact)===l).length),
    };
  });

  function handlePDF() {
    document.body.classList.add("pdf-capture-active");
    window.print();
    setTimeout(() => document.body.classList.remove("pdf-capture-active"), 1000);
  }

  const RADIAN = Math.PI/180;
  const renderLabel = ({ cx,cy,midAngle,innerRadius,outerRadius,percent,name }: any) => {
    if (percent<0.08) return null;
    const r = innerRadius+(outerRadius-innerRadius)*0.6;
    const x = cx+r*Math.cos(-midAngle*RADIAN);
    const y = cy+r*Math.sin(-midAngle*RADIAN);
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{`${(percent*100).toFixed(0)}%`}</text>;
  };

  return (
    <div className={styles.step} ref={pageRef}>
      <div className={styles.stepHeader}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"0.75rem" }}>
          <div>
            <h2 className={styles.stepTitle}>Assessment Summary</h2>
            <p className={styles.stepDesc}>Complete risk profile — review before finalising.</p>
          </div>
          <div style={{ display:"flex", gap:"0.5rem" }}>
            <button type="button" className={styles.smExportBtn} onClick={() => exportCSV(risks,controls)}>
              ⬇ Export CSV
            </button>
            <button type="button" className={styles.smPdfBtn} onClick={handlePDF}>
              🖨 Download PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Section A: KPI Scorecard ── */}
      <div className={styles.smScorecard}>
        <div className={styles.smScorecardHeader}>
          <span className={styles.smScorecardTitle}>📊 Risk Score — Scorecard</span>
        </div>
        <div className={styles.smKpiStrip}>
          {/* Inherent */}
          <div className={styles.smKpiCell}>
            <div className={styles.smKpiLabel}>Inherent Risk Rating</div>
            <span className={clsx(styles.smKpiBadge, badgeClass(worstInherent))}>
              {worstInherent ? LEVEL_LABEL[worstInherent] : "—"}
            </span>
            <p className={styles.smKpiNarrative}>{inherentNarrative(worstInherent, risks.length)}</p>
          </div>
          <div className={styles.smKpiDivider} />
          {/* Controls */}
          <div className={styles.smKpiCell}>
            <div className={styles.smKpiLabel}>Control Effectiveness Rating</div>
            <span className={clsx(styles.smKpiBadge, effBadgeClass(ctrlEffLabel))}>
              {ctrlEffLabel}
            </span>
            <p className={styles.smKpiNarrative}>{ctrlNarrative(ctrlEffLabel, controls.length)}</p>
          </div>
          <div className={styles.smKpiDivider} />
          {/* Residual */}
          <div className={styles.smKpiCell}>
            <div className={styles.smKpiLabel}>Residual Risk Rating</div>
            <span className={clsx(styles.smKpiBadge, badgeClass(worstResidual))}>
              {worstResidual ? LEVEL_LABEL[worstResidual] : "—"}
            </span>
            <p className={styles.smKpiNarrative}>{residualNarrative(worstResidual, overallReduction)}</p>
          </div>
        </div>
      </div>

      {/* ── Section B: Stats row ── */}
      <div className={styles.smStatsRow}>
        {[
          { label:"Applicable Risks",     value: risks.length,          sub: `${allRisks.length} total identified` },
          { label:"Total Controls",        value: controls.length,       sub: `${effectiveCtrlCount} effective` },
          { label:"High/Critical Residual",value: highCriticalCount,     sub: "risks requiring attention", danger: highCriticalCount>0 },
          { label:"Control Effectiveness", value: `${effectivePct}%`,   sub: "of controls rated effective" },
        ].map(s => (
          <div key={s.label} className={clsx(styles.smStatCard, s.danger && styles.smStatCardDanger)}>
            <div className={styles.smStatValue}>{s.value}</div>
            <div className={styles.smStatLabel}>{s.label}</div>
            <div className={styles.smStatSub}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Assessment meta ── */}
      {assessment && (
        <div className={styles.summaryGrid} style={{ marginBottom:"1rem" }}>
          {[
            { label:"Assessment Title", value: assessment.title },
            { label:"Owner",            value: assessment.owner || "—" },
            { label:"Business Unit",    value: assessment.business_unit || "—" },
            { label:"Assessment Date",  value: assessment.assessment_date
                ? new Date(assessment.assessment_date).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})
                : "—" },
          ].map(m => (
            <div key={m.label} className={styles.metaCard}>
              <p className={styles.metaCardLabel}>{m.label}</p>
              <p className={styles.metaCardValue}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Visual Analytics ── */}
      {risks.length > 0 && (
        <div className={styles.card} style={{ marginBottom:"1rem" }}>
          <h3 className={styles.sectionTitle}>📈 Visual Analytics</h3>
          <div className={styles.smChartsGrid}>
            {/* Inherent distribution */}
            <div className={styles.smChartPanel}>
              <div className={styles.smChartTitle}>Inherent Risk Distribution</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={inherentDistrib} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    dataKey="value" labelLine={false} label={renderLabel}>
                    {inherentDistrib.map((d,i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v,n)=>[v,n]} contentStyle={{fontSize:"0.78rem",borderRadius:"6px"}} />
                  <Legend iconSize={10} wrapperStyle={{fontSize:"0.72rem"}} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Source distribution */}
            <div className={styles.smChartPanel}>
              <div className={styles.smChartTitle}>Risk by Source</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={sourcePie} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    dataKey="value" labelLine={false} label={renderLabel}>
                    {sourcePie.map((d,i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{fontSize:"0.78rem",borderRadius:"6px"}} />
                  <Legend iconSize={10} wrapperStyle={{fontSize:"0.72rem"}} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Residual by category */}
            <div className={styles.smChartPanel}>
              <div className={styles.smChartTitle}>Residual Risk by Category</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={residualByCategory} margin={{top:5,right:10,left:-20,bottom:40}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="category" tick={{fontSize:10,fill:"#64748b"}} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{fontSize:10}} allowDecimals={false} />
                  <Tooltip contentStyle={{fontSize:"0.78rem",borderRadius:"6px"}} />
                  <Legend iconSize={10} wrapperStyle={{fontSize:"0.72rem"}} />
                  {LEVEL_ORDER.map(l => (
                    <Bar key={l} dataKey={LEVEL_LABEL[l]} stackId="a" fill={PIE_COLORS[l]} radius={l==="critical"?[3,3,0,0]:undefined} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Control Effectiveness ── */}
      {controls.length > 0 && (
        <div className={styles.card} style={{ marginBottom:"1rem" }}>
          <h3 className={styles.sectionTitle}>🛡 Risk Evaluation Summary — Control Effectiveness</h3>
          {effDistrib.length === 0 ? (
            <p style={{color:"#94a3b8",fontStyle:"italic",fontSize:"0.825rem",padding:"0.5rem 0"}}>
              No evaluated controls available.
            </p>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem", marginTop:"0.5rem" }}>
              {effDistrib.map(d => (
                <div key={d.name} style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
                  <div style={{ width:160, fontSize:"0.775rem", fontWeight:600, color:"#475569", flexShrink:0 }}>{d.name}</div>
                  <div style={{ flex:1, background:"#f1f5f9", borderRadius:99, height:10, overflow:"hidden" }}>
                    <div style={{
                      width:`${Math.round((d.value/controls.length)*100)}%`,
                      height:"100%", background:d.color, borderRadius:99,
                      transition:"width 0.4s",
                    }} />
                  </div>
                  <div style={{ width:50, fontSize:"0.775rem", color:"#64748b", textAlign:"right", flexShrink:0 }}>
                    {d.value} ({Math.round((d.value/controls.length)*100)}%)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Residual Risk Matrix ── */}
      {risks.length > 0 && residualMatrix.length > 0 && (
        <div className={styles.card} style={{ marginBottom:"1rem" }}>
          <h3 className={styles.sectionTitle}>📋 Residual Risk Distribution Matrix</h3>
          <div className={styles.smMatrixWrapper}>
            <table className={styles.smMatrix}>
              <thead>
                <tr>
                  <th>Category</th>
                  {LEVEL_ORDER.map(l => (
                    <th key={l} className={clsx(styles.smMatrixLevelHead, styles[`irRating_${l}`])}>
                      {LEVEL_LABEL[l]}
                    </th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {residualMatrix.map(row => (
                  <tr key={row.category}>
                    <td className={styles.smMatrixCat}>{row.category}</td>
                    {row.counts.map((count, i) => (
                      <td key={i} className={styles.smMatrixCell}>
                        {count > 0 ? (
                          <span className={clsx(styles.smMatrixCount, styles[`irRating_${LEVEL_ORDER[i]}`])}>
                            {count}
                          </span>
                        ) : (
                          <span className={styles.smMatrixZero}>—</span>
                        )}
                      </td>
                    ))}
                    <td className={styles.smMatrixTotal}>{row.counts.reduce((a,b)=>a+b,0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Risk Register ── */}
      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>📝 Risk Register</h3>
        {risks.length === 0 ? (
          <p className={styles.emptyState}>No applicable risks. Go back to Step 3.</p>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Risk Name</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th>Inherent Rating</th>
                  <th>Controls</th>
                  <th>Residual Rating</th>
                  <th>Reduction</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r, idx) => {
                  const ir      = computeRating(r.inherent_likelihood, r.inherent_impact);
                  const rr      = computeRating(r.residual_likelihood, r.residual_impact);
                  const iScore  = (SCORE[r.inherent_likelihood??""??0]??0)*(SCORE[r.inherent_impact??""??0]??0);
                  const rScore  = (SCORE[r.residual_likelihood??""??0]??0)*(SCORE[r.residual_impact??""??0]??0);
                  const red     = iScore>0 ? Math.round(((iScore-rScore)/iScore)*100) : 0;
                  const ctrlCnt = controls.filter(c=>c.risk_id===r.id).length;
                  return (
                    <tr key={r.id}>
                      <td style={{color:"#94a3b8",fontSize:"0.72rem"}}>{idx+1}</td>
                      <td style={{fontWeight:600,fontSize:"0.825rem"}}>{r.name}</td>
                      <td style={{fontSize:"0.78rem",color:"#475569"}}>{r.category}</td>
                      <td>
                        <span style={{
                          fontSize:"0.65rem", fontWeight:800, padding:"0.15rem 0.4rem",
                          borderRadius:3,
                          background: r.source==="EXT"?"#fce7f3":"#d1fae5",
                          color:      r.source==="EXT"?"#9d174d":"#065f46",
                        }}>
                          {r.source==="EXT"?"External":"Insider"}
                        </span>
                      </td>
                      <td>
                        <span className={clsx(styles.irComputedBadge, badgeClass(ir))} style={{fontSize:"0.72rem",padding:"0.15rem 0.5rem"}}>
                          {ir ? LEVEL_LABEL[ir] : "—"}
                        </span>
                      </td>
                      <td style={{textAlign:"center",color:"#64748b",fontSize:"0.8rem"}}>{ctrlCnt}</td>
                      <td>
                        <span className={clsx(styles.irComputedBadge, badgeClass(rr))} style={{fontSize:"0.72rem",padding:"0.15rem 0.5rem"}}>
                          {rr ? LEVEL_LABEL[rr] : "—"}
                        </span>
                      </td>
                      <td>
                        {red>0 ? (
                          <span className={styles.rrReductionGood} style={{fontSize:"0.72rem",padding:"0.15rem 0.45rem",borderRadius:99}}>
                            ↓ {red}%
                          </span>
                        ) : <span style={{color:"#94a3b8",fontSize:"0.72rem"}}>—</span>}
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
