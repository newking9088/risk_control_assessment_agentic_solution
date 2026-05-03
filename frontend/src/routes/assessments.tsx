import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { Route as RootRoute } from "./__root";
import { TopNav } from "@/features/wizard/TopNav";
import { RatingBadge } from "@/components/RatingBadge";
import { ChatWidget } from "@/features/chat/ChatWidget";
import { SettingsDrawer } from "@/features/settings/SettingsDrawer";
import styles from "./assessments.module.scss";

const SUGGESTED_NAMES = [
  "Contact Center",
  "Wealth Management",
  "Credit Card Opening",
  "Consumer Lending",
  "Mortgage Origination",
  "Retail Banking Operations",
  "Treasury Operations",
  "Trade Finance",
  "Digital Banking",
  "Insurance Claims",
];

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/assessments",
  component: AssessmentsPage,
});

interface Assessment {
  id: string;
  title: string;
  status: string;
  current_step: number;
  created_at: string;
  updated_at?: string;
  assessment_date?: string;
  owner?: string;
  business_unit?: string;
  inherent_risk_rating?: string;
  controls_effectiveness_rating?: string;
  residual_risk_rating?: string;
  unit_id?: string;
  taxonomy_scope?: string;
  risk_sources?: string[];
}

type FilterTab = "all" | "draft" | "in_progress" | "complete" | "archived";

const PAGE_SIZE = 10;

function shortId(id: string) {
  return `AU-${id.slice(0, 6).toUpperCase()}`;
}

