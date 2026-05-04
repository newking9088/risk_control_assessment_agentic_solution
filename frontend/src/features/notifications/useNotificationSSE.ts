import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const TOAST_TYPES = new Set(["collab_invite", "review_requested"]);

export function useNotificationSSE(userId: string | null) {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current || !userId) return;

    const es = new EventSource("/api/v1/notifications/stream", { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      backoffRef.current = 1000;
    };

    es.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(e.data);
        if (data.type === "heartbeat" || data.type === "connected") return;

        qc.invalidateQueries({ queryKey: ["notifications"] });

        if (TOAST_TYPES.has(data.type) && data.body) {
          showToast(data.body);
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      const delay = Math.min(backoffRef.current, 30_000);
      backoffRef.current = Math.min(delay * 2, 30_000);
      setTimeout(connect, delay);
    };
  }, [userId, qc]);

  useEffect(() => {
    if (!userId) return;
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      esRef.current?.close();
    };
  }, [connect]);
}

function showToast(message: string) {
  const el = document.createElement("div");
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "1.5rem",
    right: "1.5rem",
    background: "#1e293b",
    color: "#fff",
    padding: "0.65rem 1rem",
    borderRadius: "8px",
    fontSize: "0.83rem",
    zIndex: "9999",
    boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
    maxWidth: "320px",
    lineHeight: "1.4",
    transition: "opacity 0.3s",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 4000);
}
