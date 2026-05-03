import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import styles from "../../routes/admin.module.scss";

interface AuditEvent {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

interface Insights {
  failed_logins: number;
  risk_overrides: number;
  downgrades: number;
  downgrade_pct: number;
  llm_cost_usd: number;
  active_users: number;
  assessments_saved: number;
  top_overriders: Array<{
    user_id: string | null;
    name: string | null;
    overrides: number;
    downgrades: number;
    pct: number;
  }>;
}

const EVENT_TYPES = [
  "Login", "Logout", "User Created", "User Updated",
  "Assessment Created", "Assessment Saved", "Risk Override",
  "LLM Call", "Cache Cleared", "Role Changed", "Approval Submitted",
];
const EVENT_TYPE_KEYS = [
  "login", "logout", "user_created", "user_updated",
  "assessment_created", "assessment_saved", "risk_override",
  "llm_call", "cache_cleared", "role_changed", "approval_submitted",
];
const ENTITY_TYPES = ["user", "assessment", "llm", "role", "system"];
const TIME_RANGES = [
  { label: "Last 7 days",  days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time",     days: 0 },
];

function eventBadgeClass(type: string): string {
  if (type.includes("login"))    return styles.eventLogin;
  if (type.includes("logout"))   return styles.eventLogout;
  if (type.includes("llm"))      return styles.eventLlm;
  if (type.includes("override") || type.includes("downgrade")) return styles.eventOverride;
  if (type.includes("user"))     return styles.eventUser;
  if (type.includes("assess"))   return styles.eventAssess;
  if (type.includes("error") || type.includes("fail")) return styles.eventError;
  return styles.eventDefault;
}

function eventBorderColor(type: string): string {
  if (type.includes("login") || type.includes("logout")) return "#16a34a";
  if (type.includes("llm"))   return "#0d9488";
  if (type.includes("override") || type.includes("downgrade")) return "#d97706";
  if (type.includes("user"))  return "#2563eb";
  if (type.includes("assess")) return "#6366f1";
  if (type.includes("error") || type.includes("fail")) return "#dc2626";
  return "#94a3b8";
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0)  return `${mins}m ago`;
  return "just now";
}

function fromDateStr(days: number): string | undefined {
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

export function TabAuditLog() {
  const [timeRange, setTimeRange] = useState(7);
  const [eventType, setEventType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actor, setActor] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const insightsFrom = fromDate || fromDateStr(timeRange);
  const insightsTo   = toDate   || undefined;

  const insightsParams = new URLSearchParams();
  if (insightsFrom) insightsParams.set("from_date", insightsFrom);
  if (insightsTo)   insightsParams.set("to_date", insightsTo);

  const { data: insights } = useQuery<Insights>({
    queryKey: ["audit-insights", insightsFrom, insightsTo],
    queryFn: async () => {
      const res = await api.get(`/api/v1/admin/audit-logs/insights?${insightsParams}`);
      return res.json();
    },
  });

  const logsParams = new URLSearchParams();
  if (eventType)  logsParams.set("event_type", eventType);
  if (entityType) logsParams.set("entity_type", entityType);
  if (actor)      logsParams.set("actor", actor);
  if (fromDate)   logsParams.set("from_date", fromDate);
  if (toDate)     logsParams.set("to_date", toDate);
  logsParams.set("limit", "100");

  const { data: logsData } = useQuery<{ total: number; events: AuditEvent[] }>({
    queryKey: ["audit-logs", eventType, entityType, actor, fromDate, toDate],
    queryFn: async () => {
      const res = await api.get(`/api/v1/admin/audit-logs?${logsParams}`);
      return res.json();
    },
  });

  const events = logsData?.events ?? [];
  const total  = logsData?.total ?? 0;

  function handleExport() {
    const exportParams = new URLSearchParams(logsParams);
    window.open(`/api/v1/admin/audit-logs/export?${exportParams}`, "_blank");
  }

  return (
    <>
      {/* Security insights */}
      <div className={styles.auditInsightsCard}>
        <div className={styles.insightsHeader}>
          <h3 className={styles.insightsTitle}>Security Insights</h3>
          <select
            className={styles.timeRangeSelect}
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
          >
            {TIME_RANGES.map((r) => (
              <option key={r.days} value={r.days}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.metricsRow}>
          <div className={styles.metricTile}>
            <div className={styles.metricIcon}>⚠️</div>
            <div className={styles.metricValue}>{insights?.failed_logins ?? 0}</div>
            <div className={styles.metricLabel}>Failed Logins</div>
          </div>
          <div className={styles.metricTile}>
            <div className={styles.metricIcon}>📋</div>
            <div className={styles.metricValue}>{insights?.risk_overrides ?? 0}</div>
            <div className={styles.metricLabel}>Risk Overrides</div>
          </div>
          <div className={styles.metricTile}>
            <div className={styles.metricIcon}>📉</div>
            <div className={styles.metricValue}>{insights?.downgrades ?? 0}</div>
            <div className={styles.metricLabel}>Downgrades ({insights?.downgrade_pct ?? 0}%)</div>
          </div>
          <div className={styles.metricTile}>
            <div className={styles.metricIcon}>💰</div>
            <div className={styles.metricValue}>${(insights?.llm_cost_usd ?? 0).toFixed(2)}</div>
            <div className={styles.metricLabel}>LLM Cost (USD)</div>
          </div>
          <div className={styles.metricTile}>
            <div className={styles.metricIcon}>👥</div>
            <div className={styles.metricValue}>{insights?.active_users ?? 0}</div>
            <div className={styles.metricLabel}>Active Users</div>
          </div>
          <div className={styles.metricTile}>
            <div className={styles.metricIcon}>💾</div>
            <div className={styles.metricValue}>{insights?.assessments_saved ?? 0}</div>
            <div className={styles.metricLabel}>Assessments Saved</div>
          </div>
        </div>

        {/* Top overriders */}
        {(insights?.top_overriders?.length ?? 0) > 0 && (
          <>
            <p className={styles.overridersTitle}>Users with Most Overrides</p>
            <table className={styles.overridersTable}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Overrides</th>
                  <th>Downgrades</th>
                  <th>Downgrade %</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {insights!.top_overriders.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name ?? "—"}</td>
                    <td>{r.overrides}</td>
                    <td>{r.downgrades}</td>
                    <td>{r.pct}%</td>
                    <td>
                      {r.pct > 20 && (
                        <AlertTriangle size={14} className={styles.flagWarn} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Filter bar */}
      <div className={styles.auditFilters}>
        <select
          className={styles.auditFilterSelect}
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        >
          <option value="">All Event Types</option>
          {EVENT_TYPES.map((label, i) => (
            <option key={EVENT_TYPE_KEYS[i]} value={EVENT_TYPE_KEYS[i]}>{label}</option>
          ))}
        </select>

        <select
          className={styles.auditFilterSelect}
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
        >
          <option value="">All Entities</option>
          {ENTITY_TYPES.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>

        <input
          className={styles.auditSearchInput}
          placeholder="Actor…"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
        />

        <input
          type="date"
          className={styles.dateInput}
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <input
          type="date"
          className={styles.dateInput}
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
      </div>

      {/* Meta row */}
      <div className={styles.auditMeta}>
        <span className={styles.eventCount}>{total} events</span>
        <button className={styles.exportBtn} onClick={handleExport}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Activity feed */}
      <div className={styles.activityFeed}>
        {events.length === 0 ? (
          <div className={styles.emptyState}>No events found.</div>
        ) : (
          events.map((ev) => (
            <FeedEntry
              key={ev.id}
              event={ev}
              expanded={!!expanded[ev.id]}
              onToggle={() => setExpanded((prev) => ({ ...prev, [ev.id]: !prev[ev.id] }))}
            />
          ))
        )}
      </div>
    </>
  );
}

function FeedEntry({
  event,
  expanded,
  onToggle,
}: {
  event: AuditEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const borderColor = eventBorderColor(event.event_type);
  const badgeClass  = eventBadgeClass(event.event_type);
  const detail      = event.detail ?? {};
  const detailStr   = Object.entries(detail)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");

  return (
    <div className={styles.feedEntry}>
      <div className={styles.feedBorder} style={{ background: borderColor }} />
      <div className={styles.feedBody}>
        <div className={styles.feedTop}>
          <span className={`${styles.eventBadge} ${badgeClass}`}>
            {event.event_type.replace(/_/g, " ")}
          </span>
          <span className={styles.feedActor}>{event.actor_name ?? "System"}</span>
          {event.entity_type && (
            <span className={styles.feedEntity}>
              on {event.entity_type}
              {event.entity_id && ` (${event.entity_id.slice(0, 8)}…)`}
            </span>
          )}
          <span className={styles.feedTime}>{relativeTime(event.created_at)}</span>
        </div>
        {detailStr && (
          <div className={styles.feedDetail}>{detailStr}</div>
        )}
        {expanded && (
          <pre className={styles.feedPayload}>
            {JSON.stringify(event.detail, null, 2)}
          </pre>
        )}
      </div>
      <button className={styles.feedChevron} onClick={onToggle} title="Expand">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
    </div>
  );
}
