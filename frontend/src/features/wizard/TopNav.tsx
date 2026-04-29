import { Link, useNavigate } from "@tanstack/react-router";
import styles from "./TopNav.module.scss";

interface Props {
  assessmentTitle?: string;
}

export function TopNav({ assessmentTitle }: Props) {
  const navigate = useNavigate();

  return (
    <header className={styles.nav}>
      <div className={styles.brand}>
        <div className={styles.logo}>RCA</div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>Risk &amp; Control</span>
          <span className={styles.brandSub}>Assessment Platform</span>
        </div>
      </div>

      <nav className={styles.tabs}>
        <Link to="/assessments" className={styles.tab}>
          Assessment Dashboard
        </Link>
        <button
          className={`${styles.tab} ${styles.tabPrimary}`}
          onClick={() => navigate({ to: "/assessments" })}
        >
          + Create New Assessment
        </button>
        <button className={styles.tab}>Methodology</button>
        <button className={styles.tab}>Taxonomy</button>
        <button className={styles.tab}>Controls Library</button>
        <button className={styles.tab}>Settings</button>
        <button className={styles.tab}>About Tool</button>
      </nav>

      {assessmentTitle && (
        <div className={styles.assessmentLabel} title={assessmentTitle}>
          {assessmentTitle}
        </div>
      )}
    </header>
  );
}
