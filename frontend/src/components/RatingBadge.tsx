import styles from "@/styles/ratings.module.scss";

function riskClass(value: string): string {
  const v = value.toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, string> = {
    veryhigh: "veryHigh",
    critical: "critical",
    high: "high",
    moderate: "moderate",
    low: "low",
    verylow: "veryLow",
  };
  return map[v] ?? "moderate";
}

function controlClass(value: string): string {
  const v = value.toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, string> = {
    weak: "weak",
    needsimprovement: "needsImprovement",
    partial: "partial",
    partially: "partial",
    satisfactory: "satisfactory",
  };
  return map[v] ?? "partial";
}

function statusClass(value: string): string {
  const v = value.toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, string> = {
    inprogress: "inProgress",
    complete: "completed",
    completed: "completed",
    draft: "draft",
    notstarted: "draft",
    review: "review",
    archived: "archived",
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
  if (!value) return <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>—</span>;

  let cls: string;
  if (type === "risk") cls = riskClass(value);
  else if (type === "control") cls = controlClass(value);
  else cls = statusClass(value);

  return (
    <span className={`${styles.badge} ${styles[cls]}`}>
      {label ?? value}
    </span>
  );
}
