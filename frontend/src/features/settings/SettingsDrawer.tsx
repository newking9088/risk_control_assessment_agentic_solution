import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, X } from "lucide-react";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { TabAssessment } from "./TabAssessment";
import { TabAIAssistant } from "./TabAIAssistant";
import { TabDataFields } from "./TabDataFields";
import styles from "./SettingsDrawer.module.scss";

const TABS = [
  { id: "assessment",   label: "Assessment" },
  { id: "ai_assistant", label: "AI Assistant" },
  { id: "data_fields",  label: "Data & Fields" },
] as const;

type TabId = typeof TABS[number]["id"];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("assessment");
  const [width, setWidth] = useState(420);
  const [saved, setSaved] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const qc = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    staleTime: 60_000,
  });

  const { data: settings = {} } = useQuery<Record<string, unknown>>({
    queryKey: ["settings"],
    queryFn: () => api.get("/api/v1/settings").then((r) => r.json()),
    enabled: open,
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (Object.keys(settings).length) setDraft(settings);
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      api.post("/api/v1/settings", { settings: draft }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function patch(key: string, value: unknown) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // Resize drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - e.clientX;
      const next = Math.min(720, Math.max(360, dragRef.current.startW + delta));
      setWidth(next);
    }
    function onUp() {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay}>
      <div
        ref={drawerRef}
        className={styles.drawer}
        style={{ width }}
        role="dialog"
        aria-modal="false"
        aria-label="Settings & Preferences"
      >
        <div className={styles.resizeHandle} onMouseDown={onMouseDown} />

        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>
              <Settings size={18} strokeWidth={1.75} />
            </span>
            <h2 className={styles.headerTitle}>Settings &amp; Preferences</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {activeTab === "assessment" && (
            <TabAssessment draft={draft} patch={patch} />
          )}
          {activeTab === "ai_assistant" && (
            <TabAIAssistant draft={draft} patch={patch} role={session?.role} />
          )}
          {activeTab === "data_fields" && (
            <TabDataFields draft={draft} patch={patch} onClose={onClose} />
          )}
        </div>

        <div className={styles.footer}>
          {saved && <span className={styles.savedMsg}>✓ Saved</span>}
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.saveBtn}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
