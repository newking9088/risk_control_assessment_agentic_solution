import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { useNotificationSSE } from "./useNotificationSSE";
import styles from "./NotificationBell.module.scss";

interface Notification {
  id: string;
  type: string;
  body: string;
  assessment_id: string | null;
  actor_name: string | null;
  read: boolean;
  created_at: string;
}

interface Props {
  userId: string | null;
}

const TYPE_ICON: Record<string, string> = {
  collab_invite:     "👥",
  session_updated:   "📝",
  review_requested:  "📋",
  review_approved:   "✅",
  review_rejected:   "❌",
};

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

export function NotificationBell({ userId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useNotificationSSE(userId);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await api.get("/api/v1/notifications?limit=30");
      return res.json() as Promise<{ notifications: Notification[]; unread_count: number }>;
    },
    enabled: !!userId,
    refetchInterval: 60_000,
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/notifications/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => api.patch("/api/v1/notifications/read-all", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread_count ?? 0;

  return (
    <div className={styles.wrap} ref={drawerRef}>
      <button
        className={styles.bell}
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
      >
        <Bell size={18} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className={styles.drawer}>
          <div className={styles.drawerHeader}>
            <span className={styles.drawerTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button
                className={styles.markAll}
                onClick={() => markAllMut.mutate()}
                disabled={markAllMut.isPending}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>No notifications yet.</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`${styles.item} ${!n.read ? styles.itemUnread : ""}`}
                  onClick={() => { if (!n.read) markReadMut.mutate(n.id); }}
                >
                  <span className={styles.icon}>{TYPE_ICON[n.type] ?? "🔔"}</span>
                  <div className={styles.itemBody}>
                    <div className={styles.itemText}>{n.body}</div>
                    {n.actor_name && (
                      <div className={styles.itemActor}>from {n.actor_name}</div>
                    )}
                    <div className={styles.itemTime}>{relTime(n.created_at)}</div>
                  </div>
                  {!n.read && <span className={styles.unreadDot} />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
