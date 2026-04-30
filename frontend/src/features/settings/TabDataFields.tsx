import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import styles from "./Tab.module.scss";

interface Props {
  draft: Record<string, unknown>;
  patch: (key: string, value: unknown) => void;
  onClose: () => void;
}

const AUTO_LOGOUT_OPTIONS = [15, 30, 60, 120, 240];

export function TabDataFields({ draft, patch, onClose }: Props) {
  const qc = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);

  const clearCache = useMutation({
    mutationFn: () => api.post("/api/v1/settings/clear-cache", {}).then((r) => r.json()),
  });

  const resetDefaults = useMutation({
    mutationFn: () => api.post("/api/v1/settings/reset-defaults", {}).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setConfirmReset(false);
    },
  });

  const resetWorkspace = useMutation({
    mutationFn: () => api.post("/api/v1/settings/reset", {}).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      onClose();
    },
  });

  return (
    <div className={styles.tab}>
      {/* Auto Logout */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Auto Logout</h3>
        <p className={styles.sectionDesc}>Automatically sign out after a period of inactivity.</p>
        <select
          className={styles.select}
          value={(draft.auto_logout_minutes as number) ?? 60}
          onChange={(e) => patch("auto_logout_minutes", Number(e.target.value))}
        >
          {AUTO_LOGOUT_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}
            </option>
          ))}
        </select>
      </section>

      {/* Cache */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Cache</h3>
        <p className={styles.sectionDesc}>Clear server-side caches if data appears stale.</p>
        <button
          className={styles.actionBtn}
          disabled={clearCache.isPending}
          onClick={() => clearCache.mutate()}
        >
          {clearCache.isPending ? "Clearing…" : "Clear Cache"}
        </button>
        {clearCache.isSuccess && <p className={styles.successMsg}>Cache cleared.</p>}
      </section>

      {/* Reset to Defaults */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Reset to Defaults</h3>
        <p className={styles.sectionDesc}>Restore all settings to their factory defaults.</p>
        {confirmReset ? (
          <div className={styles.confirmRow}>
            <span className={styles.confirmText}>Are you sure? This cannot be undone.</span>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              disabled={resetDefaults.isPending}
              onClick={() => resetDefaults.mutate()}
            >
              {resetDefaults.isPending ? "Resetting…" : "Yes, Reset"}
            </button>
            <button className={styles.cancelSmallBtn} onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className={styles.actionBtn} onClick={() => setConfirmReset(true)}>
            Reset to Defaults
          </button>
        )}
      </section>

      {/* Reset Workspace */}
      <section className={`${styles.section} ${styles.dangerSection}`}>
        <h3 className={`${styles.sectionTitle} ${styles.dangerTitle}`}>Reset Workspace</h3>
        <p className={styles.sectionDesc}>
          Permanently delete all custom settings for this tenant. This action cannot be undone.
        </p>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
          disabled={resetWorkspace.isPending}
          onClick={() => {
            if (window.confirm("This will permanently delete all workspace settings. Continue?")) {
              resetWorkspace.mutate();
            }
          }}
        >
          {resetWorkspace.isPending ? "Deleting…" : "Reset Workspace"}
        </button>
      </section>
    </div>
  );
}
