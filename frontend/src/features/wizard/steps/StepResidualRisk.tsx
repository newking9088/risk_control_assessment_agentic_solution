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
  residual_likelihood: string | null;
  residual_impact: string | null;
  rationale: string | null;
}

interface Control {
  id: string;
  risk_id: string;
  overall_effectiveness: string | null;
}

// ── Helpers ───────────────────────────────────────────────────
const RATING_MATRIX: Record<string, Record<string, string>> = {
  low:      { low: "low",    medium: "low",    high: "medium",   critical: "medium"   },
  medium:   { low: "low",    medium: "medium",  high: "high",     critical: "high"     },
  high:     { low: "medium", medium: "high",    high: "high",     critical: "critical" },
  critical: { low: "medium", medium: "high",    high: "critical", critical: "critical" },
};

const LEVEL_SCORE: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
const SCORE_LEVEL: Record<number, string> = { 1: "low", 2: "medium", 3: "high", 4: "critical" };
const RATING_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

function computeRating(likelihood: string | null, impact: string | null): string | null {
  if (!likelihood || !impact) return null;
  return RATING_MATRIX[likelihood]?.[impact] ?? null;
}

// Effectiveness → numeric score (1-4)
const EFF_SCORE: Record<string, number> = {
  "Effective": 4, "Partially Effective": 2, "Needs Improvement": 1.5, "Ineffective": 1,
};

function aggregateControlsEff(controls: Control[]): { label: string; score: number } | null {
  if (controls.length === 0) return null;
  const scores = controls.map((c) => EFF_SCORE[c.overall_effectiveness ?? ""] ?? 0).filter((s) => s > 0);
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 3.5) return { label: "Effective",            score: avg };
  if (avg >= 2.5) return { label: "Partially Effective",  score: avg };
  if (avg >= 1.5) return { label: "Needs Improvement",    score: avg };
  return           { label: "Ineffective",                score: avg };
}

// Suggest residual level: reduce inherent by one step if controls are good
function suggestResidual(inherent: string | null, ctrlEff: string | null): string | null {
  if (!inherent) return null;
  const score = LEVEL_SCORE[inherent] ?? 0;
  if (!ctrlEff) return inherent;
  const reduction =
    ctrlEff === "Effective"           ? 2 :
    ctrlEff === "Partially Effective" ? 1 :
    0;
  return SCORE_LEVEL[Math.max(1, score - reduction)] ?? inherent;
}

function reductionPct(iLikelihood: string | null, iImpact: string | null,
                      rLikelihood: string | null, rImpact: string | null): number | null {
  if (!iLikelihood || !iImpact || !rLikelihood || !rImpact) return null;
  const iScore = (LEVEL_SCORE[iLikelihood] ?? 0) * (LEVEL_SCORE[iImpact] ?? 0);
  const rScore = (LEVEL_SCORE[rLikelihood] ?? 0) * (LEVEL_SCORE[rImpact] ?? 0);
  if (iScore === 0) return null;
  return Math.round(((iScore - rScore) / iScore) * 100);
}

const LEVELS = [
  { value: "low",      label: "Low"      },
  { value: "medium",   label: "Medium"   },
  { value: "high",     label: "High"     },
  { value: "critical", label: "Critical" },
];

function ratingBadgeClass(rating: string | null, prefix: string) {
  if (!rating) return styles[`${prefix}Null`];
  return styles[`${prefix}${rating.charAt(0).toUpperCase() + rating.slice(1)}`];
}

function ctrlEffBadgeClass(label: string | null) {
  if (!label) return styles.rrEffNull;
  if (label === "Effective")           return styles.rrEffEffective;
  if (label === "Partially Effective") return styles.rrEffPartial;
  if (label === "Needs Improvement")   return styles.rrEffNeeds;
  return styles.rrEffIneffective;
}

type SourceFilter = "ALL" | "EXT" | "INT";

