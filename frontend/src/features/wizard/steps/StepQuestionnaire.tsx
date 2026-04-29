import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import clsx from "clsx";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

const QUESTIONS = [
  {
    id: "q1",
    section: "Governance",
    text: "Does the organisation have a formally documented risk management framework?",
  },
  {
    id: "q2",
    section: "Governance",
    text: "Are risk appetites and tolerances defined and approved by senior leadership?",
  },
  {
    id: "q3",
    section: "Operations",
    text: "Are key operational processes documented with clear ownership assigned?",
  },
  {
    id: "q4",
    section: "Operations",
    text: "Is there a change management process that assesses risk before system changes go live?",
  },
  {
    id: "q5",
    section: "Technology",
    text: "Are access controls reviewed at least annually and upon role changes?",
  },
  {
    id: "q6",
    section: "Technology",
    text: "Are systems monitored for unusual activity or anomalies in real time?",
  },
  {
    id: "q7",
    section: "Compliance",
    text: "Is the organisation subject to specific regulatory requirements relevant to this assessment?",
  },
  {
    id: "q8",
    section: "Compliance",
    text: "Are compliance obligations tracked and monitored by a designated team?",
  },
];

type Answer = "yes" | "no" | "partial" | "na";

const ANSWER_OPTIONS: { value: Answer; label: string; color: string }[] = [
  { value: "yes", label: "Yes", color: "#22c55e" },
  { value: "partial", label: "Partial", color: "#f59e0b" },
  { value: "no", label: "No", color: "#ef4444" },
  { value: "na", label: "N/A", color: "#94a3b8" },
];

export function StepQuestionnaire({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === QUESTIONS.length;

  useEffect(() => {
    onValidChange(allAnswered);
  }, [allAnswered, onValidChange]);

  const save = useMutation({
    mutationFn: (body: { questionnaire: typeof answers; questionnaire_notes: typeof notes }) =>
      api.patch(`/api/v1/assessments/${assessmentId}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessment", assessmentId] }),
  });

  function handleAnswer(qid: string, value: Answer) {
    const next = { ...answers, [qid]: value };
    setAnswers(next);
    save.mutate({ questionnaire: next, questionnaire_notes: notes });
  }

  function handleNote(qid: string, value: string) {
    setNotes((n) => ({ ...n, [qid]: value }));
  }

  const sections = [...new Set(QUESTIONS.map((q) => q.section))];

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Questionnaire</h2>
        <p className={styles.stepDesc}>
          Complete this diagnostic to provide context for risk identification.
          <span className={styles.progressHint}>{answeredCount} / {QUESTIONS.length} answered</span>
        </p>
      </div>

      {sections.map((section) => (
        <div key={section} className={styles.card} style={{ marginBottom: "1rem" }}>
          <h3 className={styles.sectionTitle}>{section}</h3>
          {QUESTIONS.filter((q) => q.section === section).map((q) => (
            <div key={q.id} className={styles.questionRow}>
              <p className={styles.questionText}>{q.text}</p>
              <div className={styles.answerButtons}>
                {ANSWER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={clsx(styles.answerBtn, {
                      [styles.answerBtnActive]: answers[q.id] === opt.value,
                    })}
                    style={
                      answers[q.id] === opt.value
                        ? { borderColor: opt.color, color: opt.color, background: opt.color + "18" }
                        : {}
                    }
                    onClick={() => handleAnswer(q.id, opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {answers[q.id] && answers[q.id] !== "yes" && answers[q.id] !== "na" && (
                <textarea
                  className={styles.noteInput}
                  placeholder="Add notes or context…"
                  value={notes[q.id] ?? ""}
                  onChange={(e) => handleNote(q.id, e.target.value)}
                  onBlur={() => save.mutate({ questionnaire: answers, questionnaire_notes: notes })}
                  rows={2}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
