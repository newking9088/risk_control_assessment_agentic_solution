import { createRoute } from "@tanstack/react-router";
import { Route as RootRoute } from "./__root";
import { TopNav } from "@/features/wizard/TopNav";
import { RATING_COLORS, CONTROL_COLORS } from "@/lib/ratingTokens";
import styles from "./methodology.module.scss";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/methodology",
  component: MethodologyPage,
});

function ScoreCircle({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className={styles.scoreCircle} style={{ background: color }}>
      <span className={styles.scoreValue}>{value}</span>
      <span className={styles.scoreLabel}>{label}</span>
    </div>
  );
}

function MatrixCell({ label, color }: { label: string; color: string }) {
  return (
    <td className={styles.matrixCell} style={{ background: color, color: "#fff" }}>
      {label}
    </td>
  );
}

const CELL_COLORS: Record<string, string> = {
  "Very Low": RATING_COLORS.low.bg,
  "Low":      RATING_COLORS.low.bg,
  "Moderate": RATING_COLORS.medium.bg,
  "High":     RATING_COLORS.high.bg,
  "Critical": RATING_COLORS.critical.bg,
};

export function MethodologyPage() {
  return (
    <div className={styles.page}>
      <TopNav />

      <div className={styles.body}>
        <h1 className={styles.mainTitle}>FRA Methodology</h1>
        <p className={styles.mainSubtitle}>
          A transparent scoring framework for assessing inherent risk, control effectiveness,
          and residual risk across assessment units.
        </p>

        {/* ── Section 1: Inherent Risk Rating ───────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Inherent Risk Rating</h2>
          <p className={styles.sectionDesc}>
            Inherent risk is calculated by combining Impact and Likelihood scores using a high
            watermark approach. The highest impact category determines the overall impact score.
          </p>

          {/* Impact Assessment */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Impact Assessment (4-Point Scale)</h3>
            <p className={styles.cardDesc}>
              Evaluate each impact category. The highest score becomes the overall impact rating.
            </p>

            <div className={styles.scaleRow}>
              <ScoreCircle value={1} label="Low"       color={RATING_COLORS.low.bg} />
              <ScoreCircle value={2} label="Moderate"  color={RATING_COLORS.medium.bg} />
              <ScoreCircle value={3} label="High"      color={RATING_COLORS.high.bg} />
              <ScoreCircle value={4} label="Very High" color={RATING_COLORS.critical.bg} />
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.criteriaTable}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>1 — Low</th>
                    <th>2 — Moderate</th>
                    <th>3 — High</th>
                    <th>4 — Very High</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Financial Impact</strong>
                      <br /><span className={styles.dimText}>Direct and indirect loss consequences from a risk event</span>
                    </td>
                    <td>&lt;$500K</td>
                    <td>$500K – $1M</td>
                    <td>$1M – $3M</td>
                    <td>&gt;$3M</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Regulatory Impact</strong>
                      <br /><span className={styles.dimText}>Consequences of regulatory actions due to non-compliance</span>
                    </td>
                    <td>No violation or minor breach</td>
                    <td>Minor regulatory violation</td>
                    <td>Substantial violation</td>
                    <td>Material violation with client impact</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Legal Impact</strong>
                      <br /><span className={styles.dimText}>Legal consequences arising from a risk event</span>
                    </td>
                    <td>No legal incident</td>
                    <td>Low rated incident</td>
                    <td>Medium rated incident</td>
                    <td>High rated incident</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Customer Impact</strong>
                      <br /><span className={styles.dimText}>Impact on customers and client relationships</span>
                    </td>
                    <td>0–10 complaints</td>
                    <td>10–20 complaints</td>
                    <td>20–50 complaints</td>
                    <td>50+ complaints</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Reputational Impact</strong>
                      <br /><span className={styles.dimText}>Negative external perception and publicity</span>
                    </td>
                    <td>Adverse rumors only</td>
                    <td>Adverse local media</td>
                    <td>Adverse global media</td>
                    <td>Global media + Board response</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Likelihood Assessment */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Likelihood Assessment (4-Point Scale)</h3>
            <p className={styles.cardDesc}>
              Assess the probability and expected timeframe for risk occurrence.
            </p>

            <div className={styles.likelihoodGrid}>
              <div className={styles.likelihoodCard}>
                <div className={styles.likelihoodScore} style={{ background: RATING_COLORS.low.bg }}>1</div>
                <div className={styles.likelihoodBody}>
                  <strong>Unlikely</strong>
                  <p>Event is highly unlikely to occur</p>
                  <p className={styles.dimText}>Probability: &lt;10%</p>
                  <p className={styles.dimText}>Timeframe: Once every 2–5 years</p>
                </div>
              </div>
              <div className={styles.likelihoodCard}>
                <div className={styles.likelihoodScore} style={{ background: RATING_COLORS.medium.bg }}>2</div>
                <div className={styles.likelihoodBody}>
                  <strong>Possible</strong>
                  <p>Event not expected but possible</p>
                  <p className={styles.dimText}>Probability: 10–20%</p>
                  <p className={styles.dimText}>Timeframe: Within 6 months to 1 year</p>
                </div>
              </div>
              <div className={styles.likelihoodCard}>
                <div className={styles.likelihoodScore} style={{ background: RATING_COLORS.high.bg }}>3</div>
                <div className={styles.likelihoodBody}>
                  <strong>Likely</strong>
                  <p>Event might occur at some time</p>
                  <p className={styles.dimText}>Probability: 20–50%</p>
                  <p className={styles.dimText}>Timeframe: Within 6 months</p>
                </div>
              </div>
              <div className={styles.likelihoodCard}>
                <div className={styles.likelihoodScore} style={{ background: RATING_COLORS.critical.bg }}>4</div>
                <div className={styles.likelihoodBody}>
                  <strong>Very Likely</strong>
                  <p>Event is almost certain to occur</p>
                  <p className={styles.dimText}>Probability: 50–80%</p>
                  <p className={styles.dimText}>Timeframe: Within a week</p>
                </div>
              </div>
            </div>
          </div>

          {/* Inherent Risk Matrix */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Inherent Risk Matrix</h3>
            <p className={styles.cardDesc}>
              Combine Impact and Likelihood to determine Inherent Risk Rating.
            </p>
            <div className={styles.tableWrapper}>
              <table className={styles.matrixTable}>
                <thead>
                  <tr>
                    <th></th>
                    <th>1 — Unlikely</th>
                    <th>2 — Possible</th>
                    <th>3 — Likely</th>
                    <th>4 — Very Likely</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["4 — Very High", "Low", "Moderate", "High", "Critical"],
                    ["3 — High", "Low", "Low", "Moderate", "High"],
                    ["2 — Moderate", "Very Low", "Low", "Moderate", "High"],
                    ["1 — Low", "Very Low", "Very Low", "Low", "Moderate"],
                  ].map(([rowLabel, ...cells]) => (
                    <tr key={rowLabel}>
                      <th className={styles.matrixRowHeader}>{rowLabel}</th>
                      {cells.map((c, i) => (
                        <MatrixCell key={i} label={c} color={CELL_COLORS[c] ?? "#64748b"} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.matrixCaption}>Impact (rows) × Likelihood (columns)</p>
          </div>
        </section>

        {/* ── Section 2: Control Effectiveness Rating ───────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Control Effectiveness Rating</h2>
          <p className={styles.sectionDesc}>
            Evaluate control design and operating effectiveness using a 4-point scale.
            The high watermark approach applies.
          </p>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Control Assessment Criteria</h3>
            <p className={styles.cardDesc}>
              Assess each control across design, documentation, and operating effectiveness dimensions.
            </p>

            <div className={styles.scaleRow}>
              <ScoreCircle value={1} label="Satisfactory"      color={CONTROL_COLORS.effective.bg} />
              <ScoreCircle value={2} label="Partial"           color={CONTROL_COLORS.partial.bg} />
              <ScoreCircle value={3} label="Needs Improvement" color={RATING_COLORS.high.bg} />
              <ScoreCircle value={4} label="Weak"              color={CONTROL_COLORS.weak.bg} />
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.criteriaTable}>
                <thead>
                  <tr>
                    <th>Criteria</th>
                    <th>1 — Satisfactory</th>
                    <th>2 — Partial</th>
                    <th>3 — Needs Improvement</th>
                    <th>4 — Weak</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Control Design</strong>
                      <br /><span className={styles.dimText}>How well the control mitigates identified risks</span>
                    </td>
                    <td>Mitigates most identified risks</td>
                    <td>Mitigates a portion of the risk</td>
                    <td>Does not fully mitigate risks</td>
                    <td>Does not mitigate risks</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Control Documentation</strong>
                      <br /><span className={styles.dimText}>Quality and completeness of control documentation</span>
                    </td>
                    <td>Documented in controls library with evidence</td>
                    <td>Documented in controls library</td>
                    <td>Exists but not well documented</td>
                    <td>Not documented</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Operating Effectiveness</strong>
                      <br /><span className={styles.dimText}>Control execution and error rates</span>
                    </td>
                    <td>Within tolerance, errors &lt;5%</td>
                    <td>Occasionally out of tolerance, &lt;10%</td>
                    <td>Often out of tolerance, &lt;15%</td>
                    <td>Consistently out of tolerance, &gt;20%</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Audit Findings</strong>
                      <br /><span className={styles.dimText}>Regulatory and internal audit examination results</span>
                    </td>
                    <td>No findings/issues</td>
                    <td>Low/moderate rated issues</td>
                    <td>Moderate rated issues</td>
                    <td>Critical/High rated findings</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Section 3: Residual Risk Calculation ──────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Residual Risk Calculation</h2>
          <p className={styles.sectionDesc}>
            Residual risk is derived by combining Inherent Risk Rating with Control Effectiveness Rating.
          </p>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Residual Risk Matrix</h3>
            <p className={styles.cardDesc}>
              Combine Inherent Risk and Control Effectiveness to determine Residual Risk Rating.
            </p>
            <div className={styles.tableWrapper}>
              <table className={styles.matrixTable}>
                <thead>
                  <tr>
                    <th></th>
                    <th>1 — Satisfactory</th>
                    <th>2 — Partial</th>
                    <th>3 — Needs Imp.</th>
                    <th>4 — Weak</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Critical", "Moderate", "High", "Critical", "Critical"],
                    ["High", "Low", "Moderate", "High", "Critical"],
                    ["Moderate", "Low", "Low", "Moderate", "High"],
                    ["Low", "Very Low", "Low", "Moderate", "Moderate"],
                    ["Very Low", "Very Low", "Very Low", "Low", "Moderate"],
                  ].map(([rowLabel, ...cells]) => (
                    <tr key={rowLabel}>
                      <th className={styles.matrixRowHeader}>{rowLabel}</th>
                      {cells.map((c, i) => (
                        <MatrixCell key={i} label={c} color={CELL_COLORS[c] ?? "#64748b"} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.matrixCaption}>Inherent Risk (rows) × Control Effectiveness (columns)</p>
          </div>
        </section>

        {/* ── Key Methodology Principles ────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Key Methodology Principles</h2>
          <div className={styles.principlesList}>
            {[
              ["High Watermark Approach", "The highest individual score across categories determines the overall rating."],
              ["Data-Driven Assessment", "Where possible, use quantitative metrics and evidence to support ratings."],
              ["Consistent Application", "Apply the same criteria and thresholds across all assessment units."],
              ["Transparent Documentation", "Document rationale for each rating decision to support audit and review."],
            ].map(([title, desc], i) => (
              <div key={i} className={styles.principleItem}>
                <div className={styles.principleNum}>{i + 1}</div>
                <div>
                  <strong>{title}:</strong> {desc}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        © 2026 Risk &amp; Control Assessment Platform. All rights reserved.
      </footer>
    </div>
  );
}
