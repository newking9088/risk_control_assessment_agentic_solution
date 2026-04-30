import styles from "./Tab.module.scss";

interface Props {
  draft: Record<string, unknown>;
  patch: (key: string, value: unknown) => void;
}

const FRAMEWORK_OPTIONS = [
  { id: "standard",  label: "Standard",  desc: "Default 4×4 likelihood × impact matrix" },
  { id: "advanced",  label: "Advanced",  desc: "Weighted scoring with control factors" },
  { id: "custom",    label: "Custom",    desc: "Fully configurable framework" },
];

const RATING_TIERS = [
  { id: "4tier", label: "4 Tier (Low / Medium / High / Critical)" },
  { id: "5tier", label: "5 Tier (Very Low / Low / Medium / High / Critical)" },
];

const SEVERITY_OPTIONS = [
  { id: "worst_case",  label: "Worst Case",  desc: "Use the higher of likelihood or impact" },
  { id: "average",     label: "Average",     desc: "Average of likelihood and impact scores" },
  { id: "product",     label: "Product",     desc: "Multiply likelihood × impact" },
];

const DOC_ANALYSIS_OPTIONS = [
  { id: "flag_unrated",  label: "Flag Unrated Controls" },
  { id: "skip_unrated",  label: "Skip Unrated Controls" },
  { id: "auto_rate",     label: "Auto-rate from Document" },
];

const PROFILE_CONFLICT_OPTIONS = [
  { id: "profile_wins_unless_scanned", label: "Profile wins unless document scanned" },
  { id: "document_wins",               label: "Document always wins" },
  { id: "manual_resolve",              label: "Require manual resolution" },
];

const LIKELIHOOD_DEFAULTS = ["Unlikely", "Possible", "Likely", "Very Likely"];
const IMPACT_DEFAULTS     = ["Low", "Moderate", "High", "Very High"];

export function TabAssessment({ draft, patch }: Props) {
  const likelihood = (draft.likelihood_labels as string[] | undefined) ?? LIKELIHOOD_DEFAULTS;
  const impact     = (draft.impact_labels     as string[] | undefined) ?? IMPACT_DEFAULTS;

  return (
    <div className={styles.tab}>
      {/* Risk Framework */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Risk Framework</h3>
        <p className={styles.sectionDesc}>Select the scoring methodology for this workspace.</p>
        <div className={styles.cardGrid}>
          {FRAMEWORK_OPTIONS.map((f) => (
            <button
              key={f.id}
              className={`${styles.card} ${draft.risk_framework === f.id ? styles.cardActive : ""}`}
              onClick={() => patch("risk_framework", f.id)}
            >
              <span className={styles.cardLabel}>{f.label}</span>
              <span className={styles.cardDesc}>{f.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Rating Tier */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Rating Tier</h3>
        <div className={styles.radioGroup}>
          {RATING_TIERS.map((t) => (
            <label key={t.id} className={styles.radioItem}>
              <input
                type="radio"
                name="rating_tier"
                value={t.id}
                checked={draft.rating_tier === t.id}
                onChange={() => patch("rating_tier", t.id)}
              />
              {t.label}
            </label>
          ))}
        </div>
      </section>

      {/* Severity Calculation */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Severity Calculation</h3>
        <div className={styles.radioGroup}>
          {SEVERITY_OPTIONS.map((s) => (
            <label key={s.id} className={styles.radioItem}>
              <input
                type="radio"
                name="severity_calculation"
                value={s.id}
                checked={draft.severity_calculation === s.id}
                onChange={() => patch("severity_calculation", s.id)}
              />
              <span>
                <strong>{s.label}</strong>
                <span className={styles.radioDesc}> — {s.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Likelihood Labels */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Likelihood Labels</h3>
        <p className={styles.sectionDesc}>Labels shown in the inherent risk matrix (low → high).</p>
        <div className={styles.labelList}>
          {likelihood.map((lbl, i) => (
            <div key={i} className={styles.labelItem}>
              <span className={styles.labelIndex}>{i + 1}</span>
              <input
                className={styles.labelInput}
                value={lbl}
                onChange={(e) => {
                  const next = [...likelihood];
                  next[i] = e.target.value;
                  patch("likelihood_labels", next);
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Impact Labels */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Impact Labels</h3>
        <p className={styles.sectionDesc}>Labels shown in the inherent risk matrix (low → high).</p>
        <div className={styles.labelList}>
          {impact.map((lbl, i) => (
            <div key={i} className={styles.labelItem}>
              <span className={styles.labelIndex}>{i + 1}</span>
              <input
                className={styles.labelInput}
                value={lbl}
                onChange={(e) => {
                  const next = [...impact];
                  next[i] = e.target.value;
                  patch("impact_labels", next);
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Document Analysis */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Document Analysis</h3>
        <select
          className={styles.select}
          value={(draft.document_analysis as string) ?? "flag_unrated"}
          onChange={(e) => patch("document_analysis", e.target.value)}
        >
          {DOC_ANALYSIS_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </section>

      {/* Profile Conflict */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Profile Conflict Resolution</h3>
        <select
          className={styles.select}
          value={(draft.profile_conflict as string) ?? "profile_wins_unless_scanned"}
          onChange={(e) => patch("profile_conflict", e.target.value)}
        >
          {PROFILE_CONFLICT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </section>

      {/* Issue Statement Word Count */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Issue Statement Word Count</h3>
        <div className={styles.inlineRow}>
          <input
            type="number"
            min={50}
            max={500}
            step={10}
            className={styles.numberInput}
            value={(draft.issue_statement_word_count as number) ?? 100}
            onChange={(e) => patch("issue_statement_word_count", Number(e.target.value))}
          />
          <span className={styles.unit}>words max</span>
        </div>
      </section>
    </div>
  );
}
