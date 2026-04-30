import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

interface Assessment {
  title: string;
  description: string;
  scope: string;
  assessment_date: string;
  owner: string;
  business_unit: string;
  taxonomy_scope?: string;
  risk_sources?: string[];
}

const SCOPE_OPTIONS = [
  {
    value: "internal",
    label: "Insider Threat",
    icon: "🔒",
    desc: "Focus on internal fraud risks from employees, contractors, and privileged users.",
  },
  {
    value: "external",
    label: "External Fraud",
    icon: "🌐",
    desc: "Focus on external fraud risks from customers, third parties, and cybercriminals.",
  },
  {
    value: "both",
    label: "Both",
    icon: "⚖️",
    desc: "Comprehensive assessment covering both insider threat and external fraud risks.",
  },
];

const SOURCE_OPTIONS = [
  {
    value: "transactions",
    label: "Transaction Monitoring",
    desc: "Real-time and batch transaction analysis for anomalies.",
  },
  {
    value: "kyc",
    label: "KYC / CDD Data",
    desc: "Know Your Customer and Customer Due Diligence records.",
  },
  {
    value: "hr",
    label: "HR & Access Logs",
    desc: "Employee access records, role changes, and HR events.",
  },
  {
    value: "audit",
    label: "Audit Trails",
    desc: "System audit logs and operational activity records.",
  },
  {
    value: "complaints",
    label: "Complaints & Disputes",
    desc: "Customer complaints, disputes, and fraud reports.",
  },
  {
    value: "vendor",
    label: "Vendor / Third-Party",
    desc: "Third-party relationships and vendor risk data.",
  },
];

export function StepPreparation({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data } = useQuery<Assessment>({
    queryKey: ["assessment", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}`).then((r) => r.json()),
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    scope: "",
    assessment_date: new Date().toISOString().slice(0, 10),
    owner: "",
    business_unit: "",
    taxonomy_scope: "both",
    risk_sources: [] as string[],
  });

  useEffect(() => {
    if (data) {
      setForm({
        title: data.title ?? "",
        description: data.description ?? "",
        scope: data.scope ?? "",
        assessment_date: data.assessment_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        owner: data.owner ?? "",
        business_unit: data.business_unit ?? "",
        taxonomy_scope: data.taxonomy_scope ?? "both",
        risk_sources: data.risk_sources ?? [],
      });
    }
  }, [data]);

  useEffect(() => {
    onValidChange(form.title.trim().length > 0 && form.scope.trim().length > 0);
  }, [form, onValidChange]);

  const save = useMutation({
    mutationFn: (body: Partial<typeof form>) =>
      api.patch(`/api/v1/assessments/${assessmentId}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessment", assessmentId] }),
  });

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleScopeClick(value: string) {
    setForm((f) => ({ ...f, taxonomy_scope: value }));
    save.mutate({ taxonomy_scope: value });
  }

  function handleSourceToggle(value: string) {
    setForm((f) => {
      const current = f.risk_sources;
      const updated = current.includes(value)
        ? current.filter((s) => s !== value)
        : [...current, value];
      save.mutate({ risk_sources: updated });
      return { ...f, risk_sources: updated };
    });
  }

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Preparation</h2>
        <p className={styles.stepDesc}>Define the scope, ownership, and timeline for this risk and control assessment.</p>
      </div>

      <div className={styles.card}>
        <div className={styles.fieldGrid}>
          <div className={styles.fieldFull}>
            <label className={styles.label}>
              Assessment Title <span className={styles.required}>*</span>
            </label>
            <input
              className={styles.input}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              onBlur={() => save.mutate(form)}
              placeholder="e.g. Q1 2026 Fraud Risk & Controls Assessment"
            />
          </div>

          <div>
            <label className={styles.label}>Assessment Owner</label>
            <input
              className={styles.input}
              value={form.owner}
              onChange={(e) => set("owner", e.target.value)}
              onBlur={() => save.mutate(form)}
              placeholder="Full name"
            />
          </div>

          <div>
            <label className={styles.label}>Business Unit</label>
            <input
              className={styles.input}
              value={form.business_unit}
              onChange={(e) => set("business_unit", e.target.value)}
              onBlur={() => save.mutate(form)}
              placeholder="e.g. Retail Banking, Payments"
            />
          </div>

          <div>
            <label className={styles.label}>Assessment Date</label>
            <input
              type="date"
              className={styles.input}
              value={form.assessment_date}
              onChange={(e) => set("assessment_date", e.target.value)}
              onBlur={() => save.mutate(form)}
            />
          </div>

          <div className={styles.fieldFull}>
            <label className={styles.label}>
              Scope <span className={styles.required}>*</span>
            </label>
            <textarea
              className={styles.textarea}
              value={form.scope}
              onChange={(e) => set("scope", e.target.value)}
              onBlur={() => save.mutate(form)}
              rows={3}
              placeholder="Define the processes, systems, or organisational units in scope"
            />
          </div>

          <div className={styles.fieldFull}>
            <label className={styles.label}>Description</label>
            <textarea
              className={styles.textarea}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              onBlur={() => save.mutate(form)}
              rows={3}
              placeholder="Brief description of the objectives for this assessment"
            />
          </div>
        </div>
      </div>

      {/* Risk Focus Selection */}
      <div className={styles.card} style={{ marginTop: "1rem" }}>
        <div className={styles.sectionTitle}>Risk Focus</div>
        <p style={{ fontSize: "0.825rem", color: "#64748b", margin: "0 0 1rem" }}>
          Select the type of fraud risk this assessment will focus on.
        </p>
        <div className={styles.focusGrid}>
          {SCOPE_OPTIONS.map((opt) => {
            const active = form.taxonomy_scope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`${styles.focusCard} ${active ? styles.focusCardActive : ""}`}
                onClick={() => handleScopeClick(opt.value)}
              >
                <div className={styles.focusIconWrap}>{opt.icon}</div>
                <div className={styles.focusLabel}>{opt.label}</div>
                <div className={styles.focusDesc}>{opt.desc}</div>
                {active && <div className={styles.focusSelected}>✓ Selected</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Risk Sources */}
      <div className={styles.card} style={{ marginTop: "1rem" }}>
        <div className={styles.sectionTitle}>Risk Data Sources</div>
        <p style={{ fontSize: "0.825rem", color: "#64748b", margin: "0 0 1rem" }}>
          Select the data sources that will inform this assessment. Multiple selections allowed.
        </p>
        <div className={styles.sourceGrid}>
          {SOURCE_OPTIONS.map((opt) => {
            const checked = form.risk_sources.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                className={`${styles.sourceCard} ${checked ? styles.sourceCardActive : ""}`}
                onClick={() => handleSourceToggle(opt.value)}
              >
                <div className={styles.sourceCardCheck}>{checked ? "☑" : "☐"}</div>
                <div>
                  <div className={styles.sourceName}>{opt.label}</div>
                  <div className={styles.sourceDesc}>{opt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