// ── Main component ────────────────────────────────────────────
export function StepResidualRisk({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data: allRisks = [], isLoading } = useQuery<Risk[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  const { data: controls = [] } = useQuery<Control[]>({
    queryKey: ["controls", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/controls`).then((r) => r.json()),
  });

  const risks = allRisks.filter((r) => r.applicable === true);

  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [rationaleMap, setRationaleMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const map: Record<string, string> = {};
    risks.forEach((r) => { map[r.id] = r.rationale ?? ""; });
    setRationaleMap(map);
  }, [allRisks]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId && risks.length > 0) {
      const firstUnrated = risks.find((r) => !r.residual_likelihood || !r.residual_impact);
      setSelectedId(firstUnrated?.id ?? risks[0].id);
    }
  }, [risks, selectedId]);

  const rated    = risks.filter((r) => r.residual_likelihood && r.residual_impact).length;
  const allRated = risks.length > 0 && rated === risks.length;

  useEffect(() => { onValidChange(allRated); }, [allRated, onValidChange]);

  const patchRisk = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/assessments/${assessmentId}/risks/${id}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risks", assessmentId] }),
  });

  function setLevel(riskId: string, field: "residual_likelihood" | "residual_impact", value: string) {
    patchRisk.mutate({ id: riskId, body: { [field]: value } });
  }

  function saveRationale(riskId: string) {
    const val     = rationaleMap[riskId] ?? "";
    const current = risks.find((r) => r.id === riskId)?.rationale ?? "";
    if (val !== current) patchRisk.mutate({ id: riskId, body: { rationale: val } });
  }

  const sidebarRisks = risks.filter((r) => sourceFilter === "ALL" || r.source === sourceFilter);
  const categories   = [...new Set(sidebarRisks.map((r) => r.category))].sort();
  const selected     = risks.find((r) => r.id === selectedId) ?? null;
  const selectedIdx  = risks.findIndex((r) => r.id === selectedId);

  function goNext() { if (selectedIdx < risks.length - 1) setSelectedId(risks[selectedIdx + 1].id); }
  function goPrev() { if (selectedIdx > 0) setSelectedId(risks[selectedIdx - 1].id); }

  // Controls for selected risk
  const selectedControls = controls.filter((c) => c.risk_id === (selected?.id ?? ""));
  const ctrlEff          = aggregateControlsEff(selectedControls);
  const computedResidual = selected
    ? computeRating(selected.residual_likelihood, selected.residual_impact)
    : null;
  const inherentRating = selected
    ? computeRating(selected.inherent_likelihood, selected.inherent_impact)
    : null;
  const reduction = selected
    ? reductionPct(selected.inherent_likelihood, selected.inherent_impact,
                   selected.residual_likelihood, selected.residual_impact)
    : null;

  if (isLoading) return (
    <div className={styles.step}>
      <div className={styles.stepHeader}><h2 className={styles.stepTitle}>Residual Risk</h2></div>
      <div className={styles.emptyState}>Loading…</div>
    </div>
  );

  if (risks.length === 0) return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Residual Risk</h2>
        <p className={styles.stepDesc}>Re-rate each risk after applying controls.</p>
      </div>
      <div className={styles.card}>
        <p className={styles.emptyState}>No applicable risks found. Go back to Step 3.</p>
      </div>
    </div>
  );

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Residual Risk Rating</h2>
        <p className={styles.stepDesc}>
          Re-rate each risk after applying controls to calculate final residual exposure.
          <span className={styles.progressHint}>{rated} / {risks.length} rated</span>
          {!allRated && <span className={styles.reviewHint}>{risks.length - rated} unrated</span>}
        </p>
      </div>

      <div className={styles.irLayout}>
        {/* ── Sidebar ── */}
        <div className={styles.irSidebar}>
          <div className={styles.irSidebarFilter}>
            {(["ALL", "EXT", "INT"] as SourceFilter[]).map((v) => (
              <button key={v} type="button"
                className={clsx(styles.irFilterBtn, { [styles.irFilterBtnActive]: sourceFilter === v })}
                onClick={() => setSourceFilter(v)}
              >
                {v === "ALL" ? "All" : v === "EXT" ? "External" : "Insider"}
              </button>
            ))}
          </div>

          <div className={styles.irSidebarList}>
            {categories.map((cat) => (
              <div key={cat}>
                <div className={styles.irCategoryHeader}>{cat}</div>
                {sidebarRisks.filter((r) => r.category === cat).map((r) => {
                  const residualRating = computeRating(r.residual_likelihood, r.residual_impact);
                  const isRated = !!(r.residual_likelihood && r.residual_impact);
                  return (
                    <button key={r.id} type="button"
                      className={clsx(styles.irRiskCard, { [styles.irRiskCardActive]: r.id === selectedId })}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <div className={styles.irRiskCardTop}>
                        <span className={clsx(styles.irSourceBadge,
                          r.source === "EXT" ? styles.irBadgeExt : styles.irBadgeInt)}>
                          {r.source === "EXT" ? "EXT" : "INT"}
                        </span>
                        <span className={clsx(styles.irStatusPill,
                          isRated ? styles.irStatusRated : styles.irStatusUnrated)}>
                          {isRated ? (RATING_LABEL[residualRating!] ?? "Rated") : "Unrated"}
                        </span>
                      </div>
                      <div className={styles.irRiskName}>{r.name}</div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Detail panel ── */}
        <div className={styles.irDetail}>
          {!selected ? (
            <div className={styles.emptyState} style={{ padding: "3rem" }}>
              Select a risk from the list.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className={styles.irDetailHeader}>
                <div>
                  <div className={styles.irDetailTitle}>{selected.name}</div>
                  <div className={styles.irDetailMeta}>
                    <span className={clsx(styles.irSourceBadge,
                      selected.source === "EXT" ? styles.irBadgeExt : styles.irBadgeInt)}>
                      {selected.source === "EXT" ? "External Fraud" : "Insider Threat"}
                    </span>
                    <span className={styles.irDetailCategory}>{selected.category}</span>
                  </div>
                </div>
                <div className={styles.irNavBtns}>
                  <button type="button" className={styles.irNavBtn} onClick={goPrev} disabled={selectedIdx <= 0}>← Prev</button>
                  <span className={styles.irNavCount}>{selectedIdx + 1} / {risks.length}</span>
                  <button type="button" className={styles.irNavBtn} onClick={goNext} disabled={selectedIdx >= risks.length - 1}>Next →</button>
                </div>
              </div>

              {/* Comparison band */}
              <div className={styles.rrComparisonBand}>
                <div className={styles.rrCompItem}>
                  <div className={styles.rrCompLabel}>Inherent Rating</div>
                  <span className={clsx(styles.rrCompBadge,
                    inherentRating ? styles[`irRating_${inherentRating}`] : styles.rrBadgeNull)}>
                    {inherentRating ? RATING_LABEL[inherentRating] : "—"}
                  </span>
                </div>
                <div className={styles.rrCompArrow}>→</div>
                <div className={styles.rrCompItem}>
                  <div className={styles.rrCompLabel}>Controls Effectiveness</div>
                  <span className={clsx(styles.rrCompBadge, ctrlEffBadgeClass(ctrlEff?.label ?? null))}>
                    {ctrlEff ? ctrlEff.label : "No controls"}
                  </span>
                </div>
                <div className={styles.rrCompArrow}>→</div>
                <div className={styles.rrCompItem}>
                  <div className={styles.rrCompLabel}>Residual Rating</div>
                  <span className={clsx(styles.rrCompBadge,
                    computedResidual ? styles[`irRating_${computedResidual}`] : styles.rrBadgeNull)}>
                    {computedResidual ? RATING_LABEL[computedResidual] : "—"}
                  </span>
                  {reduction !== null && (
                    <span className={clsx(styles.rrReduction,
                      reduction > 0 ? styles.rrReductionGood : styles.rrReductionNone)}>
                      {reduction > 0 ? `↓ ${reduction}% reduction` : "No change"}
                    </span>
                  )}
                </div>
              </div>

              {/* Suggest residual hint */}
              {ctrlEff && (!selected.residual_likelihood || !selected.residual_impact) && (() => {
                const suggested = suggestResidual(inherentRating, ctrlEff.label);
                return suggested ? (
                  <div className={styles.rrSuggestBanner}>
                    💡 Based on {ctrlEff.label} controls, suggested residual level:{" "}
                    <strong>{RATING_LABEL[suggested]}</strong>
                    {" — "}
                    <button type="button" className={styles.rrSuggestApply}
                      onClick={() => {
                        patchRisk.mutate({ id: selected.id, body: {
                          residual_likelihood: suggested,
                          residual_impact: suggested,
                        }});
                      }}>
                      Apply suggestion
                    </button>
                  </div>
                ) : null;
              })()}

              {/* Rating panels */}
              <div className={styles.irRatingPanels}>
                <div className={styles.irRatingPanel}>
                  <div className={styles.irRatingPanelLabel}>Residual Likelihood</div>
                  <p className={styles.irRatingPanelHint}>
                    Likelihood after controls are applied.
                    {selected.inherent_likelihood && (
                      <span className={styles.rrInherentHint}>
                        {" "}(Inherent: {RATING_LABEL[selected.inherent_likelihood]})
                      </span>
                    )}
                  </p>
                  <div className={styles.irLevelButtons}>
                    {LEVELS.map((l) => (
                      <button key={l.value} type="button"
                        className={clsx(styles.irLevelBtn, styles[`irLevel_${l.value}`],
                          { [styles.irLevelActive]: selected.residual_likelihood === l.value })}
                        onClick={() => setLevel(selected.id, "residual_likelihood", l.value)}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.irRatingPanel}>
                  <div className={styles.irRatingPanelLabel}>Residual Impact</div>
                  <p className={styles.irRatingPanelHint}>
                    Impact severity after controls are applied.
                    {selected.inherent_impact && (
                      <span className={styles.rrInherentHint}>
                        {" "}(Inherent: {RATING_LABEL[selected.inherent_impact]})
                      </span>
                    )}
                  </p>
                  <div className={styles.irLevelButtons}>
                    {LEVELS.map((l) => (
                      <button key={l.value} type="button"
                        className={clsx(styles.irLevelBtn, styles[`irLevel_${l.value}`],
                          { [styles.irLevelActive]: selected.residual_impact === l.value })}
                        onClick={() => setLevel(selected.id, "residual_impact", l.value)}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Computed residual */}
              {computedResidual ? (
                <div className={styles.irComputedRow}>
                  <span className={styles.irComputedLabel}>Residual Risk Rating</span>
                  <span className={clsx(styles.irComputedBadge, styles[`irRating_${computedResidual}`])}>
                    {RATING_LABEL[computedResidual]}
                  </span>
                  <span className={styles.irComputedFormula}>
                    {RATING_LABEL[selected.residual_likelihood!]} likelihood ×{" "}
                    {RATING_LABEL[selected.residual_impact!]} impact
                  </span>
                  {reduction !== null && (
                    <span className={clsx(styles.rrReduction,
                      reduction > 0 ? styles.rrReductionGood : styles.rrReductionNone)}>
                      {reduction > 0 ? `↓ ${reduction}% vs inherent` : "No reduction from inherent"}
                    </span>
                  )}
                </div>
              ) : (
                <div className={styles.irComputedRow}>
                  <span className={styles.irComputedLabel}>Residual Risk Rating</span>
                  <span className={styles.irComputedPending}>Rate both likelihood and impact to compute</span>
                </div>
              )}

              {/* Rationale */}
              <div className={styles.irRationaleSection}>
                <div className={styles.irRatingPanelLabel}>Rationale</div>
                <textarea
                  className={styles.irRationaleInput}
                  placeholder="Explain why these residual ratings reflect the effectiveness of controls applied…"
                  rows={3}
                  value={rationaleMap[selected.id] ?? ""}
                  onChange={(e) => setRationaleMap((m) => ({ ...m, [selected.id]: e.target.value }))}
                  onBlur={() => saveRationale(selected.id)}
                />
              </div>

              {selectedIdx < risks.length - 1 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
                  <button type="button" className={styles.confirmBtn} onClick={goNext}>
                    Next Risk →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
