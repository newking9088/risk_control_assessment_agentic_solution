import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), patch: vi.fn() } }));

import { api } from "@/lib/api";
import { StepPreparation } from "@/features/wizard/steps/StepPreparation";

const mockAssessmentFull = {
  id: "a1",
  title: "Consumer Credit Card",
  description: "Test desc",
  scope: "Retail Banking",
  assessment_date: "2026-04-22T00:00:00Z",
  owner: "Jane Doe",
  business_unit: "Retail",
};

const mockAssessmentEmpty = {
  id: "a1",
  title: "",
  description: "",
  scope: "",
  assessment_date: "",
  owner: "",
  business_unit: "",
};

function setup(mockData: object, onValidChange = vi.fn()) {
  (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve(mockData),
    ok: true,
  });
  (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve(mockData),
    ok: true,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepPreparation assessmentId="a1" onValidChange={onValidChange} />
    </QueryClientProvider>
  );
}

describe("StepPreparation — structure", () => {
  it("renders form heading", async () => {
    setup(mockAssessmentFull);
    expect(await screen.findByText(/assessment details/i)).toBeInTheDocument();
  });

  it("renders Title label", async () => {
    setup(mockAssessmentFull);
    expect(await screen.findByText(/title/i)).toBeInTheDocument();
  });

  it("renders Scope label", async () => {
    setup(mockAssessmentFull);
    expect(await screen.findByText(/scope/i)).toBeInTheDocument();
  });

  it("renders Owner label", async () => {
    setup(mockAssessmentFull);
    expect(await screen.findByText(/owner/i)).toBeInTheDocument();
  });

  it("renders input fields", async () => {
    setup(mockAssessmentFull);
    await screen.findByText(/title/i);
    const inputs = document.querySelectorAll("input, textarea");
    expect(inputs.length).toBeGreaterThan(0);
  });
});

describe("StepPreparation — onValidChange", () => {
  it("calls onValidChange(false) when title and scope are empty", async () => {
    const onValidChange = vi.fn();
    setup(mockAssessmentEmpty, onValidChange);
    await screen.findByText(/assessment details/i);
    expect(onValidChange).toHaveBeenCalledWith(false);
  });

  it("calls onValidChange(true) when title and scope are filled", async () => {
    const onValidChange = vi.fn();
    setup(mockAssessmentFull, onValidChange);
    await screen.findByText(/assessment details/i);
    expect(onValidChange).toHaveBeenCalledWith(true);
  });
});
