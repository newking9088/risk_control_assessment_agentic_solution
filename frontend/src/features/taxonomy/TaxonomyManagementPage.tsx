import { AlertTriangle, CheckCircle, Tag } from "lucide-react";
import { TopNav } from "@/features/wizard/TopNav";
import { ChatWidget } from "@/features/chat/ChatWidget";
import { SettingsDrawer } from "@/features/settings/SettingsDrawer";
import { useTaxonomyManagement } from "./useTaxonomyManagement";
import { taxonomyApi } from "./taxonomyApi";
import type { RiskItem } from "./taxonomyTypes";
import type { RiskSourceFilter } from "./useTaxonomyManagement";
import styles from "./TaxonomyManagement.module.scss";
import { useState } from "react";

const SOURCE_FILTERS: { value: RiskSourceFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "EXT", label: "External Fraud" },
  { value: "INT", label: "Insider Threat" },
];

function isHierarchical(risks: RiskItem[]): boolean {
  return risks.length > 0 && risks[0].l4 !== undefined;
}

// ── Hierarchical table (NGC L1→L2→L3→L4 layout) ──────────────────────────────

function HierarchicalRiskTable({ risks }: { risks: RiskItem[] }) {
  let prevL1 = "", prevL2 = "", prevL3 = "";

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thL1}>L1 Risk</th>
            <th className={styles.thL2}>L2 Risk</th>
            <th className={styles.thL3}>L3 Risk</th>
            <th>L3 Risk Description</th>
            <th className={styles.thL4}>L4 Risk</th>
            <th>L4 Risk Description</th>
            <th className={styles.thSource}>Source</th>
          </tr>
        </thead>
        <tbody>
          {risks.map((r, i) => {
            const l1 = r.l1 ?? r.category ?? "";
            const l2 = r.l2 ?? "";
            const l3 = r.l3 ?? "";
            const l3d = r.l3_description ?? "";
            const l4 = r.l4 ?? r.name ?? "";
            const l4d = r.l4_description ?? r.description ?? "";
            const src = r.source ?? "";

            const showL1 = l1 !== prevL1;
            const showL2 = l2 !== prevL2 || showL1;
            const showL3 = l3 !== prevL3 || showL2;

            prevL1 = l1;
            prevL2 = l2;
            prevL3 = l3;

            return (
              <tr key={i} className={styles.tableRow}>
                <td className={showL1 ? styles.hierCellL1 : styles.hierCellBlank}>
                  {showL1 ? l1 : ""}
                </td>
                <td className={showL2 ? styles.hierCellL2 : styles.hierCellBlank}>
                  {showL2 ? l2 : ""}
                </td>
                <td className={showL3 ? styles.hierCellL3 : styles.hierCellBlank}>
                  {showL3 ? l3 : ""}
                </td>
                <td className={styles.hierCellDesc}>
                  {showL3 ? l3d : ""}
                </td>
                <td className={styles.hierCellL4}>{l4}</td>
                <td className={styles.hierCellDesc}>{l4d}</td>
                <td>
                  {src && <span className={styles.sourceBadge}>{src}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Flat editable table (manually-entered risks) ──────────────────────────────

function FlatRiskTable({
  riskPageData, riskPage, RISK_PAGE, handleRiskChange,
}: {
  riskPageData: RiskItem[];
  riskPage: number;
  RISK_PAGE: number;
  handleRiskChange: (i: number, f: keyof RiskItem, v: string) => void;
}) {
  return (
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
                  <input value={r.risk_id} onChange={(e) => handleRiskChange(globalIdx, "risk_id", e.target.value)} />
                </td>
                <td className={styles.editableCell}>
                  <input value={r.category} onChange={(e) => handleRiskChange(globalIdx, "category", e.target.value)} placeholder="Category" />
                </td>
                <td className={styles.editableCell}>
                  <input value={r.name} onChange={(e) => handleRiskChange(globalIdx, "name", e.target.value)} placeholder="Risk name" />
                </td>
                <td className={styles.editableCell}>
                  <textarea value={r.description ?? ""} onChange={(e) => handleRiskChange(globalIdx, "description", e.target.value)} placeholder="Description" rows={1} />
                </td>
                <td className={styles.editableCell}>
                  <select
                    className={styles.filterSelect}
                    value={r.source ?? ""}
                    onChange={(e) => handleRiskChange(globalIdx, "source", e.target.value)}
                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
                  >
                    <option value="">—</option>
                    <option value="EXT">External Fraud</option>
                    <option value="INT">Insider Threat</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function TaxonomyManagementPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const {
    taxonomies, selectedId, setSelectedId,
    taxonomy, loading, error, successMsg,
    editRisks,
    handleRiskChange,
    addBlankRisk,
    handleSave, handleDelete,
    fileInputRef, handleFileChange, uploading,
    riskSearch, setRiskSearch,
    riskCategoryFilter, setRiskCategoryFilter,
    riskSourceFilter, setRiskSourceFilter,
    riskPageData, filteredRisks, riskPage, setRiskPage, riskTotalPages,
    riskCategories, stats,
    RISK_PAGE,
  } = useTaxonomyManagement();

  const hierMode = isHierarchical(editRisks);

  return (
    <div className={styles.page}>
      <TopNav onSettingsOpen={() => setSettingsOpen(true)} />

      <div className={styles.body}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Fraud Risk Taxonomy</h1>
            <p className={styles.pageSubtitle}>
              Manage the global fraud risk taxonomy used across all assessments
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
              <button className={styles.btnSecondary} onClick={() => taxonomyApi.export(selectedId)}>
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
                <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>
              ))}
            </select>
          </div>
        )}

        {/* Banners */}
        {successMsg && <div className={styles.bannerSuccess}>✓ {successMsg}</div>}
        {error      && <div className={styles.bannerError}>✗ {error}</div>}

        {loading && (
          <div style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1rem" }}>Loading…</div>
        )}

        {/* Empty state */}
        {!loading && !taxonomy && (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>📂</div>
            <h3>No taxonomy loaded</h3>
            <p>Upload an Excel or CSV file to import fraud risks into the taxonomy.</p>
            <button className={styles.btnPrimary} onClick={() => fileInputRef.current?.click()}>
              ⬆ Upload File
            </button>
          </div>
        )}

        {taxonomy && (
          <>
            {/* Stats */}
            <div className={styles.statsRow} style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div className={styles.statCard}>
                <div className={styles.statIconRisk}><AlertTriangle size={18} /></div>
                <div>
                  <div className={styles.statValue}>{stats.totalRisks}</div>
                  <div className={styles.statLabel}>Total Risks</div>
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

            {/* Risks card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                Fraud Risks ({editRisks.length})
                {hierMode && (
                  <span className={styles.hierBadge}>NGC Hierarchical</span>
                )}
              </div>

              {/* Toolbar */}
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
                    {SOURCE_FILTERS.map(({ value, label }) => (
                      <button
                        key={value}
                        className={`${styles.filterBtn} ${riskSourceFilter === value ? styles.filterBtnActive : ""}`}
                        onClick={() => setRiskSourceFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.toolbarRight}>
                  <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    {filteredRisks.length} risks
                  </span>
                  {!hierMode && (
                    <button className={styles.addRowBtn} onClick={addBlankRisk}>
                      + Add Risk
                    </button>
                  )}
                </div>
              </div>

              {/* Table — hierarchical or flat */}
              {hierMode ? (
                <HierarchicalRiskTable risks={filteredRisks.slice((riskPage - 1) * RISK_PAGE, riskPage * RISK_PAGE)} />
              ) : (
                <FlatRiskTable
                  riskPageData={riskPageData}
                  riskPage={riskPage}
                  RISK_PAGE={RISK_PAGE}
                  handleRiskChange={handleRiskChange}
                />
              )}

              {/* Pagination */}
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

              {/* Save bar — only in flat mode */}
              {!hierMode && (
                <div className={styles.saveBar}>
                  <button className={styles.btnPrimary} onClick={handleSave}>
                    Save Changes
                  </button>
                </div>
              )}
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
