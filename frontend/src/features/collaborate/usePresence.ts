import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export interface PresenceUser {
  user_id: string;
  display_name: string;
  role: string;
  last_heartbeat: string;
}

export function usePresence(
  assessmentId: string,
  currentUser: { id: string; name: string } | null,
) {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function sendHeartbeat() {
    if (!currentUser) return;
    try {
      const res = await api.post(`/api/v1/assessments/${assessmentId}/presence`, {
        display_name: currentUser.name,
        role: "editor",
      });
      const data = await res.json();
      setActiveUsers(data);
      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  }

  useEffect(() => {
    if (!assessmentId || !currentUser) return;
    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [assessmentId, currentUser?.id]);

  return { activeUsers, isConnected };
}
