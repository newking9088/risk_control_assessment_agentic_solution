import { AlertTriangle, CheckCircle, Tag, Search, X } from "lucide-react";
import { useState, useMemo } from "react";
import { TopNav } from "@/features/wizard/TopNav";
import { ChatWidget } from "@/features/chat/ChatWidget";
import { SettingsDrawer } from "@/features/settings/SettingsDrawer";
import { useTaxonomyManagement } from "./useTaxonomyManagement";
import { taxonomyApi } from "./taxonomyApi";
import type { RiskItem } from "./taxonomyTypes";
import styles from "./TaxonomyManagement.module.scss";

// ── Hier filter helpers ───────────────────────────────────────────────────────

interface HierFilters { word: string; riskId: string; l1: string; l2: string; l3: string; }
const EMPTY_HIER: HierFilters = { word: "", riskId: "", l1: "", l2: "", l3: "" };

function applyHierFilters(risks: RiskItem[], f: HierFilters): RiskItem[] {
  return risks.filter((r) => {
    if (f.l1 && (r.l1 ?? r.category ?? "") !== f.l1) return false;
    if (f.l2 && (r.l2 ?? "") !== f.l2) return false;
    if (f.riskId && !r.risk_id.toLowerCase().includes(f.riskId.toLowerCase())) return false;
    if (f.l3 && !(r.l3 ?? "").toLowerCase().includes(f.l3.toLowerCase())) return false;
    if (f.word) {
      const w = f.word.toLowerCase();
      const haystack = [
        r.risk_id, r.l1 ?? r.category ?? "", r.l2 ?? "", r.l3 ?? "",
        r.l3_description ?? "", r.name, r.l4 ?? "", r.l4_description ?? r.description ?? "",
      ].join(" ").toLowerCase();
      if (!haystack.includes(w)) return false;
    }
    return true;
  });
}

function isHierarchical(risks: RiskItem[]): boolean {
  return risks.length > 0 && risks[0].l4 !== undefined;
}

// ── Hierarchical search panel ─────────────────────────────────────────────────

