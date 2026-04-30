import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import clsx from "clsx";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

// ── Profile groups ────────────────────────────────────────────
const PROFILE_GROUPS = [
  { key: "finances",           label: "Finances",                 hint: "Revenue streams, payment methods, transaction volumes" },
  { key: "channels",           label: "Channels",                 hint: "Digital, branch, phone, partner channels" },
  { key: "employee_caps",      label: "Employee Capabilities",    hint: "Headcount, roles, privileged access levels" },
  { key: "populations",        label: "Populations Served",       hint: "Customer segments, geographies, demographics" },
  { key: "products",           label: "Products/Services",        hint: "Products offered, onboarding methods" },
  { key: "data_types",         label: "Data Types Assessed",      hint: "PII, financial, biometric, transaction data" },
  { key: "third_party",        label: "Third-Party Involvement",  hint: "Vendors, outsourced functions, integrations" },
  { key: "regulatory",         label: "Regulatory Environment",   hint: "Applicable regulations, licences, reporting obligations" },
];

// ── Question bank ─────────────────────────────────────────────
const QUESTIONS = [
  // Governance
  { id: "G-01", section: "Governance", text: "Does the organisation have a formally documented fraud risk management framework?" },
  { id: "G-02", section: "Governance", text: "Are fraud risk appetites and tolerances defined and approved by senior leadership?" },
  { id: "G-03", section: "Governance", text: "Is there a dedicated fraud risk governance committee or forum that meets regularly?" },
  // Operations
  { id: "O-01", section: "Operations", text: "Are key operational processes documented with clear fraud risk ownership assigned?" },
  { id: "O-02", section: "Operations", text: "Is there a change management process that assesses fraud risk before system or process changes go live?" },
  { id: "O-03", section: "Operations", text: "Are exception reports and operational anomalies reviewed and escalated in a timely manner?" },
  // Technology
  { id: "T-01", section: "Technology", text: "Are access controls and privileged accounts reviewed at least annually and upon role changes?" },
  { id: "T-02", section: "Technology", text: "Are systems monitored for unusual activity or anomalies in real time?" },
  { id: "T-03", section: "Technology", text: "Are authentication controls (e.g. MFA) applied to all systems holding sensitive data?" },
  // Compliance
  { id: "C-01", section: "Compliance", text: "Is the organisation subject to specific regulatory requirements relevant to fraud prevention?" },
  { id: "C-02", section: "Compliance", text: "Are compliance obligations tracked and monitored by a designated team?" },
  { id: "C-03", section: "Compliance", text: "Are Suspicious Activity Reports (SARs) or equivalent filed accurately and on time?" },
  // Fraud Controls
  { id: "F-01", section: "Fraud Controls", text: "Are fraud detection rules and models reviewed and updated at least quarterly?" },
  { id: "F-02", section: "Fraud Controls", text: "Is there a documented fraud response playbook that staff are trained on?" },
  { id: "F-03", section: "Fraud Controls", text: "Are customer-facing fraud controls tested regularly for effectiveness?" },
  // Data & Analytics
  { id: "D-01", section: "Data & Analytics", text: "Is fraud loss data captured, categorised, and reported to senior management?" },
  { id: "D-02", section: "Data & Analytics", text: "Are fraud trends analysed against industry benchmarks or peer data?" },
  { id: "D-03", section: "Data & Analytics", text: "Is there a data quality process ensuring fraud analytics inputs are accurate and complete?" },
];

type Answer = "yes" | "no" | "partial" | "na";
type FilterType = "all" | "needs_review" | "confident" | "yes" | "no" | "edited";

const ANSWER_OPTIONS: { value: Answer; label: string; color: string }[] = [
  { value: "yes",     label: "Yes",     color: "#22c55e" },
  { value: "partial", label: "Partial", color: "#f59e0b" },
  { value: "no",      label: "No",      color: "#ef4444" },
  { value: "na",      label: "N/A",     color: "#94a3b8" },
];

const SECTIONS = [...new Set(QUESTIONS.map((q) => q.section))];

type ProfileMap = Record<string, string[]>;

interface AssessmentData {
  questionnaire?: {
    profile?: ProfileMap;
    answers?: Record<string, Answer>;
    notes?: Record<string, string>;
  };
}

function deriveStatus(answer: Answer | undefined, note: string | undefined): "confident" | "needs_review" | "unanswered" {
  if (!answer) return "unanswered";
  if (answer === "yes" || answer === "na") return "confident";
  if (note && note.trim().length > 10) return "confident";
  return "needs_review";
}

