import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import styles from "./CollaboratorPanel.module.scss";

interface Collaborator {
  id: string;
  user_id: string;
  user_email: string;
  display_name: string;
  role: "editor" | "reader";
  invited_by: string;
  created_at: string;
}

interface PresenceUser {
  user_id: string;
  display_name: string;
  role: string;
}

interface Props {
  assessmentId: string;
  presenceUsers?: PresenceUser[];
}

export function CollaboratorPanel({ assessmentId, presenceUsers = [] }: Props) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "reader">("editor");
  const [removing, setRemoving] = useState<string | null>(null);

  const presenceSet = new Set(presenceUsers.map((u) => u.user_id));

  const { data: collaborators = [], isLoading } = useQuery<Collaborator[]>({
    queryKey: ["collaborators", assessmentId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/assessments/${assessmentId}/collaborators`);
      return res.json();
    },
    enabled: !!assessmentId,
  });

  const addMut = useMutation({
    mutationFn: (body: { user_email: string; display_name: string; role: string }) =>
      api.post(`/api/v1/assessments/${assessmentId}/collaborators`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaborators", assessmentId] });
      qc.invalidateQueries({ queryKey: ["assessments"] });
      setEmail("");
    },
  });

  const roleMut = useMutation({
    mutationFn: ({ collabId, newRole }: { collabId: string; newRole: string }) =>
      api.patch(`/api/v1/assessments/${assessmentId}/collaborators/${collabId}`, { role: newRole }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collaborators", assessmentId] }),
  });

  const removeMut = useMutation({
    mutationFn: (collabId: string) =>
      api.delete(`/api/v1/assessments/${assessmentId}/collaborators/${collabId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaborators", assessmentId] });
      qc.invalidateQueries({ queryKey: ["assessments"] });
      setRemoving(null);
    },
  });

  function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) return;
    addMut.mutate({
      user_email: trimmed,
      display_name: trimmed.split("@")[0],
      role,
    });
  }

  return (
    <div className={styles.panel}>
      <p className={styles.desc}>
        Invite team members to view or contribute to this assessment.
      </p>

      {/* Invite row */}
      <div className={styles.inviteRow}>
        <input
          className={styles.emailInput}
          type="email"
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
        />
        <select
          className={styles.roleSelect}
          value={role}
          onChange={(e) => setRole(e.target.value as "editor" | "reader")}
        >
          <option value="editor">Editor</option>
          <option value="reader">Reader</option>
        </select>
        <button
          className={styles.inviteBtn}
          disabled={!email.trim() || addMut.isPending}
          onClick={handleInvite}
        >
          {addMut.isPending ? "Inviting…" : "Invite"}
        </button>
      </div>

      {addMut.isError && (
        <p className={styles.errorMsg}>Failed to invite. Try again.</p>
      )}

      {/* Collaborator list */}
      {isLoading ? (
        <p className={styles.loading}>Loading collaborators…</p>
      ) : collaborators.length === 0 ? (
        <p className={styles.empty}>No collaborators yet. Invite someone above.</p>
      ) : (
        <ul className={styles.list}>
          {collaborators.map((c) => {
            const isOnline = presenceSet.has(c.user_id);
            const isConfirmingRemove = removing === c.id;
            return (
              <li key={c.id} className={styles.item}>
                <div className={styles.avatar}>
                  {(c.display_name || c.user_email)[0].toUpperCase()}
                  <span
                    className={styles.presenceDot}
                    style={{ background: isOnline ? "#16a34a" : "#94a3b8" }}
                    title={isOnline ? "Online" : "Offline"}
                  />
                </div>
                <div className={styles.info}>
                  <span className={styles.name}>{c.display_name || c.user_email}</span>
                  <span className={styles.email}>{c.user_email}</span>
                </div>
                <select
                  className={styles.roleDropdown}
                  value={c.role}
                  onChange={(e) => roleMut.mutate({ collabId: c.id, newRole: e.target.value })}
                  disabled={roleMut.isPending}
                >
                  <option value="editor">Editor</option>
                  <option value="reader">Reader</option>
                </select>
                {isConfirmingRemove ? (
                  <div className={styles.confirmRemove}>
                    <span>Remove?</span>
                    <button
                      className={styles.confirmYes}
                      onClick={() => removeMut.mutate(c.id)}
                      disabled={removeMut.isPending}
                    >
                      Yes
                    </button>
                    <button
                      className={styles.confirmNo}
                      onClick={() => setRemoving(null)}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    className={styles.removeBtn}
                    onClick={() => setRemoving(c.id)}
                    title="Remove collaborator"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