function HierSearchPanel({
  editRisks, onApply, onClear,
}: {
  editRisks: RiskItem[];
  onApply: (f: HierFilters) => void;
  onClear: () => void;
}) {
  const [local, setLocal] = useState<HierFilters>(EMPTY_HIER);

  const l1Options = useMemo(() =>
    [...new Set(editRisks.map(r => r.l1 ?? r.category ?? "").filter(Boolean))].sort()
  , [editRisks]);

  const l2Options = useMemo(() =>
    [...new Set(editRisks.map(r => r.l2 ?? "").filter(Boolean))].sort()
  , [editRisks]);

  function set(k: keyof HierFilters, v: string) { setLocal(prev => ({ ...prev, [k]: v })); }
  function clear() { setLocal(EMPTY_HIER); onClear(); }

  return (
    <div className={styles.hierSearchPanel}>
      <div className={styles.hierSearchRow}>
        <div className={styles.hierSearchGroup}>
          <label className={styles.hierSearchLabel}>Find by word</label>
          <input
            className={styles.hierSearchInput}
            value={local.word}
            onChange={e => set("word", e.target.value)}
            placeholder="Insert word…"
            onKeyDown={e => e.key === "Enter" && onApply(local)}
          />
        </div>
        <div className={styles.hierSearchGroup}>
          <label className={styles.hierSearchLabel}>Risk ID</label>
          <input
            className={styles.hierSearchInput}
            value={local.riskId}
            onChange={e => set("riskId", e.target.value)}
            placeholder="e.g. R-001"
            onKeyDown={e => e.key === "Enter" && onApply(local)}
          />
        </div>
        <div className={styles.hierSearchGroup}>
          <label className={styles.hierSearchLabel}>L1 Risk</label>
          <select className={styles.hierSearchSelect} value={local.l1} onChange={e => set("l1", e.target.value)}>
            <option value="">All</option>
            {l1Options.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className={styles.hierSearchGroup}>
          <label className={styles.hierSearchLabel}>
            L3 Risk <span className={styles.containsLabel}>contains</span>
          </label>
          <input
            className={styles.hierSearchInput}
            value={local.l3}
            onChange={e => set("l3", e.target.value)}
            onKeyDown={e => e.key === "Enter" && onApply(local)}
          />
        </div>
        <div className={styles.hierSearchGroup}>
          <label className={styles.hierSearchLabel}>L2 Risk</label>
          <select className={styles.hierSearchSelect} value={local.l2} onChange={e => set("l2", e.target.value)}>
            <option value="">All</option>
            {l2Options.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className={styles.hierSearchActions}>
          <button className={styles.btnSearch} onClick={() => onApply(local)}>
            <Search size={13} /> Search
          </button>
          <button className={styles.btnClearSearch} onClick={clear}>
            <X size={13} /> Clear
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hierarchical risk table (rowspan layout) ──────────────────────────────────

interface L3Group { l1: string; l2: string; l3: string; l3d: string; rows: RiskItem[]; }

function groupByL3(risks: RiskItem[]): L3Group[] {
  const groups: L3Group[] = [];
  for (const r of risks) {
    const l3 = r.l3 ?? "";
    const last = groups[groups.length - 1];
    if (!last || last.l3 !== l3) {
      groups.push({ l1: r.l1 ?? r.category ?? "", l2: r.l2 ?? "", l3, l3d: r.l3_description ?? "", rows: [r] });
    } else {
      last.rows.push(r);
    }
  }
  return groups;
}

function HierarchicalRiskTable({ risks }: { risks: RiskItem[] }) {
  const groups = groupByL3(risks);

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.hierTable}>
        <thead>
          <tr>
            <th className={styles.thRiskId}>Risk ID</th>
            <th className={styles.thL1}>L1 Risk</th>
            <th className={styles.thL2}>L2 Risk</th>
            <th className={styles.thL3}>L3 Risk</th>
            <th className={styles.thL3Desc}>L3 Risk Description</th>
            <th className={styles.thL4}>L4 Risk</th>
            <th className={styles.thL4Desc}>L4 Risk Description</th>
            <th className={styles.thSource}>Source</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((grp, gi) => {
            const baseCode = grp.l3.includes(" - ") ? grp.l3.split(" - ")[0].trim() : grp.l3;
            return grp.rows.map((r, ri) => (
              <tr key={`${gi}-${ri}`} className={ri % 2 === 0 ? styles.hierRowEven : styles.hierRowOdd}>
                {ri === 0 && (
                  <>
                    <td rowSpan={grp.rows.length} className={styles.hierIdCell}>{baseCode}</td>
                    <td rowSpan={grp.rows.length} className={styles.hierCellL1}>{grp.l1}</td>
                    <td rowSpan={grp.rows.length} className={styles.hierCellL2}>{grp.l2}</td>
                    <td rowSpan={grp.rows.length} className={styles.hierCellL3}>{grp.l3}</td>
                    <td rowSpan={grp.rows.length} className={`${styles.hierCellDesc} ${styles.hierCellL3Desc}`}>{grp.l3d}</td>
                  </>
                )}
                <td className={styles.hierCellL4}>{r.l4 ?? r.name ?? ""}</td>
                <td className={styles.hierCellDesc}>{r.l4_description ?? r.description ?? ""}</td>
                <td className={styles.hierSourceCell}>
                  {r.source && (
                    <span className={
                      r.source === "EXT" ? styles.sourceBadgeExt
                      : r.source === "INT" ? styles.sourceBadgeInt
                      : styles.sourceBadge
                    }>
                      {r.source}
                    </span>
                  )}
                </td>
              </tr>
            ));
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
  const [appliedFilters, setAppliedFilters] = useState<HierFilters>(EMPTY_HIER);

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
    riskPageData, filteredRisks, riskPage, setRiskPage, riskTotalPages,
    riskCategories, stats,
    RISK_PAGE,
  } = useTaxonomyManagement();

  const hierMode = isHierarchical(editRisks);

  const hierFiltered = useMemo(
    () => applyHierFilters(editRisks, appliedFilters),
    [editRisks, appliedFilters],
  );

  return (
    <div className={styles.page}>
      <TopNav onSettingsOpen={() => setSettingsOpen(true)} />

      <div className={styles.body}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Fraud Risk Taxonomy</h1>
            <p className={styles.pageSubtitle}>
              Standardised classification of fraud risks for consistent assessment
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
              {uploading ? "Uploading…" : "⬆ Upload Excel"}
            </button>
            {selectedId && (
              <button className={styles.btnSecondary} onClick={() => taxonomyApi.export(selectedId)}>
                ⬇ Export
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
                {hierMode && <span className={styles.hierBadge}>NGC Hierarchical</span>}
              </div>

              {hierMode ? (
                <>
                  <HierSearchPanel
                    editRisks={editRisks}
                    onApply={(f) => setAppliedFilters(f)}
                    onClear={() => setAppliedFilters(EMPTY_HIER)}
                  />
                  <div className={styles.hierCountRow}>
                    <span>{hierFiltered.length} of {editRisks.length} risks displayed</span>
                  </div>
                  <HierarchicalRiskTable risks={hierFiltered} />
                </>
              ) : (
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
                    </div>
                    <div className={styles.toolbarRight}>
                      <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        {filteredRisks.length} risks
                      </span>
                      <button className={styles.addRowBtn} onClick={addBlankRisk}>
                        + Add Risk
                      </button>
                    </div>
                  </div>

                  <FlatRiskTable
                    riskPageData={riskPageData}
                    riskPage={riskPage}
                    RISK_PAGE={RISK_PAGE}
                    handleRiskChange={handleRiskChange}
                  />

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

                  <div className={styles.saveBar}>
                    <button className={styles.btnPrimary} onClick={handleSave}>
                      Save Changes
                    </button>
                  </div>
                </>
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
