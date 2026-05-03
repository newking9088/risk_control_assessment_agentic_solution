import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import styles from "../../routes/admin.module.scss";

interface Approval {
  id: string;
  assessment_id: string | null;
  assessment_title: string | null;
  type: string;
  scope: string | null;
  requested_by: string | null;
  reason: string | null;
  status: string;
  review_note: string | null;
  reviewed_by: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

type SubTab = "all" | "pending" | "approved" | "rejected" | "expired";

function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending":  return styles.statusPending;
    case "approved": return styles.statusApproved;
    case "rejected": return styles.statusRejected;
    default:         return styles.statusExpired;
  }
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function TabApprovals() {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>("all");
  const [reviewTarget, setReviewTarget] = useState<{ id: string; action: "approved" | "rejected" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const statusParam = subTab === "all" ? undefined : subTab;
  const params = new URLSearchParams();
  if (statusParam) params.set("status", statusParam);

  const { data: approvals = [], isLoading } = useQuery<Approval[]>({
    queryKey: ["admin-approvals", subTab],
    queryFn: async () => {
      const res = await api.get(`/api/v1/admin/approvals?${params}`);
      return res.json();
    },
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note: string }) =>
      api.patch(`/api/v1/admin/approvals/${id}`, { status, review_note: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-approvals"] });
      setReviewTarget(null);
      setReviewNote("");
    },
  });

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: "all",      label: "All" },
    { key: "pending",  label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "expired",  label: "Expired" },
  ];

  return (
    <>
      {/* Sub-tabs */}
      <div className={styles.approvalSubTabs}>
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            className={`${styles.subTabBtn} ${subTab === t.key ? styles.subTabBtnActive : ""}`}
            onClick={() => setSubTab(t.key)}
          >
            {t.label}
            {t.key === "pending" && pendingCount > 0 && (
              <span className={styles.countBadge}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        {isLoading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : approvals.length === 0 ? (
          <div className={styles.emptyState}>No approval requests found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Type</th>
                <th>Scope</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Reviewed By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.id}>
                  <td>{a.assessment_title ?? (a.assessment_id ? a.assessment_id.slice(0, 8) + "…" : "—")}</td>
                  <td>{a.type}</td>
                  <td>{a.scope ?? "—"}</td>
                  <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.reason ?? "—"}
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${statusBadgeClass(a.status)}`}>
                      {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                    </span>
                  </td>
                  <td>{fmtDate(a.submitted_at)}</td>
                  <td>{a.reviewed_by ? a.reviewed_by.slice(0, 8) + "…" : "—"}</td>
                  <td>
                    {a.status === "pending" && (
                      <div className={styles.actions}>
                        <button
                          className={styles.approveBtn}
                          onClick={() => { setReviewTarget({ id: a.id, action: "approved" }); setReviewNote(""); }}
                        >
                          <Check size={12} /> Approve
                        </button>
                        <button
                          className={styles.rejectBtn}
                          onClick={() => { setReviewTarget({ id: a.id, action: "rejected" }); setReviewNote(""); }}
                        >
                          <X size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Review modal */}
      {reviewTarget && (
        <div className={styles.overlay} onClick={() => setReviewTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>
                {reviewTarget.action === "approved" ? "Approve" : "Reject"} Request
              </h2>
              <button className={styles.modalClose} onClick={() => setReviewTarget(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formField}>
                <label>Review Note (optional)</label>
                <textarea
                  className={styles.reviewNoteInput}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Add a note explaining your decision…"
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setReviewTarget(null)}>
                Cancel
              </button>
              {reviewTarget.action === "approved" ? (
                <button
                  className={styles.saveBtn}
                  onClick={() => reviewMut.mutate({ id: reviewTarget.id, status: "approved", note: reviewNote })}
                  disabled={reviewMut.isPending}
                  style={{ background: "#16a34a" }}
                >
                  {reviewMut.isPending ? "Approving…" : "Confirm Approve"}
                </button>
              ) : (
                <button
                  className={styles.dangerBtn}
                  onClick={() => reviewMut.mutate({ id: reviewTarget.id, status: "rejected", note: reviewNote })}
                  disabled={reviewMut.isPending}
                >
                  {reviewMut.isPending ? "Rejecting…" : "Confirm Reject"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
