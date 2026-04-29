import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { patch: vi.fn() },
}));

import { api } from "@/lib/api";
import { StepQuestionnaire } from "@/features/wizard/steps/StepQuestionnaire";

function setup(onValidChange = vi.fn()) {
  (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve({}),
    ok: true,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepQuestionnaire assessmentId="a1" onValidChange={onValidChange} />
    </QueryClientProvider>
  );
}

describe("StepQuestionnaire — structure", () => {
  it("renders questionnaire heading", () => {
    setup();
    expect(screen.getByText(/questionnaire/i)).toBeInTheDocument();
  });

  it("renders Governance section header", () => {
    setup();
    expect(screen.getByText("Governance")).toBeInTheDocument();
  });

  it("renders Operations section header", () => {
    setup();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("renders Technology section header", () => {
    setup();
    expect(screen.getByText("Technology")).toBeInTheDocument();
  });

  it("renders Compliance section header", () => {
    setup();
    expect(screen.getByText("Compliance")).toBeInTheDocument();
  });

  it("renders question text", () => {
    setup();
    const questions = document.querySelectorAll("[class*='questionText'], [class*='question']");
    expect(questions.length).toBeGreaterThan(0);
  });

  it("renders Yes/No/N/A radio options for questions", () => {
    setup();
    const yesLabels = screen.getAllByText("Yes");
    const noLabels = screen.getAllByText("No");
    expect(yesLabels.length).toBeGreaterThan(0);
    expect(noLabels.length).toBeGreaterThan(0);
  });
});

describe("StepQuestionnaire — onValidChange", () => {
  it("calls onValidChange(false) initially (no answers selected)", () => {
    const onValidChange = vi.fn();
    setup(onValidChange);
    expect(onValidChange).toHaveBeenCalledWith(false);
  });
});
