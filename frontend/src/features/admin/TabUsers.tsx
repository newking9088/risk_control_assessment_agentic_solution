import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Search, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import styles from "../../routes/admin.module.scss";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface Props {
  currentUserEmail?: string;
  triggerCreate?: number;
}

const ROLES = [
  { value: "viewer",          label: "Viewer" },
  { value: "analyst",         label: "Analyst" },
  { value: "senior_analyst",  label: "Senior Analyst" },
  { value: "team_lead",       label: "Team Lead" },
  { value: "delivery_lead",   label: "Delivery Lead" },
  { value: "admin",           label: "Admin" },
];

function roleBadgeClass(role: string): string {
  switch (role) {
    case "admin":          return styles.roleAdmin;
    case "delivery_lead":  return styles.roleDeliveryLead;
    case "team_lead":      return styles.roleTeamLead;
    case "senior_analyst": return styles.roleSeniorAnalyst;
    case "analyst":        return styles.roleAnalyst;
    default:               return styles.roleViewer;
  }
}

function roleLabel(role: string): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const EMPTY_FORM = { name: "", email: "", role: "viewer", status: "active", password: "" };

export function TabUsers({ currentUserEmail, triggerCreate }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showPw, setShowPw] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (roleFilter) params.set("role", roleFilter);
  if (statusFilter) params.set("status", statusFilter);
  params.set("limit", "100");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", search, roleFilter, statusFilter],
    queryFn: async () => {
      const res = await api.get(`/api/v1/admin/users?${params}`);
      return res.json() as Promise<{ total: number; users: User[] }>;
    },
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/admin/users", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users-stats"] });
      setCreateOpen(false);
      setForm({ ...EMPTY_FORM });
    },
  });

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<typeof form> }) =>
      api.patch(`/api/v1/admin/users/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users-stats"] });
      setEditUser(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users-stats"] });
      setDeleteUser(null);
    },
  });

  function openEdit(u: User) {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, role: u.role, status: u.status, password: "" });
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setCreateOpen(true);
  }

  const users = data?.users ?? [];

  return (
    <>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className={styles.createBtn} onClick={openCreate}>
          + Create User
        </button>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        {isLoading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : users.length === 0 ? (
          <div className={styles.emptyState}>No users found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className={styles.nameCell}>
                      {u.name}
                      {u.email === currentUserEmail && (
                        <span className={styles.youChip}>You</span>
                      )}
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`${styles.roleBadge} ${roleBadgeClass(u.role)}`}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        u.status === "active" ? styles.statusActive : styles.statusInactive
                      }`}
                    >
                      {u.status.charAt(0).toUpperCase() + u.status.slice(1)}
                    </span>
                  </td>
                  <td>{fmtDate(u.created_at)}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.editBtn} onClick={() => openEdit(u)} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button className={styles.deleteBtn} onClick={() => setDeleteUser(u)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className={styles.overlay} onClick={() => setCreateOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Create User</h2>
              <button className={styles.modalClose} onClick={() => setCreateOpen(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formField}>
                <label>Full Name *</label>
                <input
                  className={styles.formInput}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Smith"
                />
              </div>
              <div className={styles.formField}>
                <label>Email *</label>
                <input
                  className={styles.formInput}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@company.com"
                />
              </div>
              <div className={styles.formField}>
                <label>Role</label>
                <select
                  className={styles.formSelect}
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className={styles.formField}>
                <label>Status</label>
                <select
                  className={styles.formSelect}
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className={styles.formField}>
                <label>Password *</label>
                <div className={styles.pwWrap}>
                  <input
                    className={styles.pwInput}
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Temporary password"
                  />
                  <button
                    type="button"
                    className={styles.pwToggle}
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                className={styles.saveBtn}
                onClick={() => createMut.mutate(form)}
                disabled={createMut.isPending || !form.name || !form.email || !form.password}
              >
                {createMut.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editUser && (
        <div className={styles.overlay} onClick={() => setEditUser(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Edit User</h2>
              <button className={styles.modalClose} onClick={() => setEditUser(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formField}>
                <label>Full Name *</label>
                <input
                  className={styles.formInput}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className={styles.formField}>
                <label>Email</label>
                <input
                  className={styles.formInput}
                  value={form.email}
                  disabled
                  style={{ opacity: 0.6, cursor: "not-allowed" }}
                />
              </div>
              <div className={styles.formField}>
                <label>Role</label>
                <select
                  className={styles.formSelect}
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className={styles.formField}>
                <label>Status</label>
                <select
                  className={styles.formSelect}
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setEditUser(null)}>
                Cancel
              </button>
              <button
                className={styles.saveBtn}
                onClick={() =>
                  editMut.mutate({
                    id: editUser.id,
                    body: { name: form.name, role: form.role, status: form.status },
                  })
                }
                disabled={editMut.isPending || !form.name}
              >
                {editMut.isPending ? "Updating…" : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteUser && (
        <div className={styles.overlay} onClick={() => setDeleteUser(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Delete User</h2>
              <button className={styles.modalClose} onClick={() => setDeleteUser(null)}>✕</button>
            </div>
            <div className={styles.confirmText}>
              Are you sure you want to deactivate{" "}
              <strong>{deleteUser.name}</strong>? Their account will be marked inactive
              and hidden from active user lists.
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDeleteUser(null)}>
                Cancel
              </button>
              <button
                className={styles.dangerBtn}
                onClick={() => deleteMut.mutate(deleteUser.id)}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