function calcProgress(a: Assessment): number {
  if (a.status === "complete") return 100;
  return Math.round(Math.min(((a.current_step - 1) / 6) * 100, 99));
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AssessmentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<Assessment | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUnitId, setEditUnitId] = useState("");
  const [colEmail, setColEmail] = useState("");
  const [colList, setColList] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (createOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [createOpen]);

  function openEdit(a: Assessment) {
    setEditTarget(a);
    setEditTitle(a.title);
    setEditUnitId(a.unit_id ?? shortId(a.id));
    setColList([]);
    setColEmail("");
    setConfirmDelete(false);
  }

  function closeEdit() {
    setEditTarget(null);
    setConfirmDelete(false);
  }

  const { data: all = [], isLoading } = useQuery<Assessment[]>({
    queryKey: ["assessments"],
    queryFn: () => api.get("/api/v1/assessments").then((r) => r.json()),
  });

  const create = useMutation({
    mutationFn: (title: string) =>
      api.post("/api/v1/assessments", { title }).then((r) => r.json()),
    onSuccess: (a: Assessment) => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      navigate({ to: "/assessments/$id/wizard", params: { id: a.id } });
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, title, unit_id }: { id: string; title: string; unit_id: string }) =>
      api.patch(`/api/v1/assessments/${id}`, { title, unit_id }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      closeEdit();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/v1/assessments/${id}`).then(r => r.ok ? {} : r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      closeEdit();
    },
  });

  function handleNew() {
    setNewTitle("");
    setCreateOpen(true);
  }

  function handleCreate() {
    const name = newTitle.trim();
    if (!name) return;
    create.mutate(name);
    setCreateOpen(false);
  }

  // Stats
  const inProgressCount = all.filter((a) => a.status === "in_progress").length;
  const completedCount = all.filter((a) => a.status === "complete").length;
  const highCriticalCount = all.filter((a) => {
    const r = (a.inherent_risk_rating ?? "").toLowerCase().replace(/[\s_]+/g, "");
    return r === "veryhigh" || r === "critical" || r === "high";
  }).length;

  // Tab counts — "all" excludes archived; archived only visible under "Recently Deleted"
  const active = all.filter((a) => a.status !== "archived");
  const tabCounts: Record<FilterTab, number> = {
    all: active.length,
    draft: active.filter((a) => a.status === "draft").length,
    in_progress: active.filter((a) => a.status === "in_progress").length,
    complete: active.filter((a) => a.status === "complete").length,
    archived: all.filter((a) => a.status === "archived").length,
  };

  // Filtered rows
  const filtered = all.filter((a) => {
    const matchesFilter = filter === "archived"
      ? a.status === "archived"
      : a.status !== "archived" && (filter === "all" || a.status === filter);
    const matchesSearch =
      !search || a.title.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusLabel: Record<string, string> = {
    draft: "Not Started",
    in_progress: "In Progress",
    complete: "Completed",
    review: "Review",
    archived: "Archived",
  };

  return (
    <div className={styles.page}>
      <TopNav
        onCreateNew={handleNew}
        createPending={create.isPending}
        onSettingsOpen={() => setSettingsOpen(true)}
      />

      <div className={styles.body}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Assessment Dashboard</h1>
            <p className={styles.pageSubtitle}>
              Monitor and manage risk and control assessments across all business units
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statIcon} style={{ color: "var(--fra-stat-medium)" }}>📈</span>
            <div>
              <div className={styles.statValue}>{active.length}</div>
              <div className={styles.statLabel}>Total Assessments</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon} style={{ color: "var(--fra-stat-veryhigh)" }}>⏱</span>
            <div>
              <div className={styles.statValue}>{inProgressCount}</div>
              <div className={styles.statLabel}>In Progress</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon} style={{ color: "var(--fra-stat-low)" }}>✓</span>
            <div>
              <div className={styles.statValue}>{completedCount}</div>
              <div className={styles.statLabel}>Completed</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon} style={{ color: "var(--fra-stat-veryhigh)" }}>⚠</span>
            <div>
              <div className={styles.statValue}>{highCriticalCount}</div>
              <div className={styles.statLabel}>High/Critical</div>
            </div>
          </div>
        </div>

        {/* Table section */}
        <div className={styles.tableSection}>
          <div className={styles.sectionTitle}>Assessment Units</div>

          <div className={styles.tableToolbar}>
            <div className={styles.filterTabs}>
              {(
                [
                  ["all", "All"],
                  ["draft", "Not Started"],
                  ["in_progress", "In Progress"],
                  ["complete", "Completed"],
                  ["archived", "Recently Deleted"],
                ] as [FilterTab, string][]
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  className={`${styles.filterTab} ${filter === tab ? styles.filterTabActive : ""}`}
                  onClick={() => {
                    setFilter(tab);
                    setPage(1);
                  }}
                >
                  {label}
                  <span className={styles.filterCount}>({tabCounts[tab]})</span>
                </button>
              ))}
            </div>
            <div className={styles.tableControls}>
              <span className={styles.unitCount}>{filtered.length} units</span>
              <input
                className={styles.search}
                type="text"
                placeholder="Search assessment units..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {isLoading ? (
            <div className={styles.loadingState}>Loading assessments…</div>
          ) : all.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📋</div>
              <h3>No assessments yet</h3>
              <p>Create your first risk and control assessment to get started.</p>
              <button
                onClick={handleNew}
                disabled={create.isPending}
                className={styles.newBtn}
              >
                + Create New Assessment
              </button>
            </div>
          ) : (
            <>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>AU ID</th>
                      <th>Assessment Unit</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Inherent Risk Rating</th>
                      <th>Controls Effectiveness Rating</th>
                      <th>Residual Risk Rating</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((a) => {
                      const pct = calcProgress(a);
                      return (
                        <tr
                          key={a.id}
                          className={styles.tableRow}
                          onClick={() =>
                            navigate({
                              to: "/assessments/$id/wizard",
                              params: { id: a.id },
                            })
                          }
                        >
                          <td className={styles.auId}>{a.unit_id || shortId(a.id)}</td>
                          <td className={styles.auName}>{a.title}</td>
                          <td>
                            <RatingBadge
                              value={a.status}
                              type="status"
                              label={statusLabel[a.status] ?? a.status}
                            />
                          </td>
                          <td className={styles.progressCell}>
                            <div className={styles.progressTrack}>
                              <div
                                className={styles.progressFill}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={styles.progressPct}>{pct}%</span>
                          </td>
                          <td>
                            <RatingBadge
                              value={a.inherent_risk_rating}
                              type="risk"
                            />
                          </td>
                          <td>
                            <RatingBadge
                              value={a.controls_effectiveness_rating}
                              type="control"
                            />
                          </td>
                          <td>
                            <RatingBadge
                              value={a.residual_risk_rating}
                              type="risk"
                            />
                          </td>
                          <td className={styles.dateCell}>
                            {fmtDate(a.assessment_date ?? a.created_at)}
                          </td>
                          <td className={styles.dateCell}>
                            {a.status === "complete"
                              ? fmtDate(a.updated_at)
                              : "—"}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <button
                              className={styles.editBtn}
                              title="Actions"
                              onClick={() => openEdit(a)}
                            >
                              ⋯
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
        &nbsp;|&nbsp;
        <a href="#">Privacy policy</a>
        &nbsp;|&nbsp;
        <a href="#">Terms and conditions</a>
      </footer>

      <ChatWidget />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* ── Edit Assessment Modal ── */}
      {editTarget && (
        <div className={styles.modalOverlay} onClick={closeEdit}>
          <div className={styles.editModal} onClick={e => e.stopPropagation()}>
            <div className={styles.editModalHeader}>
              <h2 className={styles.modalTitle}>Edit Assessment Unit</h2>
              <button className={styles.editModalClose} onClick={closeEdit}>✕</button>
            </div>

            {/* Details */}
            <div className={styles.editSection}>
              <div className={styles.editSectionTitle}>Details</div>
              <label className={styles.editLabel}>Assessment Unit Name</label>
              <input
                className={styles.modalInput}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="e.g. Contact Center"
              />
              <label className={styles.editLabel}>AU ID</label>
              <input
                className={styles.modalInput}
                value={editUnitId}
                onChange={e => setEditUnitId(e.target.value)}
                placeholder="e.g. AU-001"
              />
              <div className={styles.editActions}>
                <button className={styles.modalCancelBtn} onClick={closeEdit}>Cancel</button>
                <button
                  className={styles.modalCreateBtn}
                  disabled={!editTitle.trim() || rename.isPending}
                  onClick={() => rename.mutate({ id: editTarget.id, title: editTitle.trim(), unit_id: editUnitId.trim() })}
                >
                  {rename.isPending ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>

            {/* Collaborate */}
            <div className={styles.editSection}>
              <div className={styles.editSectionTitle}>Collaborate</div>
              <p className={styles.editSectionDesc}>Invite team members to view or contribute to this assessment.</p>
              <div className={styles.colRow}>
                <input
                  className={styles.colInput}
                  type="email"
                  placeholder="colleague@company.com"
                  value={colEmail}
                  onChange={e => setColEmail(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && colEmail.trim()) {
                      setColList(l => [...l, colEmail.trim()]);
                      setColEmail("");
                    }
                  }}
                />
                <button
                  className={styles.colInviteBtn}
                  disabled={!colEmail.trim()}
                  onClick={() => { setColList(l => [...l, colEmail.trim()]); setColEmail(""); }}
                >
                  Invite
                </button>
              </div>
              {colList.length > 0 && (
                <ul className={styles.colList}>
                  {colList.map((email, i) => (
                    <li key={i} className={styles.colItem}>
                      <span className={styles.colAvatar}>{email[0].toUpperCase()}</span>
                      <span className={styles.colEmail}>{email}</span>
                      <span className={styles.colPending}>Invite pending</span>
                      <button className={styles.colRemove} onClick={() => setColList(l => l.filter((_, j) => j !== i))}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Danger Zone */}
            <div className={styles.editDanger}>
              <div className={styles.editSectionTitle} style={{ color: "#dc2626" }}>Danger Zone</div>
              {!confirmDelete ? (
                <>
                  <p className={styles.editSectionDesc}>Permanently remove this assessment unit from the dashboard.</p>
                  <button className={styles.dangerBtn} onClick={() => setConfirmDelete(true)}>
                    Delete Assessment Unit
                  </button>
                </>
              ) : (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmText}>Are you sure? This cannot be undone.</span>
                  <button className={styles.modalCancelBtn} onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button
                    className={styles.dangerBtnConfirm}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(editTarget.id)}
                  >
                    {remove.isPending ? "Deleting…" : "Yes, Delete"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create Assessment Modal ── */}
      {createOpen && (
        <div className={styles.modalOverlay} onClick={() => setCreateOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>New Assessment Unit</h2>
            <p className={styles.modalSubtitle}>
              Enter the name of the business unit or process being assessed.
            </p>
            <input
              ref={inputRef}
              className={styles.modalInput}
              type="text"
              placeholder="e.g. Contact Center, Credit Card Opening…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreateOpen(false); }}
            />
            <div className={styles.modalSuggestLabel}>Suggested names</div>
            <div className={styles.modalSuggestions}>
              {SUGGESTED_NAMES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={styles.modalSuggestChip}
                  onClick={() => setNewTitle(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancelBtn} onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalCreateBtn}
                disabled={!newTitle.trim() || create.isPending}
                onClick={handleCreate}
              >
                {create.isPending ? "Creating…" : "Create Assessment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
