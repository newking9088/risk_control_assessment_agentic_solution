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
  applicable: boolean | null;
  inherent_likelihood: string | null;
  inherent_impact: string | null;
  rationale: string | null;
}

const LEVELS = [
  { value: "low",      label: "Low" },
  { value: "medium",   label: "Medium" },
  { value: "high",     label: "High" },
  { value: "critical", label: "Critical" },
];

// 4×4 inherent risk matrix
const RATING_MATRIX: Record<string, Record<string, string>> = {
  low:      { low: "low",    medium: "low",    high: "medium",   critical: "medium"   },
  medium:   { low: "low",    medium: "medium",  high: "high",     critical: "high"     },
  high:     { low: "medium", medium: "high",    high: "high",     critical: "critical" },
  critical: { low: "medium", medium: "high",    high: "critical", critical: "critical" },
};

function computeRating(likelihood: string | null, impact: string | null): string | null {
  if (!likelihood || !impact) return null;
  return RATING_MATRIX[likelihood]?.[impact] ?? null;
}

const RATING_LABELS: Record<string, string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};

type SourceFilter = "ALL" | "EXT" | "INT";

export function StepInherentRisk({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data: allRisks = [], isLoading } = useQuery<Risk[]>({
    queryKey: ["risks", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/risks`).then((r) => r.json()),
  });

  // Only applicable risks go through rating
  const risks = allRisks.filter((r) => r.applicable === true);

  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [rationaleMap, setRationaleMap] = useState<Record<string, string>>({});

  // Hydrate rationale map from loaded data
  useEffect(() => {
    const map: Record<string, string> = {};
    risks.forEach((r) => { map[r.id] = r.rationale ?? ""; });
    setRationaleMap(map);
  }, [allRisks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first unrated risk, or first risk
  useEffect(() => {
    if (!selectedId && risks.length > 0) {
      const firstUnrated = risks.find((r) => !r.inherent_likelihood || !r.inherent_impact);
      setSelectedId(firstUnrated?.id ?? risks[0].id);
    }
  }, [risks, selectedId]);

  const rated    = risks.filter((r) => r.inherent_likelihood && r.inherent_impact).length;
  const allRated = risks.length > 0 && rated === risks.length;

  useEffect(() => {
    onValidChange(allRated);
  }, [allRated, onValidChange]);

  const patchRisk = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/assessments/${assessmentId}/risks/${id}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risks", assessmentId] }),
  });

  function setLevel(riskId: string, field: "inherent_likelihood" | "inherent_impact", value: string) {
    patchRisk.mutate({ id: riskId, body: { [field]: value } });
  }

  function saveRationale(riskId: string) {
    const val = rationaleMap[riskId] ?? "";
    const current = risks.find((r) => r.id === riskId)?.rationale ?? "";
    if (val !== current) {
      patchRisk.mutate({ id: riskId, body: { rationale: val } });
    }
  }

  // Sidebar filtered list
  const sidebarRisks = risks.filter((r) => sourceFilter === "ALL" || r.source === sourceFilter);
  const categories   = [...new Set(sidebarRisks.map((r) => r.category))].sort();

  const selected = risks.find((r) => r.id === selectedId) ?? null;

  function goNext() {
    const idx = risks.findIndex((r) => r.id === selectedId);
    if (idx < risks.length - 1) setSelectedId(risks[idx + 1].id);
  }

  function goPrev() {
    const idx = risks.findIndex((r) => r.id === selectedId);
    if (idx > 0) setSelectedId(risks[idx - 1].id);
  }

  const selectedIdx = risks.findIndex((r) => r.id === selectedId);

  const computedRating = selected
    ? computeRating(selected.inherent_likelihood, selected.inherent_impact)
    : null;

  if (isLoading) {
    return (
      <div className={styles.step}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Inherent Risk Rating</h2>
        </div>
        <div className={styles.emptyState}>Loading risks…</div>
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className={styles.step}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Inherent Risk Rating</h2>
          <p className={styles.stepDesc}>Rate each applicable risk before controls are applied.</p>
        </div>
        <div className={styles.card}>
          <p className={styles.emptyState}>
            No applicable risks found. Go back to Step 3 and mark at least one risk as applicable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Inherent Risk Rating</h2>
        <p className={styles.stepDesc}>
          Rate each applicable risk before controls — likelihood × impact.
          <span className={styles.progressHint}>{rated} / {risks.length} rated</span>
          {!allRated && (
            <span className={styles.reviewHint}>{risks.length - rated} unrated</span>
          )}
        </p>
      </div>

      <div className={styles.irLayout}>
        {/* ── Sidebar ── */}
        <div className={styles.irSidebar}>
          {/* Source filter */}
          <div className={styles.irSidebarFilter}>
            {(["ALL", "EXT", "INT"] as SourceFilter[]).map((v) => (
              <button
                key={v}
                type="button"
                className={clsx(styles.irFilterBtn, { [styles.irFilterBtnActive]: sourceFilter === v })}
                onClick={() => setSourceFilter(v)}
              >
                {v === "ALL" ? "All" : v === "EXT" ? "External" : "Insider"}
              </button>
            ))}
          </div>

          {/* Risk list by category */}
          <div className={styles.irSidebarList}>
            {categories.map((cat) => (
              <div key={cat}>
                <div className={styles.irCategoryHeader}>{cat}</div>
                {sidebarRisks
                  .filter((r) => r.category === cat)
                  .map((r) => {
                    const isRated = !!(r.inherent_likelihood && r.inherent_impact);
                    const rating  = computeRating(r.inherent_likelihood, r.inherent_impact);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={clsx(styles.irRiskCard, {
                          [styles.irRiskCardActive]: r.id === selectedId,
                        })}
                        onClick={() => setSelectedId(r.id)}
                      >
                        <div className={styles.irRiskCardTop}>
                          <span className={clsx(
                            styles.irSourceBadge,
                            r.source === "EXT" ? styles.irBadgeExt : styles.irBadgeInt
                          )}>
                            {r.source === "EXT" ? "EXT" : "INT"}
                          </span>
                          <span className={clsx(
                            styles.irStatusPill,
                            isRated ? styles.irStatusRated : styles.irStatusUnrated
                          )}>
                            {isRated ? RATING_LABELS[rating!] ?? "Rated" : "Unrated"}
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
              Select a risk from the list to rate it.
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className={styles.irDetailHeader}>
                <div>
                  <div className={styles.irDetailTitle}>{selected.name}</div>
                  <div className={styles.irDetailMeta}>
                    <span className={clsx(
                      styles.irSourceBadge,
                      selected.source === "EXT" ? styles.irBadgeExt : styles.irBadgeInt
                    )}>
                      {selected.source === "EXT" ? "External Fraud" : "Insider Threat"}
                    </span>
                    <span className={styles.irDetailCategory}>{selected.category}</span>
                  </div>
                </div>
                <div className={styles.irNavBtns}>
                  <button
                    type="button"
                    className={styles.irNavBtn}
                    onClick={goPrev}
                    disabled={selectedIdx <= 0}
                  >← Prev</button>
                  <span className={styles.irNavCount}>{selectedIdx + 1} / {risks.length}</span>
                  <button
                    type="button"
                    className={styles.irNavBtn}
                    onClick={goNext}
                    disabled={selectedIdx >= risks.length - 1}
                  >Next →</button>
                </div>
              </div>

              {/* Rating panels */}
              <div className={styles.irRatingPanels}>
                {/* Likelihood */}
                <div className={styles.irRatingPanel}>
                  <div className={styles.irRatingPanelLabel}>Likelihood</div>
                  <p className={styles.irRatingPanelHint}>How likely is this risk to materialise?</p>
                  <div className={styles.irLevelButtons}>
                    {LEVELS.map((l) => (
                      <button
                        key={l.value}
                        type="button"
                        className={clsx(
                          styles.irLevelBtn,
                          styles[`irLevel_${l.value}`],
                          { [styles.irLevelActive]: selected.inherent_likelihood === l.value }
                        )}
                        onClick={() => setLevel(selected.id, "inherent_likelihood", l.value)}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Impact */}
                <div className={styles.irRatingPanel}>
                  <div className={styles.irRatingPanelLabel}>Impact</div>
                  <p className={styles.irRatingPanelHint}>What is the severity if this risk occurs?</p>
                  <div className={styles.irLevelButtons}>
                    {LEVELS.map((l) => (
                      <button
                        key={l.value}
                        type="button"
                        className={clsx(
                          styles.irLevelBtn,
                          styles[`irLevel_${l.value}`],
                          { [styles.irLevelActive]: selected.inherent_impact === l.value }
                        )}
                        onClick={() => setLevel(selected.id, "inherent_impact", l.value)}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Computed rating */}
              {computedRating ? (
                <div className={styles.irComputedRow}>
                  <span className={styles.irComputedLabel}>Inherent Risk Rating</span>
                  <span className={clsx(styles.irComputedBadge, styles[`irRating_${computedRating}`])}>
                    {RATING_LABELS[computedRating]}
                  </span>
                  <span className={styles.irComputedFormula}>
                    {RATING_LABELS[selected.inherent_likelihood!]} likelihood ×{" "}
                    {RATING_LABELS[selected.inherent_impact!]} impact
                  </span>
                </div>
              ) : (
                <div className={styles.irComputedRow}>
                  <span className={styles.irComputedLabel}>Inherent Risk Rating</span>
                  <span className={styles.irComputedPending}>Rate both likelihood and impact to compute</span>
                </div>
              )}

              {/* Rationale */}
              <div className={styles.irRationaleSection}>
                <div className={styles.irRatingPanelLabel}>Rationale</div>
                <textarea
                  className={styles.irRationaleInput}
                  placeholder="Document the reasoning behind these ratings…"
                  rows={3}
                  value={rationaleMap[selected.id] ?? ""}
                  onChange={(e) => setRationaleMap((m) => ({ ...m, [selected.id]: e.target.value }))}
                  onBlur={() => saveRationale(selected.id)}
                />
              </div>

              {/* Next button */}
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