export function StepQuestionnaire({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data } = useQuery<AssessmentData>({
    queryKey: ["assessment", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}`).then((r) => r.json()),
  });

  // Sub-step: 1 = profile, 2 = qa
  const [subStep, setSubStep] = useState<1 | 2>(1);

  // Profile state
  const [profile, setProfile] = useState<ProfileMap>(() =>
    Object.fromEntries(PROFILE_GROUPS.map((g) => [g.key, []]))
  );
  const [addInputs, setAddInputs] = useState<Record<string, string>>({});

  // QA state
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [notes, setNotes]     = useState<Record<string, string>>({});
  const [filter, setFilter]   = useState<FilterType>("all");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(SECTIONS));

  // Hydrate from DB
  useEffect(() => {
    const q = data?.questionnaire;
    if (q?.profile) setProfile((p) => ({ ...p, ...q.profile }));
    if (q?.answers) setAnswers(q.answers);
    if (q?.notes)   setNotes(q.notes);
  }, [data]);

  const answeredCount = Object.keys(answers).length;
  const allAnswered   = answeredCount === QUESTIONS.length;

  useEffect(() => {
    onValidChange(subStep === 2 && allAnswered);
  }, [subStep, allAnswered, onValidChange]);

  const save = useMutation({
    mutationFn: (body: object) =>
      api.patch(`/api/v1/assessments/${assessmentId}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessment", assessmentId] }),
  });

  function saveAll(nextAnswers = answers, nextNotes = notes, nextProfile = profile) {
    save.mutate({ questionnaire: { profile: nextProfile, answers: nextAnswers, notes: nextNotes } });
  }

  // ── Profile helpers ───────────────────────────────────────
  function addTag(key: string) {
    const val = (addInputs[key] ?? "").trim();
    if (!val) return;
    const next = { ...profile, [key]: [...(profile[key] ?? []), val] };
    setProfile(next);
    setAddInputs((a) => ({ ...a, [key]: "" }));
    saveAll(answers, notes, next);
  }

  function removeTag(key: string, tag: string) {
    const next = { ...profile, [key]: (profile[key] ?? []).filter((t) => t !== tag) };
    setProfile(next);
    saveAll(answers, notes, next);
  }

  // ── QA helpers ────────────────────────────────────────────
  function handleAnswer(qid: string, value: Answer) {
    const next = { ...answers, [qid]: value };
    setAnswers(next);
    saveAll(next, notes);
  }

  function handleNote(qid: string, value: string) {
    setNotes((n) => ({ ...n, [qid]: value }));
  }

  function handleNoteBlur() {
    saveAll(answers, notes);
  }

  function toggleSection(section: string) {
    setOpenSections((s) => {
      const next = new Set(s);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  }

  // ── Filter logic ──────────────────────────────────────────
  const filterCounts: Record<FilterType, number> = {
    all:          QUESTIONS.length,
    needs_review: QUESTIONS.filter((q) => deriveStatus(answers[q.id], notes[q.id]) === "needs_review").length,
    confident:    QUESTIONS.filter((q) => deriveStatus(answers[q.id], notes[q.id]) === "confident").length,
    yes:          QUESTIONS.filter((q) => answers[q.id] === "yes").length,
    no:           QUESTIONS.filter((q) => answers[q.id] === "no").length,
    edited:       QUESTIONS.filter((q) => notes[q.id] && notes[q.id].trim().length > 0).length,
  };

  function questionVisible(q: (typeof QUESTIONS)[0]): boolean {
    const ans  = answers[q.id];
    const note = notes[q.id];
    const status = deriveStatus(ans, note);
    if (filter === "all")          return true;
    if (filter === "needs_review") return status === "needs_review";
    if (filter === "confident")    return status === "confident";
    if (filter === "yes")          return ans === "yes";
    if (filter === "no")           return ans === "no";
    if (filter === "edited")       return !!(note && note.trim().length > 0);
    return true;
  }

  const FILTER_TABS: { key: FilterType; label: string }[] = [
    { key: "all",          label: "All" },
    { key: "needs_review", label: "Needs Review" },
    { key: "confident",    label: "Confident" },
    { key: "yes",          label: "Yes" },
    { key: "no",           label: "No" },
    { key: "edited",       label: "Edited" },
  ];

  // ── Sub-step 1: Profile ───────────────────────────────────
  if (subStep === 1) {
    return (
      <div className={styles.step}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepTitle}>Questionnaire — Step 1 of 2: Operational Profile</h2>
          <p className={styles.stepDesc}>
            Review and refine the operational profile. This context shapes which risks and questions are most relevant.
          </p>
        </div>

        <div className={styles.profileGrid}>
          {PROFILE_GROUPS.map((g) => (
            <div key={g.key} className={styles.profileCard}>
              <div className={styles.profileCardLabel}>{g.label}</div>
              <div className={styles.profileCardHint}>{g.hint}</div>
              <div className={styles.tagRow}>
                {(profile[g.key] ?? []).map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                    <button
                      type="button"
                      className={styles.tagRemove}
                      onClick={() => removeTag(g.key, tag)}
                    >×</button>
                  </span>
                ))}
                {(profile[g.key] ?? []).length === 0 && (
                  <span className={styles.tagEmpty}>No items yet</span>
                )}
              </div>
              <div className={styles.tagAddRow}>
                <input
                  className={styles.tagInput}
                  placeholder="Add item…"
                  value={addInputs[g.key] ?? ""}
                  onChange={(e) => setAddInputs((a) => ({ ...a, [g.key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addTag(g.key); }}
                />
                <button
                  type="button"
                  className={styles.tagAddBtn}
                  onClick={() => addTag(g.key)}
                >+ Add</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={() => { setSubStep(2); onValidChange(false); }}
          >
            Confirm Profile &amp; Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Sub-step 2: QA Review ─────────────────────────────────
  const needsReviewCount = filterCounts.needs_review;

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Questionnaire — Step 2 of 2: Q&amp;A Review</h2>
        <p className={styles.stepDesc}>
          Answer each question. Provide evidence notes where required.
          <span className={styles.progressHint}>{answeredCount} / {QUESTIONS.length} answered</span>
          {needsReviewCount > 0 && (
            <span className={styles.reviewHint}>{needsReviewCount} need review</span>
          )}
        </p>
      </div>

      {/* Filter bar */}
      <div className={styles.qaFilterBar}>
        <button
          type="button"
          className={styles.qaBackLink}
          onClick={() => setSubStep(1)}
        >
          ← Edit Profile
        </button>
        <div className={styles.qaFilters}>
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={clsx(styles.qaFilterBtn, { [styles.qaFilterBtnActive]: filter === key })}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className={styles.qaFilterCount}>{filterCounts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Accordion sections */}
      {SECTIONS.map((section) => {
        const sectionQs = QUESTIONS.filter((q) => q.section === section && questionVisible(q));
        if (sectionQs.length === 0) return null;
        const isOpen = openSections.has(section);
        const sectionAnswered = QUESTIONS.filter((q) => q.section === section && answers[q.id]).length;
        const sectionTotal    = QUESTIONS.filter((q) => q.section === section).length;

        return (
          <div key={section} className={styles.accordionSection} style={{ marginBottom: "0.75rem" }}>
            <button
              type="button"
              className={styles.accordionHeader}
              onClick={() => toggleSection(section)}
            >
              <span className={styles.accordionTitle}>{section}</span>
              <span className={styles.accordionMeta}>
                {sectionAnswered}/{sectionTotal}
              </span>
              <span className={styles.accordionChevron}>{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div className={styles.accordionBody}>
                {sectionQs.map((q) => {
                  const ans    = answers[q.id];
                  const note   = notes[q.id] ?? "";
                  const status = deriveStatus(ans, note);

                  return (
                    <div key={q.id} className={styles.qaCard}>
                      <div className={styles.qaCardHeader}>
                        <span className={styles.qaId}>{q.id}</span>
                        <span className={styles.qaText}>{q.text}</span>
                        <span className={clsx(styles.qaStatus, styles[`qaStatus_${status}`])}>
                          {status === "confident"    ? "Confident"    :
                           status === "needs_review" ? "Needs Review"  :
                           "Unanswered"}
                        </span>
                      </div>
                      <div className={styles.answerButtons}>
                        {ANSWER_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={clsx(styles.answerBtn, { [styles.answerBtnActive]: ans === opt.value })}
                            style={ans === opt.value
                              ? { borderColor: opt.color, color: opt.color, background: opt.color + "18" }
                              : {}}
                            onClick={() => handleAnswer(q.id, opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {ans && ans !== "yes" && ans !== "na" && (
                        <textarea
                          className={styles.noteInput}
                          placeholder="Add evidence or context to support this answer…"
                          value={note}
                          onChange={(e) => handleNote(q.id, e.target.value)}
                          onBlur={handleNoteBlur}
                          rows={2}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer */}
      <div className={styles.qaFooter}>
        <span className={styles.qaFooterMeta}>
          {answeredCount} of {QUESTIONS.length} answered
          {needsReviewCount > 0 ? ` · ${needsReviewCount} need review` : " · All confident"}
        </span>
        <button
          type="button"
          className={styles.confirmBtn}
          disabled={!allAnswered}
          onClick={() => saveAll()}
        >
          {allAnswered ? "✓ Confirm All Answers" : `Answer remaining ${QUESTIONS.length - answeredCount} questions`}
        </button>
      </div>
    </div>
  );
}
