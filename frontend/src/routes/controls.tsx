import { createRoute } from "@tanstack/react-router";
import { Library, Shield, Eye, Star, Trash2 } from "lucide-react";
import { Route as RootRoute } from "./__root";
import { TopNav } from "@/features/wizard/TopNav";
import { ChatWidget } from "@/features/chat/ChatWidget";
import { SettingsDrawer } from "@/features/settings/SettingsDrawer";
import {
  useControlsLibrary,
  normalizeType,
  isKeyControl,
  type TypeFilter,
} from "@/features/controls/useControlsLibrary";
import styles from "@/features/controls/ControlsLibrary.module.scss";
import { useState } from "react";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/controls",
  component: ControlsLibraryPage,
});

const TYPE_BADGE_CLASS: Record<string, string> = {
  preventive: styles.typeBadgePreventive,
  detective:  styles.typeBadgeDetective,
  corrective: styles.typeBadgeCorrective,
  directive:  styles.typeBadgeDirective,
  other:      styles.typeBadgeOther,
};

const FILTER_TABS: [TypeFilter, string][] = [
  ["all",        "All"],
  ["Preventive", "Preventive"],
  ["Detective",  "Detective"],
  ["Corrective", "Corrective"],
  ["Directive",  "Directive"],
];

function controlId(c: { display_label?: string; id: string }) {
  return c.display_label || `CTRL-${c.id.slice(0, 6).toUpperCase()}`;
}

export function ControlsLibraryPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const {
    all,
    filtered,
    pageData,
    isLoading,
    filter,
    setFilter,
    search,
    setSearch,
    page,
    setPage,
    totalPages,
    typeCounts,
    stats,
    deleteControl,
    triggerUpload,
    handleFileChange,
    fileInputRef,
    uploadStatus,
    uploadMsg,
    exportCSV,
    PAGE_SIZE,
  } = useControlsLibrary();

  return (
    <div className={styles.page}>
      <TopNav onSettingsOpen={() => setSettingsOpen(true)} />

      <div className={styles.body}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Controls Library</h1>
            <p className={styles.pageSubtitle}>
              Browse and manage reusable controls across all assessment units
            </p>
          </div>
          <div className={styles.headerActions}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              className={styles.uploadBtn}
              disabled={uploadStatus === "uploading"}
              onClick={triggerUpload}
            >
              {uploadStatus === "uploading" ? "Uploading…" : "⬆ Upload CSV / XLSX"}
            </button>
            <button className={styles.exportBtn} onClick={exportCSV}>
              ⬇ Export CSV
            </button>
          </div>
        </div>

        {/* Upload result banner */}
        {uploadStatus === "success" && (
          <div className={styles.uploadBannerSuccess}>✓ {uploadMsg}</div>
        )}
        {uploadStatus === "error" && (
          <div className={styles.uploadBannerError}>✗ {uploadMsg}</div>
        )}

        {/* Stats */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statIconTotal}><Library size={18} /></div>
            <div>
              <div className={styles.statValue}>{stats.total}</div>
              <div className={styles.statLabel}>Total Controls</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIconPreventive}><Shield size={18} /></div>
            <div>
              <div className={styles.statValue}>{stats.preventive}</div>
              <div className={styles.statLabel}>Preventive</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIconDetective}><Eye size={18} /></div>
            <div>
              <div className={styles.statValue}>{stats.detective}</div>
              <div className={styles.statLabel}>Detective</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIconKey}><Star size={18} /></div>
            <div>
              <div className={styles.statValue}>{stats.keyControls}</div>
              <div className={styles.statLabel}>Key Controls</div>
            </div>
          </div>
        </div>

        {/* Table section */}
        <div className={styles.tableSection}>
          <div className={styles.sectionTitle}>Control Catalog</div>

          <div className={styles.tableToolbar}>
            <div className={styles.filterTabs}>
              {FILTER_TABS.map(([tab, label]) => (
                <button
                  key={tab}
                  className={`${styles.filterTab} ${filter === tab ? styles.filterTabActive : ""}`}
                  onClick={() => setFilter(tab)}
                >
                  {label}
                  <span className={styles.filterCount}>
                    ({typeCounts[tab as keyof typeof typeCounts] ?? 0})
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.tableControls}>
              <span className={styles.unitCount}>{filtered.length} controls</span>
              <input
                className={styles.search}
                type="text"
                placeholder="Search controls…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className={styles.loadingState}>Loading controls…</div>
          ) : all.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🗂</div>
              <h3>No controls yet</h3>
              <p>Upload a CSV or XLSX to bulk-import controls or create one manually.</p>
              <button className={styles.exportBtn} onClick={triggerUpload}>
                ⬆ Upload CSV / XLSX
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🔍</div>
              <h3>No controls match your filter</h3>
              <p>Try a different type filter or clear your search.</p>
            </div>
          ) : (
            <>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.thCtrlId}>Control ID</th>
                      <th className={styles.thCtrlType}>Control Type</th>
                      <th className={styles.thCtrlName}>Control Name</th>
                      <th>Description</th>
                      <th className={styles.thType}>Type</th>
                      <th className={styles.thKey}>Key Control</th>
                      <th className={styles.thSource}>Source</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((c) => {
                      const norm = normalizeType(c.control_type);
                      return (
                        <tr key={c.id} className={styles.tableRow}>
                          <td className={styles.ctrlRef}>{controlId(c)}</td>
                          <td className={styles.ctrlCategory}>{c.category || "—"}</td>
                          <td className={styles.ctrlName}>{c.name}</td>
                          <td className={styles.ctrlDesc} title={c.description}>
                            {c.description ?? "—"}
                          </td>
                          <td>
                            {c.control_type ? (
                              <span className={TYPE_BADGE_CLASS[norm] ?? styles.typeBadgeOther}>
                                {c.control_type}
                              </span>
                            ) : "—"}
                          </td>
                          <td className={styles.thKey}>
                            {isKeyControl(c.is_key_control) ? (
                              <span className={styles.keyBadge}>KEY</span>
                            ) : <span className={styles.nonKeyLabel}>Non-key</span>}
                          </td>
                          <td className={styles.thSource}>
                            {c.source ? (
                              <span className={styles.sourceBadge}>{c.source}</span>
                            ) : "—"}
                          </td>
                          <td>
                            <button
                              className={styles.deleteBtn}
                              disabled={deleteControl.isPending}
                              title="Delete control"
                              onClick={() => {
                                if (window.confirm(`Delete "${c.name}"?`)) {
                                  deleteControl.mutate(c.id);
                                }
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>
                  Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–
                  {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className={styles.paginationControls}>
                  <button
                    className={styles.pageBtn}
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span className={styles.pageNum}>{page}</span>
                  <span className={styles.pageOf}>of {totalPages}</span>
                  <button
                    className={styles.pageBtn}
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        © 2026 Risk &amp; Control Assessment Platform. All rights reserved.
        &nbsp;|&nbsp;<a href="#">Privacy policy</a>
        &nbsp;|&nbsp;<a href="#">Terms and conditions</a>
      </footer>

      <ChatWidget />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
