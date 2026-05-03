import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, ClipboardCheck, Scale, Users, Star } from "lucide-react";
import { api } from "@/lib/api";
import clsx from "clsx";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

type DimKey = "likelihood" | "financial" | "regulatory" | "legal" | "customer" | "reputational";

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
  likelihood_rationale: string | null;
  financial_rationale: string | null;
  regulatory_rationale: string | null;
  legal_rationale: string | null;
  customer_rationale: string | null;
  reputational_rationale: string | null;
}

const LIKELIHOOD_LABELS: Record<number, string> = {
  1: "Unlikely", 2: "Possible", 3: "Likely", 4: "Almost Certain",
};

const IMPACT_LABELS: Record<number, string> = {
  1: "Low", 2: "Medium", 3: "High", 4: "Very High",
};

// 4×4 matrix [likelihood 1-4][impact 1-4] → inherent rating 1-4
const IR_MATRIX: number[][] = [
  [0, 0, 0, 0, 0],  // padding
  [0, 1, 1, 2, 2],  // likelihood 1
  [0, 1, 2, 3, 3],  // likelihood 2
  [0, 2, 3, 3, 4],  // likelihood 3
  [0, 2, 3, 4, 4],  // likelihood 4
];

type DimIcon = typeof DollarSign;
const IMPACT_DIMS: { key: DimKey; label: string; Icon: DimIcon }[] = [
  { key: "financial",     label: "Financial",     Icon: DollarSign    },
  { key: "regulatory",   label: "Regulatory",    Icon: ClipboardCheck },
  { key: "legal",        label: "Legal",          Icon: Scale         },
  { key: "customer",     label: "Customer",       Icon: Users         },
  { key: "reputational", label: "Reputational",   Icon: Star          },
];

type SourceFilter = "ALL" | "EXT" | "INT";

function scoreBadgeClass(score: number | null): string {
  const map: Record<number, string> = {
    1: styles.irScore1,
    2: styles.irScore2,
    3: styles.irScore3,
    4: styles.irScore4,
  };
  return score !== null ? (map[score] ?? styles.irScoreNull) : styles.irScoreNull;
}

function likelihoodLabel(score: number | null): string {
  if (score === null) return "Not set";
  return `${score} — ${LIKELIHOOD_LABELS[score] ?? ""}`;
}

function impactLabel(score: number | null): string {
  if (score === null) return "Not set";
  return `${score} — ${IMPACT_LABELS[score] ?? ""}`;
}

function computeOverallImpact(scores: Record<string, number | null>): number | null {
  const vals = IMPACT_DIMS
    .map((d) => scores[d.key])
    .filter((v): v is number => v !== null);
  return vals.length > 0 ? Math.max(...vals) : null;
}

function computeInherentRating(likelihood: number | null, impact: number | null): number | null {
  if (likelihood === null || impact === null) return null;
  return IR_MATRIX[likelihood]?.[impact] ?? null;
}

function isFullyRated(r: RiskRecord): boolean {
  return (
    r.likelihood_score !== null &&
    r.financial_impact !== null &&
    r.regulatory_impact !== null &&
    r.legal_impact !== null &&
    r.customer_impact !== null &&
    r.reputational_impact !== null
  );
}

