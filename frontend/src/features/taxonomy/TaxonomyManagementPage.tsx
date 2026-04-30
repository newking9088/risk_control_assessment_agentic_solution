import { AlertTriangle, CheckCircle, Shield, Tag } from "lucide-react";
import { TopNav } from "@/features/wizard/TopNav";
import { ChatWidget } from "@/features/chat/ChatWidget";
import { SettingsDrawer } from "@/features/settings/SettingsDrawer";
import { useTaxonomyManagement } from "./useTaxonomyManagement";
import { taxonomyApi } from "./taxonomyApi";
import type { RiskSourceFilter } from "./useTaxonomyManagement";
import styles from "./TaxonomyManagement.module.scss";
import { useState } from "react";

const TYPE_BADGE: Record<string, string> = {
  Preventive: styles.typeBadgePreventive,
  Detective:  styles.typeBadgeDetective,
  Corrective: styles.typeBadgeCorrective,
  Directive:  styles.typeBadgeDirective,
};

const CONTROL_TYPES = ["Preventive", "Detective", "Corrective", "Directive"];
const SOURCE_FILTERS: RiskSourceFilter[] = ["ALL", "EXT", "INT"];

export function TaxonomyManagementPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const {
    taxonomies, selectedId, setSelectedId,
    taxonomy, loading, error, successMsg,
    editRisks, editControls,
    handleRiskChange, handleControlChange,
    addBlankRisk, addBlankControl,
    handleSave, handleDelete,
    fileInputRef, handleFileChange, uploading,
    riskSearch, setRiskSearch,
    riskCategoryFilter, setRiskCategoryFilter,
    riskSourceFilter, setRiskSourceFilter,
    controlSearch, setControlSearch,
    controlTypeFilter, setControlTypeFilter,
    riskPageData, filteredRisks, riskPage, setRiskPage, riskTotalPages,
    ctrlPageData, filteredControls, controlPage, setControlPage, ctrlTotalPages,
    riskCategories, stats,
    activeTab, setActiveTab,
    RISK_PAGE, CTRL_PAGE,
  } = useTaxonomyManagement();

  return (
    <div className={styles.page}>
      <TopNav onSettingsOpen={() => setSettingsOpen(true)} />

      <div className={styles.body}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Risk &amp; Control Taxonomy</h1>
            <p className={styles.pageSubtitle}>
              Manage the global risk and control taxonomy used across all assessments
            </p>
          </div>
          <div className={styles.headerActions}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              className={styles.btnSecondary}
              disabled={uploading || !selectedId}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "⬆ Upload Excel / CSV"}
            </button>
            {selectedId && (
              <button
                className={styles.btnSecondary}
                onClick={() => taxonomyApi.export(selectedId)}
              >
                ⬇ Export CSV
              </button>
            )}
            {selectedId && (
              <button className={styles.btnDanger} onClick={handleDelete}>
                🗑 Delete
              </button>
            )}
          </div>
        </div>

        {/* Taxonomy selector */}
        {taxonomies.length > 1 && (
          <div className={styles.taxonomySelector}>
            <span className={styles.taxonomyLabel}>Taxonomy:</span>
            <select
              className={styles.taxonomySelect}
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {taxonomies.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (v{t.version})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Banners */}
        {successMsg && <div className={styles.bannerSuccess}>✓ {successMsg}</div>}
        {error && <div className={styles.bannerError}>✗ {error}</div>}

        {/* Loading */}
        {loading && <div style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1rem" }}>Loading…</div>}

        {/* Empty state */}
        {!loading && !taxonomy && (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>📂</div>
            <h3>No taxonomy loaded</h3>
            <p>Upload an Excel or CSV file to import risks and controls into the taxonomy.</p>
            <button
              className={styles.btnPrimary}
              onClick={() => fileInputRef.current?.click()}
            >
              ⬆ Upload File
            </button>
          </div>
        )}

        {taxonomy && (
          <>
            {/* Stats */}
            <div className={styles.statsRow}>
              <div className={styles.statCard}>
                <div className={styles.statIconRisk}><AlertTriangle size={18} /></div>
                <div>
                  <div className={styles.statValue}>{stats.totalRisks}</div>
                  <div className={styles.statLabel}>Total Risks</div>
                </div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIconControl}><Shield size={18} /></div>
                <div>
                  <div className={styles.statValue}>{stats.totalControls}</div>
                  <div className={styles.statLabel}>Total Controls</div>
                </div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIconCategory}><Tag size={18} /></div>
                <div>
                  <div className={styles.statValue}>{stats.categories}</div>
                  <div className={styles.statLabel}>Categories</div>
                </div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIconActive}><CheckCircle size={18} /></div>
                <div>
                  <div className={styles.statValue}>{stats.active ? "Active" : "Inactive"}</div>
                  <div className={styles.statLabel}>Status</div>
                </div>
              </div>
            </div>

            {/* Main card */}
            <div className={styles.card}>
              {/* Tab bar */}
              <div className={styles.tabBar}>
                <button
                  className={`${styles.tabBtn} ${activeTab === "risks" ? styles.tabBtnActive : ""}`}
                  onClick={() => setActiveTab("risks")}
                >
                  Risks ({editRisks.length})
                </button>
                <button
                  className={`${styles.tabBtn} ${activeTab === "controls" ? styles.tabBtnActive : ""}`}
                  onClick={() => setActiveTab("controls")}
                >
                  Controls ({editControls.length})
                </button>
              </div>

              {/* ── RISKS TAB ── */}
              {activeTab === "risks" && (
                <>
                  <div className={styles.toolbar}>
                    <div className={styles.toolbarLeft}>
                      <input
                        className={styles.search}
                        type="text"
                        placeholder="Search risks…"
                        value={riskSearch}
                        onChange={(e) => setRiskSearch(e.target.value)}
                      />
                      <select
                        className={styles.filterSelect}
                        value={riskCategoryFilter ?? ""}
                        onChange={(e) => setRiskCategoryFilter(e.target.value || null)}
                      >
                        <option value="">All Categories</option>
                        {riskCategories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <div className={styles.filterBtns}>
                        {SOURCE_FILTERS.map((s) => (
                          <button
                            key={s}
                            className={`${styles.filterBtn} ${riskSourceFilter === s ? styles.filterBtnActive : ""}`}
                            onClick={() => setRiskSourceFilter(s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.toolbarRight}>
                      <span style={{ fontSize: "0.78rem", color: "#64748b" }}>{filteredRisks.length} risks</span>
                      <button className={styles.addRowBtn} onClick={addBlankRisk}>+ Add Risk</button>
                    </div>
                  </div>

                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Risk ID</th>
                          <th>Category</th>
                          <th>Name</th>
                          <th>Description</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riskPageData.map((r, i) => {
                          const globalIdx = (riskPage - 1) * RISK_PAGE + i;
                          return (
                            <tr key={r.risk_id} className={styles.tableRow}>
                              <td className={`${styles.editableCell} ${styles.idCell}`}>
                                <input
                                  value={r.risk_id}
                                  onChange={(e) => handleRiskChange(globalIdx, "risk_id", e.target.value)}
                                />
                              </td>
                              <td className={styles.editableCell}>
                                <input
                                  value={r.category}
                                  onChange={(e) => handleRiskChange(globalIdx, "category", e.target.value)}
                                  placeholder="Category"
                                />
                              </td>
                              <td className={styles.editableCell}>
                                <input
                                  value={r.name}
                                  onChange={(e) => handleRiskChange(globalIdx, "name", e.target.value)}
                                  placeholder="Risk name"
                                />
                              </td>
                              <td className={styles.editableCell}>
                                <textarea
                                  value={r.description ?? ""}
                                  onChange={(e) => handleRiskChange(globalIdx, "description", e.target.value)}
                                  placeholder="Description"
                                  rows={1}
                                />
                              </td>
                              <td className={styles.editableCell}>
                                <input
                                  value={r.source ?? ""}
                                  onChange={(e) => handleRiskChange(globalIdx, "source", e.target.value)}
                                  placeholder="EXT / INT"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {riskTotalPages > 1 && (
                    <div className={styles.pagination}>
                      <span className={styles.paginationInfo}>
                        Showing {Math.min((riskPage - 1) * RISK_PAGE + 1, filteredRisks.length)}–
                        {Math.min(riskPage * RISK_PAGE, filteredRisks.length)} of {filteredRisks.length}
                      </span>
                      <div className={styles.paginationControls}>
                        <button className={styles.pageBtn} disabled={riskPage === 1} onClick={() => setRiskPage((p) => p - 1)}>Previous</button>
                        <span className={styles.pageNum}>{riskPage}</span>
                        <span className={styles.pageOf}>of {riskTotalPages}</span>
                        <button className={styles.pageBtn} disabled={riskPage === riskTotalPages} onClick={() => setRiskPage((p) => p + 1)}>Next</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── CONTROLS TAB ── */}
              {activeTab === "controls" && (
                <>
                  <div className={styles.toolbar}>
                    <div className={styles.toolbarLeft}>
                      <input
                        className={styles.search}
                        type="text"
                        placeholder="Search controls…"
                        value={controlSearch}
                        onChange={(e) => setControlSearch(e.target.value)}
                      />
                      <div className={styles.filterBtns}>
                        <button
                          className={`${styles.filterBtn} ${!controlTypeFilter ? styles.filterBtnActive : ""}`}
                          onClick={() => setControlTypeFilter(null)}
                        >
                          All
                        </button>
                        {CONTROL_TYPES.map((t) => (
                          <button
                            key={t}
                            className={`${styles.filterBtn} ${controlTypeFilter === t ? styles.filterBtnActive : ""}`}
                            onClick={() => setControlTypeFilter(t)}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.toolbarRight}>
                      <span style={{ fontSize: "0.78rem", color: "#64748b" }}>{filteredControls.length} controls</span>
                      <button className={styles.addRowBtn} onClick={addBlankControl}>+ Add Control</button>
                    </div>
                  </div>

                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Control ID</th>
                          <th>Name</th>
                          <th>Description</th>
                          <th>Type</th>
                          <th>Key Control</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ctrlPageData.map((c, i) => {
                          const globalIdx = (controlPage - 1) * CTRL_PAGE + i;
                          const norm = c.control_type ?? "";
                          return (
                            <tr key={c.control_id} className={styles.tableRow}>
                              <td className={`${styles.editableCell} ${styles.idCell}`}>
                                <input
                                  value={c.control_id}
                                  onChange={(e) => handleControlChange(globalIdx, "control_id", e.target.value)}
                                />
                              </td>
                              <td className={styles.editableCell}>
                                <input
                                  value={c.control_name}
                                  onChange={(e) => handleControlChange(globalIdx, "control_name", e.target.value)}
                                  placeholder="Control name"
                                />
                              </td>
                              <td className={styles.editableCell}>
                                <textarea
                                  value={c.description ?? ""}
                                  onChange={(e) => handleControlChange(globalIdx, "description", e.target.value)}
                                  placeholder="Description"
                                  rows={1}
                                />
                              </td>
                              <td>
                                <select
                                  className={styles.filterSelect}
                                  value={norm}
                                  onChange={(e) => handleControlChange(globalIdx, "control_type", e.target.value)}
                                  style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
                                >
                                  <option value="">—</option>
                                  {CONTROL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </td>
                              <td>
                                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                                  <input
                                    type="checkbox"
                                    checked={!!c.is_key}
                                    onChange={(e) => handleControlChange(globalIdx, "is_key", e.target.checked)}
                                    style={{ accentColor: "#2563eb" }}
                                  />
                                  {c.is_key && <span className={styles.keyBadge}>KEY</span>}
                                </label>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {ctrlTotalPages > 1 && (
                    <div className={styles.pagination}>
                      <span className={styles.paginationInfo}>
                        Showing {Math.min((controlPage - 1) * CTRL_PAGE + 1, filteredControls.length)}–
                        {Math.min(controlPage * CTRL_PAGE, filteredControls.length)} of {filteredControls.length}
                      </span>
                      <div className={styles.paginationControls}>
                        <button className={styles.pageBtn} disabled={controlPage === 1} onClick={() => setControlPage((p) => p - 1)}>Previous</button>
                        <span className={styles.pageNum}>{controlPage}</span>
                        <span className={styles.pageOf}>of {ctrlTotalPages}</span>
                        <button className={styles.pageBtn} disabled={controlPage === ctrlTotalPages} onClick={() => setControlPage((p) => p + 1)}>Next</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Save bar */}
              <div className={styles.saveBar}>
                <button className={styles.btnPrimary} onClick={handleSave}>
                  Save Changes
                </button>
              </div>
            </div>
          </>
        )}
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
