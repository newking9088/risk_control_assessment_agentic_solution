import styles from "@/styles/ratings.module.scss";

function riskClass(value: string): string {
  const v = value.toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, string> = {
    veryhigh:  "veryHigh",
    critical:  "critical",
    high:      "high",
    moderate:  "moderate",
    medium:    "moderate",
    low:       "low",
    verylow:   "veryLow",
    notrated:  "notRated",
    nr:        "notRated",
  };
  return map[v] ?? "notRated";
}

function controlClass(value: string): string {
  const v = value.toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, string> = {
    satisfactory:          "satisfactory",
    effective:             "effective",
    moderatelyeffective:   "moderatelyEffective",
    partial:               "moderatelyEffective",
    partially:             "moderatelyEffective",
    partiallyeffective:    "moderatelyEffective",
    needsimprovement:      "moderatelyEffective",
    weak:                  "ineffective",
    ineffective:           "ineffective",
    nottested:             "notRated",
  };
  return map[v] ?? "notRated";
}

function statusClass(value: string): string {
  const v = value.toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, string> = {
    inprogress:  "inProgress",
    complete:    "completed",
    completed:   "completed",
    draft:       "draft",
    notstarted:  "draft",
    review:      "review",
    archived:    "archived",
  };
  return map[v] ?? "draft";
}

type BadgeType = "risk" | "control" | "status";

interface Props {
  value?: string | null;
  type: BadgeType;
  label?: string;
}

export function RatingBadge({ value, type, label }: Props) {
  if (!value) return <span style={{ color: "var(--fra-stat-nr)", fontSize: "0.75rem" }}>—</span>;

  let cls: string;
  if (type === "risk")         cls = riskClass(value);
  else if (type === "control") cls = controlClass(value);
  else                         cls = statusClass(value);

  return (
    <span className={`${styles.badge} ${styles[cls]}`}>
      {label ?? value}
    </span>
  );
}
