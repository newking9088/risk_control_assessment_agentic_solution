import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SettingsDrawer } from "@/features/settings/SettingsDrawer";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { usePresence } from "@/features/collaborate/usePresence";
import { useAssessmentSSE, type SSEEvent } from "@/features/collaborate/useAssessmentSSE";
import { TopNav } from "./TopNav";
import { ChatWidget } from "@/features/chat/ChatWidget";
import { WizardSidebar } from "./WizardSidebar";
import { StepPreparation } from "./steps/StepPreparation";
import { StepQuestionnaire } from "./steps/StepQuestionnaire";
import { StepIdentifyRisks } from "./steps/StepIdentifyRisks";
import { StepInherentRisk } from "./steps/StepInherentRisk";
import { StepEvaluateControls } from "./steps/StepEvaluateControls";
import { StepResidualRisk } from "./steps/StepResidualRisk";
import { StepSummary } from "./steps/StepSummary";
import pStyles from "@/features/collaborate/CollaboratorPanel.module.scss";
import styles from "./WizardLayout.module.scss";

export const STEPS = [
  { id: 1, label: "Preparation",        subtitle: "Setup & planning" },
  { id: 2, label: "Questionnaire",      subtitle: "Assessment diagnostic" },
  { id: 3, label: "Identify Risks",     subtitle: "Taxonomy-driven risks" },
  { id: 4, label: "Inherent Risk",      subtitle: "Rate likelihood & impact" },
  { id: 5, label: "Evaluate Controls",  subtitle: "Map & rate controls" },
  { id: 6, label: "Residual Risk",      subtitle: "Calculate final risk" },
  { id: 7, label: "Summary",            subtitle: "Assessment overview" },
];

export type StepProps = {
  assessmentId: string;
  onValidChange: (valid: boolean) => void;
};

const STEP_COMPONENTS: Record<number, React.ComponentType<StepProps>> = {
  1: StepPreparation,
  2: StepQuestionnaire,
  3: StepIdentifyRisks,
  4: StepInherentRisk,
  5: StepEvaluateControls,
  6: StepResidualRisk,
  7: StepSummary,
};

interface Props {
  assessmentId: string;
  currentStep: number;
  assessmentTitle?: string;
}

export function WizardLayout({ assessmentId, currentStep, assessmentTitle }: Props) {
  const [activeStep, setActiveStep] = useState(currentStep);
  const [stepValid, setStepValid] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conflictBanner, setConflictBanner] = useState<SSEEvent | null>(null);
  const qc = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    staleTime: 60_000,
  });

  const currentUser = session
    ? { id: session.userId, name: session.email.split("@")[0] }
    : null;

  const { activeUsers } = usePresence(assessmentId, currentUser);

  useAssessmentSSE(assessmentId, session?.userId ?? null, (ev) => {
    setConflictBanner(ev);
  });

  const advance = useMutation({
    mutationFn: (step: number) =>
      api.patch(`/api/v1/assessments/${assessmentId}`, { current_step: step }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessment", assessmentId] }),
  });

  const StepComponent = STEP_COMPONENTS[activeStep];

  const completedSteps = Math.max(0, activeStep - 1);
  const progressPct = Math.round((completedSteps / STEPS.length) * 100);

  function handleContinue() {
    if (activeStep < STEPS.length) {
      const next = activeStep + 1;
      advance.mutate(next);
      setActiveStep(next);
      setStepValid(false);
    }
  }

  function handleBack() {
    if (activeStep > 1) {
      setActiveStep((s) => s - 1);
      setStepValid(true);
    }
  }

  return (
    <div className={styles.shell}>
      <TopNav assessmentTitle={assessmentTitle} onSettingsOpen={() => setSettingsOpen(true)}>
        {/* Presence avatars injected into TopNav via children */}
        {activeUsers.length > 0 && (
          <div className={pStyles.presenceAvatars} title={`${activeUsers.length} user(s) online`}>
            {activeUsers.slice(0, 4).map((u) => (
              <div key={u.user_id} className={pStyles.presenceAvatar} title={u.display_name}>
                {(u.display_name || "?")[0].toUpperCase()}
                <span className={pStyles.presenceOnlineDot} />
              </div>
            ))}
            {activeUsers.length > 4 && (
              <span className={pStyles.presenceCount}>+{activeUsers.length - 4} online</span>
            )}
          </div>
        )}
      </TopNav>
      {conflictBanner && (
        <div className={styles.conflictBanner}>
          <span>
            ⚡ <strong>{conflictBanner.user_name ?? "Another collaborator"}</strong> made changes.
          </span>
          <button
            className={styles.conflictRefresh}
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["assessment", assessmentId] });
              setConflictBanner(null);
            }}
          >
            Refresh
          </button>
          <button
            className={styles.conflictKeep}
            onClick={() => setConflictBanner(null)}
          >
            Keep mine
          </button>
        </div>
      )}
      <div className={styles.body}>
        <WizardSidebar
          steps={STEPS}
          activeStep={activeStep}
          progressPct={progressPct}
          onSelectStep={(s) => {
            if (s <= activeStep) {
              setActiveStep(s);
              setStepValid(true);
            }
          }}
        />
        <div className={styles.main}>
          <div className={styles.content}>
            {StepComponent && (
              <StepComponent
                assessmentId={assessmentId}
                onValidChange={setStepValid}
              />
            )}
          </div>
          <footer className={styles.footer}>
            <button
              onClick={handleBack}
              disabled={activeStep === 1}
              className={styles.backBtn}
            >
              ← Back
            </button>
            {activeStep < STEPS.length ? (
              <button
                onClick={handleContinue}
                disabled={!stepValid || advance.isPending}
                className={styles.continueBtn}
              >
                {advance.isPending ? "Saving…" : "Continue →"}
              </button>
            ) : (
              <span className={styles.doneLabel}>✓ Assessment complete</span>
            )}
          </footer>
        </div>
      </div>
      <ChatWidget assessmentId={assessmentId} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
