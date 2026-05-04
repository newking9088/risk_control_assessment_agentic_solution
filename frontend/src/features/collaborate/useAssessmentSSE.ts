import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface SSEEvent {
  type: string;
  user_id?: string;
  user_name?: string;
  changed_fields?: string[];
  timestamp?: string;
}

export function useAssessmentSSE(
  assessmentId: string,
  currentUserId: string | null,
  onExternalUpdate?: (event: SSEEvent) => void,
) {
  const qc = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const es = new EventSource(
      `/api/v1/assessments/${assessmentId}/events`,
      { withCredentials: true },
    );
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      backoffRef.current = 1000;
    };

    es.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const data: SSEEvent = JSON.parse(e.data);
        if (data.type === "heartbeat" || data.type === "connected") return;
        setLastEvent(data);

        if (data.type === "assessmentUpdated" && data.user_id !== currentUserId) {
          qc.invalidateQueries({ queryKey: ["assessment", assessmentId] });
          qc.invalidateQueries({ queryKey: ["risks", assessmentId] });
          qc.invalidateQueries({ queryKey: ["controls"] });
          onExternalUpdate?.(data);
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      es.close();
      const delay = Math.min(backoffRef.current, 30_000);
      backoffRef.current = Math.min(delay * 2, 30_000);
      setTimeout(connect, delay);
    };
  }, [assessmentId, currentUserId, qc]);

  useEffect(() => {
    if (!assessmentId) return;
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      esRef.current?.close();
    };
  }, [connect]);

  return { isConnected, lastEvent };
}