export function StepInherentRisk({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data: allRisks = [], isLoading } = useQuery<RiskRecord[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  const risks = allRisks.filter((r) => r.applicable === true);

  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");

  // Local state: scores and rationales per risk per dim (for optimistic UI)
  const [localScores, setLocalScores]         = useState<Record<string, Record<string, number | null>>>({});
  const [localRationales, setLocalRationales] = useState<Record<string, Record<string, string>>>({});

  // Hydrate from server — only populate risks not yet in local state,
  // so that a refetch after mutation does not overwrite in-progress edits.
  useEffect(() => {
    setLocalScores((prev) => {
      const next = { ...prev };
      risks.forEach((r) => {
        if (!next[r.id]) {
          next[r.id] = {
            likelihood:   r.likelihood_score,
            financial:    r.financial_impact,
            regulatory:   r.regulatory_impact,
            legal:        r.legal_impact,
            customer:     r.customer_impact,
            reputational: r.reputational_impact,
          };
        }
      });
      return next;
    });
    setLocalRationales((prev) => {
      const next = { ...prev };
      risks.forEach((r) => {
        if (!next[r.id]) {
          next[r.id] = {
            likelihood:   r.likelihood_rationale   ?? "",
            financial:    r.financial_rationale    ?? "",
            regulatory:   r.regulatory_rationale   ?? "",
            legal:        r.legal_rationale        ?? "",
            customer:     r.customer_rationale     ?? "",
            reputational: r.reputational_rationale ?? "",
          };
        }
      });
      return next;
    });
  }, [allRisks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first unrated risk
  useEffect(() => {
    if (!selectedId && risks.length > 0) {
      const first = risks.find((r) => !isFullyRated(r)) ?? risks[0];
      setSelectedId(first.id);
    }
  }, [risks, selectedId]);

  // Validate against local state so the Continue button reacts immediately
  // without waiting for a server round-trip.
  const ratedCount = risks.filter((r) => {
    const s = localScores[r.id];
    return s &&
      s.likelihood   !== null && s.likelihood   !== undefined &&
      s.financial    !== null && s.financial    !== undefined &&
      s.regulatory   !== null && s.regulatory   !== undefined &&
      s.legal        !== null && s.legal        !== undefined &&
      s.customer     !== null && s.customer     !== undefined &&
      s.reputational !== null && s.reputational !== undefined;
  }).length;
  const allRated = risks.length > 0 && ratedCount === risks.length;

  useEffect(() => {
    onValidChange(allRated);
  }, [allRated, onValidChange]);

  const patchRisk = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/assessments/${assessmentId}/risks/${id}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risks", assessmentId] }),
  });

  function getScore(riskId: string, dim: DimKey): number | null {
    return localScores[riskId]?.[dim] ?? null;
  }

  function getRationale(riskId: string, dim: DimKey): string {
    return localRationales[riskId]?.[dim] ?? "";
  }

  function handleScoreChange(riskId: string, dim: DimKey, value: number) {
    setLocalScores((prev) => ({
      ...prev,
      [riskId]: { ...prev[riskId], [dim]: value },
    }));
  }

  function commitScore(riskId: string, dim: DimKey) {
    const value = localScores[riskId]?.[dim];
    if (value === null || value === undefined) return;
    const field = dim === "likelihood" ? "likelihood_score" : `${dim}_impact`;
    patchRisk.mutate({ id: riskId, body: { [field]: value } });
  }

  function handleRationaleChange(riskId: string, dim: DimKey, value: string) {
    setLocalRationales((prev) => ({
      ...prev,
      [riskId]: { ...prev[riskId], [dim]: value },
    }));
  }

  function commitRationale(riskId: string, dim: DimKey) {
    const value   = localRationales[riskId]?.[dim] ?? "";
    const field   = dim === "likelihood" ? "likelihood_rationale" : `${dim}_rationale`;
    patchRisk.mutate({ id: riskId, body: { [field]: value } });
  }

  function riskComputedRating(riskId: string): number | null {
    const likelihood = getScore(riskId, "likelihood");
    const overall    = computeOverallImpact(localScores[riskId] ?? {});
    return computeInherentRating(likelihood, overall);
  }

  const sidebarRisks = risks.filter((r) => sourceFilter === "ALL" || r.source === sourceFilter);
  const categories   = [...new Set(sidebarRisks.map((r) => r.category))].sort();
  const selected     = risks.find((r) => r.id === selectedId) ?? null;
  const selectedIdx  = risks.findIndex((r) => r.id === selectedId);

  function goNext() { if (selectedIdx < risks.length - 1) setSelectedId(risks[selectedIdx + 1].id); }
  function goPrev() { if (selectedIdx > 0) setSelectedId(risks[selectedIdx - 1].id); }

  if (isLoading) {
    return (
      <div className={styles.step}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Step 4: Inherent Risk Rating (AI Suggested)</h2>
        </div>
        <div className={styles.emptyState}>Loading risks…</div>
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className={styles.step}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Step 4: Inherent Risk Rating (AI Suggested)</h2>
          <p className={styles.stepDesc}>Rate likelihood and impact for each applicable risk to determine inherent risk.</p>
        </div>
        <div className={styles.card}>
          <p className={styles.emptyState}>
            No applicable risks found. Go back to Step 3 and mark at least one risk as applicable.
          </p>
        </div>
      </div>
    );
  }

  // Derived values for the selected risk
  const selLikelihood    = selected ? getScore(selected.id, "likelihood") : null;
  const selImpactScores  = selected ? localScores[selected.id] ?? {} : {};
  const selOverallImpact = computeOverallImpact(selImpactScores);
  const selInherentRating = computeInherentRating(selLikelihood, selOverallImpact);

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Step 4: Inherent Risk Rating (AI Suggested)</h2>
        <p className={styles.stepDesc}>
          Rate likelihood and impact for each applicable risk to determine inherent risk.{" "}
          <span className={styles.riskDecidedCount}>{ratedCount} / {risks.length} rated</span>
          {!allRated && risks.length - ratedCount > 0 && (
            <span className={styles.riskUndecidedHint} style={{ marginLeft: "0.5rem" }}>
              {risks.length - ratedCount} unrated
            </span>
          )}
        </p>
      </div>

      <div className={styles.irLayout}>

        {/* ── Sidebar ── */}
        <div className={styles.irSidebar}>
          <div className={styles.irSidebarFilter}>
            {(["ALL", "EXT", "INT"] as SourceFilter[]).map((v) => (
              <button
                key={v}
                type="button"
                className={clsx(styles.irFilterBtn, v === sourceFilter && styles.irFilterBtnActive)}
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
                  const rating = riskComputedRating(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={clsx(styles.irRiskCard, r.id === selectedId && styles.irRiskCardActive)}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <div className={styles.irRiskCardRow}>
                        <span className={clsx(
                          styles.irSourceBadge,
                          r.source === "EXT" ? styles.irBadgeExt : styles.irBadgeInt,
                        )}>
                          {r.source}
                        </span>
                        <span className={styles.irRiskName}>{r.name}</span>
                        <span className={clsx(styles.irStatusPill, scoreBadgeClass(rating))}>
                          {rating !== null ? IMPACT_LABELS[rating] : "Unrated"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Detail Panel ── */}
        <div className={styles.irDetail}>
          {!selected ? (
            <div className={styles.emptyState} style={{ padding: "3rem" }}>
              Select a risk from the list to rate it.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className={styles.irDetailHeader}>
                <div>
                  <div className={styles.irDetailRef}>
                    <span className={clsx(
                      styles.irSourceBadge,
                      selected.source === "EXT" ? styles.irBadgeExt : styles.irBadgeInt,
                    )}>
                      {selected.source === "EXT" ? "External" : "Internal"}
                    </span>
                    {selected.taxonomy_risk_id && (
                      <>
                        <span className={styles.irDetailRefSep}>|</span>
                        <span>{selected.taxonomy_risk_id}</span>
                      </>
                    )}
                    <span className={styles.irDetailRefSep}>—</span>
                    <span className={styles.irDetailCategory}>{selected.category}</span>
                  </div>
                  <div className={styles.irDetailTitle}>{selected.name}</div>
                </div>

                <div className={styles.irDetailHeaderRight}>
                  <span className={clsx(styles.irDetailInherentBadge, scoreBadgeClass(selInherentRating))}>
                    Inherent Risk:{" "}
                    {selInherentRating !== null ? IMPACT_LABELS[selInherentRating] : "Pending"}
                  </span>
                  <div className={styles.irNavBtns}>
                    <button type="button" className={styles.irNavBtn} onClick={goPrev} disabled={selectedIdx <= 0}>
                      ← Prev
                    </button>
                    <span className={styles.irNavCount}>{selectedIdx + 1} / {risks.length}</span>
                    <button type="button" className={styles.irNavBtn} onClick={goNext} disabled={selectedIdx >= risks.length - 1}>
                      Next →
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Likelihood Section ── */}
              <div className={styles.irSection}>
                <div className={styles.irSectionHeader}>
                  <span className={styles.irSectionTitle}>Likelihood</span>
                  {selLikelihood !== null && (
                    <span className={clsx(styles.irOverallBadge, scoreBadgeClass(selLikelihood))}>
                      {likelihoodLabel(selLikelihood)}
                    </span>
                  )}
                </div>
                <div className={styles.irDimRow}>
                  <div className={styles.irDimLeft}>
                    <div className={styles.irDimLabel}>Rating</div>
                    <div className={styles.irDimSliderRow}>
                      <span className={styles.irDimSliderEdge}>1</span>
                      <input
                        type="range"
                        min={1} max={4} step={1}
                        className={styles.irSliderInput}
                        value={selLikelihood ?? 2}
                        onChange={(e) => handleScoreChange(selected.id, "likelihood", Number(e.target.value))}
                        onMouseUp={() => commitScore(selected.id, "likelihood")}
                        onTouchEnd={() => commitScore(selected.id, "likelihood")}
                      />
                      <span className={styles.irDimSliderEdge}>4</span>
                      <span className={clsx(styles.irDimValue, scoreBadgeClass(selLikelihood))}>
                        {likelihoodLabel(selLikelihood)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.irDimRight}>
                    <textarea
                      className={styles.irDimRationale}
                      placeholder="Describe the reasoning for this likelihood rating…"
                      value={getRationale(selected.id, "likelihood")}
                      onChange={(e) => handleRationaleChange(selected.id, "likelihood", e.target.value)}
                      onBlur={() => commitRationale(selected.id, "likelihood")}
                    />
                  </div>
                </div>
              </div>

              {/* ── Impact Ratings by Category ── */}
              <div className={styles.irSection}>
                <div className={styles.irSectionHeader}>
                  <span className={styles.irSectionTitle}>Impact Ratings by Category</span>
                  {selOverallImpact !== null && (
                    <span className={clsx(styles.irOverallBadge, scoreBadgeClass(selOverallImpact))}>
                      Overall Impact: {impactLabel(selOverallImpact)}
                    </span>
                  )}
                </div>

                {IMPACT_DIMS.map((dim) => {
                  const score = getScore(selected.id, dim.key);
                  return (
                    <div key={dim.key} className={styles.irDimRow}>
                      <div className={styles.irDimLeft}>
                        <div className={styles.irDimLabel}>
                          <dim.Icon size={14} className={styles.irDimIcon} />
                          {dim.label}
                        </div>
                        <div className={styles.irDimSliderRow}>
                          <span className={styles.irDimSliderEdge}>1</span>
                          <input
                            type="range"
                            min={1} max={4} step={1}
                            className={styles.irSliderInput}
                            value={score ?? 2}
                            onChange={(e) => handleScoreChange(selected.id, dim.key, Number(e.target.value))}
                            onMouseUp={() => commitScore(selected.id, dim.key)}
                            onTouchEnd={() => commitScore(selected.id, dim.key)}
                          />
                          <span className={styles.irDimSliderEdge}>4</span>
                          <span className={clsx(styles.irDimValue, scoreBadgeClass(score))}>
                            {impactLabel(score)}
                          </span>
                        </div>
                      </div>
                      <div className={styles.irDimRight}>
                        <textarea
                          className={styles.irDimRationale}
                          placeholder={`Describe the ${dim.label.toLowerCase()} impact reasoning…`}
                          value={getRationale(selected.id, dim.key)}
                          onChange={(e) => handleRationaleChange(selected.id, dim.key, e.target.value)}
                          onBlur={() => commitRationale(selected.id, dim.key)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedIdx < risks.length - 1 && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
