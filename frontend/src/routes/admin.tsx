import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shield } from "lucide-react";
import { Route as RootRoute } from "./__root";
import { TopNav } from "@/features/wizard/TopNav";
import { getSession } from "@/lib/auth";
import { api } from "@/lib/api";
import { TabUsers } from "@/features/admin/TabUsers";
import { TabRoles } from "@/features/admin/TabRoles";
import { TabAuditLog } from "@/features/admin/TabAuditLog";
import { TabApprovals } from "@/features/admin/TabApprovals";
import styles from "./admin.module.scss";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/admin",
  component: AdminPage,
});

type AdminTab = "users" | "roles" | "audit" | "approvals";

const ADMIN_ROLES = new Set(["admin", "delivery_lead"]);

function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    staleTime: 60_000,
  });

  const { data: usersData } = useQuery({
    queryKey: ["admin-users-stats"],
    queryFn: async () => {
      const res = await api.get("/api/v1/admin/users?limit=200");
      return res.json() as Promise<{ total: number; users: Array<{ status: string; role: string }> }>;
    },
    enabled: session != null && ADMIN_ROLES.has(session.role ?? ""),
  });

  const users    = usersData?.users ?? [];
  const total    = usersData?.total ?? 0;
  const active   = users.filter((u) => u.status === "active").length;
  const inactive = users.filter((u) => u.status === "inactive").length;
  const admins   = users.filter((u) => u.role === "admin").length;

  const canAccess = session ? ADMIN_ROLES.has(session.role ?? "") : true;

  if (session && !canAccess) {
    return (
      <div className={styles.page}>
        <TopNav />
        <div className={styles.accessDenied}>
          <div className={styles.accessDeniedCard}>
            <Shield size={48} color="#dc2626" />
            <h2>Access Denied</h2>
            <p>You don't have permission to access the Administration panel.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TopNav />
      <div className={styles.body}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div className={styles.pageHeaderLeft}>
            <Shield size={28} color="#2563eb" strokeWidth={1.75} />
            <div>
              <h1 className={styles.pageTitle}>Administration</h1>
              <p className={styles.pageSubtitle}>
                Create, edit, and manage user accounts and permissions
              </p>
            </div>
          </div>
          <button className={styles.createBtn} onClick={() => setActiveTab("users")}>
            + Create User
          </button>
        </div>

        {/* Stat cards */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>👥</span>
            <div>
              <div className={styles.statValue}>{total}</div>
              <div className={styles.statLabel}>Total Users</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>✅</span>
            <div>
              <div className={styles.statValue}>{active}</div>
              <div className={styles.statLabel}>Active</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>⚠️</span>
            <div>
              <div className={styles.statValue}>{inactive}</div>
              <div className={styles.statLabel}>Inactive</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>🛡️</span>
            <div>
              <div className={styles.statValue}>{admins}</div>
              <div className={styles.statLabel}>Admins</div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className={styles.tabBar}>
          {(["users", "roles", "audit", "approvals"] as AdminTab[]).map((tab) => (
            <button
              key={tab}
              className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "users"      && "Users"}
              {tab === "roles"      && "Roles & Permissions"}
              {tab === "audit"      && "Audit Log"}
              {tab === "approvals"  && "Approvals"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className={styles.tabContent}>
          {activeTab === "users"     && <TabUsers currentUserEmail={session?.email} />}
          {activeTab === "roles"     && <TabRoles />}
          {activeTab === "audit"     && <TabAuditLog />}
          {activeTab === "approvals" && <TabApprovals />}
        </div>
      </div>
    </div>
  );
}
