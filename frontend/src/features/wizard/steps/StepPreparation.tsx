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
}

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
      });
    }
  }, [data]);

  useEffect(() => {
    onValidChange(form.title.trim().length > 0 && form.scope.trim().length > 0);
  }, [form, onValidChange]);

  const save = useMutation({
    mutationFn: (body: typeof form) =>
      api.patch(`/api/v1/assessments/${assessmentId}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessment", assessmentId] }),
  });

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
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
    </div>
  );
}
