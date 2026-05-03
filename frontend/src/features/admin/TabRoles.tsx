import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, User, UserPlus, Users, Briefcase, ShieldCheck, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import styles from "../../routes/admin.module.scss";

interface RoleConfig {
  role: string;
  display_label: string;
  hierarchy_level: number;
  capabilities: string[];
}

const ALL_CAPABILITIES = [
  { key: "view_assessments",   label: "View Assessments" },
  { key: "create_edit",        label: "Create / Edit" },
  { key: "delete_assessments", label: "Delete Assessments" },
  { key: "manage_taxonomies",  label: "Manage Taxonomies" },
  { key: "upload_taxonomies",  label: "Upload Taxonomies" },
  { key: "configure_llm",      label: "Configure LLM" },
  { key: "clear_cache",        label: "Clear Cache" },
  { key: "view_audit_logs",    label: "View Audit Logs" },
  { key: "manage_users",       label: "Manage Users" },
];

const ROLE_STYLE: Record<string, { border: string; icon: ReactNode }> = {
  viewer:         { border: "#94a3b8", icon: <Eye size={16} /> },
  analyst:        { border: "#3b82f6", icon: <User size={16} /> },
  senior_analyst: { border: "#6366f1", icon: <UserPlus size={16} /> },
  team_lead:      { border: "#22c55e", icon: <Users size={16} /> },
  delivery_lead:  { border: "#f59e0b", icon: <Briefcase size={16} /> },
  admin:          { border: "#ef4444", icon: <ShieldCheck size={16} /> },
};

export function TabRoles() {
  const qc = useQueryClient();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const res = await api.get("/api/v1/admin/roles");
      return res.json() as Promise<RoleConfig[]>;
    },
  });

  const resetMut = useMutation({
    mutationFn: () => api.post("/api/v1/admin/roles/reset", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-roles"] }),
  });

  return (
    <>
      <div className={styles.rolesHeader}>
        <div className={styles.rolesHeaderLeft}>
          <h2>Role Configuration</h2>
          <p>Customize display labels, hierarchy levels, and capabilities for each role</p>
        </div>
        <button
          className={styles.resetBtn}
          onClick={() => resetMut.mutate()}
          disabled={resetMut.isPending}
        >
          <RotateCcw size={13} />
          {resetMut.isPending ? "Resetting…" : "Reset to Defaults"}
        </button>
      </div>

      <div className={styles.rolesSubheading}>Role Hierarchy</div>

      {isLoading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : (
        <div className={styles.rolesGrid}>
          {roles.map((rc) => (
            <RoleCard key={rc.role} config={rc} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-roles"] })} />
          ))}
        </div>
      )}
    </>
  );
}

function RoleCard({ config, onSaved }: { config: RoleConfig; onSaved: () => void }) {
  const [label, setLabel] = useState(config.display_label);
  const [level, setLevel] = useState(String(config.hierarchy_level));
  const [caps, setCaps] = useState<string[]>(config.capabilities ?? []);
  const dirty =
    label !== config.display_label ||
    Number(level) !== config.hierarchy_level ||
    JSON.stringify([...caps].sort()) !== JSON.stringify([...(config.capabilities ?? [])].sort());

  const saveMut = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/admin/roles/${config.role}`, {
        display_label: label,
        hierarchy_level: Number(level),
        capabilities: caps,
      }),
    onSuccess: onSaved,
  });

  const style = ROLE_STYLE[config.role] ?? { border: "#94a3b8", icon: <User size={16} /> };

  function toggleCap(cap: string) {
    setCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  }

  return (
    <div className={styles.roleCard} style={{ borderColor: style.border }}>
      <div className={styles.roleCardHeader}>
        <span className={styles.roleCardIcon} style={{ color: style.border }}>
          {style.icon}
        </span>
        <span className={styles.roleCardName}>{config.display_label}</span>
        <span className={styles.roleCardCount}>{caps.length} capabilities</span>
      </div>

      <div className={styles.roleCardSub}>{label}</div>

      <div className={styles.roleCardField}>
        <label>Display Label</label>
        <input
          className={styles.roleCardInput}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className={styles.roleCardField}>
        <label>Hierarchy Level</label>
        <input
          className={styles.roleCardInput}
          type="number"
          min={1}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          style={{ width: "80px" }}
        />
      </div>

      <div className={styles.roleCardField}>
        <label>Capabilities</label>
        <div className={styles.capGrid}>
          {ALL_CAPABILITIES.map((cap) => (
            <label key={cap.key} className={styles.capLabel}>
              <input
                type="checkbox"
                checked={caps.includes(cap.key)}
                onChange={() => toggleCap(cap.key)}
              />
              {cap.label}
            </label>
          ))}
        </div>
      </div>

      <button
        className={styles.roleSaveBtn}
        onClick={() => saveMut.mutate()}
        disabled={!dirty || saveMut.isPending}
      >
        {saveMut.isPending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
