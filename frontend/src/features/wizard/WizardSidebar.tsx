import clsx from "clsx";
import styles from "./WizardSidebar.module.scss";

interface Step {
  id: number;
  label: string;
  subtitle: string;
}

interface Props {
  steps: Step[];
  activeStep: number;
  progressPct: number;
  onSelectStep: (step: number) => void;
}

export function WizardSidebar({ steps, activeStep, progressPct, onSelectStep }: Props) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.progressSection}>
        <div className={styles.progressHeader}>
          <span className={styles.progressLabel}>Assessment Progress</span>
          <span className={styles.progressPct}>{progressPct}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <nav className={styles.stepList}>
        {steps.map((step) => {
          const done = step.id < activeStep;
          const active = step.id === activeStep;
          const locked = step.id > activeStep;

          return (
            <button
              key={step.id}
              className={clsx(styles.stepItem, {
                [styles.done]: done,
                [styles.active]: active,
                [styles.locked]: locked,
              })}
              onClick={() => onSelectStep(step.id)}
              disabled={locked}
              aria-current={active ? "step" : undefined}
            >
              <span className={styles.stepIcon}>
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="7" fill="#3b82f6" />
                    <path d="M4 7l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : active ? (
                  <span className={styles.stepNumActive}>{step.id}</span>
                ) : (
                  <span className={styles.stepNumLocked}>{step.id}</span>
                )}
              </span>
              <span className={styles.stepText}>
                <span className={styles.stepNum}>Step {step.id}</span>
                <span className={styles.stepLabel}>{step.label}</span>
                <span className={styles.stepSubtitle}>{step.subtitle}</span>
              </span>
              {done && (
                <span className={styles.doneTag}>Done</span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
