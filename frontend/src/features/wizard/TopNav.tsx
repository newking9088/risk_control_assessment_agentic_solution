import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { LayoutDashboard, Settings } from "lucide-react";
import { getSession, signOut } from "@/lib/auth";
import styles from "./TopNav.module.scss";

const SETTINGS_ROLES = new Set(["delivery_lead", "admin"]);

interface Props {
  assessmentTitle?: string;
  onCreateNew?: () => void;
  createPending?: boolean;
  onSettingsOpen?: () => void;
}

export function TopNav({ assessmentTitle, onCreateNew, createPending, onSettingsOpen }: Props) {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    staleTime: 60_000,
  });

  const initials = session?.email
    ? session.email.slice(0, 2).toUpperCase()
    : "?";

  const canOpenSettings = session?.role ? SETTINGS_ROLES.has(session.role) : false;

  async function handleLogout() {
    await signOut();
    navigate({ to: "/login" });
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
        <Link to="/assessments" className={styles.tab} activeProps={{ className: `${styles.tab} ${styles.tabActive}` }}>
          <LayoutDashboard size={16} strokeWidth={1.75} style={{ verticalAlign: "middle", marginRight: "0.375rem" }} />
          Assessment Dashboard
        </Link>

        <button
          className={`${styles.tab} ${styles.tabPrimary}`}
          onClick={onCreateNew}
          disabled={createPending}
        >
          + Create New Assessment
        </button>

        <Link to="/controls" className={styles.tab} activeProps={{ className: `${styles.tab} ${styles.tabActive}` }}>
          Controls Library
        </Link>
        <Link to="/taxonomy" className={styles.tab} activeProps={{ className: `${styles.tab} ${styles.tabActive}` }}>
          Taxonomy
        </Link>
        <Link to="/methodology" className={styles.tab} activeProps={{ className: `${styles.tab} ${styles.tabActive}` }}>
          Methodology
        </Link>
      </nav>

      {assessmentTitle && (
        <div className={styles.assessmentLabel} title={assessmentTitle}>
          {assessmentTitle}
        </div>
      )}

      {canOpenSettings && onSettingsOpen && (
        <button
          className={styles.settingsBtn}
          onClick={onSettingsOpen}
          title="Settings & Preferences"
        >
          <Settings size={18} strokeWidth={1.75} />
        </button>
      )}

      {/* User avatar + dropdown */}
      <div className={styles.userArea} ref={dropdownRef}>
        <button
          className={styles.avatar}
          onClick={() => setDropdownOpen((o) => !o)}
          title={session?.email ?? "Account"}
        >
          {initials}
        </button>

        {dropdownOpen && (
          <div className={styles.dropdown}>
            {session?.email && (
              <div className={styles.dropdownEmail}>{session.email}</div>
            )}
            <button className={styles.dropdownItem} onClick={() => setDropdownOpen(false)}>
              <span>👤</span> View Profile
            </button>
            <button className={styles.dropdownItem} onClick={() => setDropdownOpen(false)}>
              <span>✏</span> Edit Profile
            </button>
            <div className={styles.dropdownDivider} />
            <button
              className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
              onClick={handleLogout}
            >
              <span>🚪</span> Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
