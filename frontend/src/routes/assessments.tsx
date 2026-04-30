import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Route as RootRoute } from "./__root";
import { TopNav } from "@/features/wizard/TopNav";
import { RatingBadge } from "@/components/RatingBadge";
import styles from "./assessments.module.scss";

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

  function handleNew() {
    create.mutate(`Assessment ${new Date().toLocaleDateString()}`);
  }

  // Stats
  const inProgressCount = all.filter((a) => a.status === "in_progress").length;
  const completedCount = all.filter((a) => a.status === "complete").length;
  const highCriticalCount = all.filter((a) => {
    const r = (a.inherent_risk_rating ?? "").toLowerCase().replace(/[\s_]+/g, "");
    return r === "veryhigh" || r === "critical" || r === "high";
  }).length;

  // Tab counts
  const tabCounts: Record<FilterTab, number> = {
    all: all.length,
    draft: all.filter((a) => a.status === "draft").length,
    in_progress: all.filter((a) => a.status === "in_progress").length,
    complete: all.filter((a) => a.status === "complete").length,
    archived: all.filter((a) => a.status === "archived").length,
  };

  // Filtered rows
  const filtered = all.filter((a) => {
    const matchesFilter = filter === "all" || a.status === filter;
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
      <TopNav onCreateNew={handleNew} createPending={create.isPending} />

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
              <div className={styles.statValue}>{all.length}</div>
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
                      <th>Edit</th>
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
                          <td className={styles.auId}>{shortId(a.id)}</td>
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
                          <td>
                            <button
                              className={styles.editBtn}
                              title="Open assessment"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate({
                                  to: "/assessments/$id/wizard",
                                  params: { id: a.id },
                                });
                              }}
                            >
                              ✏
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

      {/* AI Assistant chat button */}
      <button className={styles.chatBtn} title="Open AI Assistant">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"
            fill="white"
          />
        </svg>
      </button>
    </div>
  );
}
