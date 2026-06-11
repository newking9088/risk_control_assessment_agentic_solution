import { render, screen, waitFor } from "@testing-library/react";
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
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (
      url.includes("/taxonomy") ||
      url.includes("/documents") ||
      url.includes("/controls")
    ) {
      return Promise.resolve({ json: () => Promise.resolve([]), ok: true });
    }
    return Promise.resolve({ json: () => Promise.resolve(mockData), ok: true });
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
    expect(await screen.findByText(/assessment unit details/i)).toBeInTheDocument();
  });

  it("renders Assessment Unit Name label", async () => {
    setup(mockAssessmentFull);
    expect(await screen.findByText(/assessment unit name/i)).toBeInTheDocument();
  });

  it("renders Risk Scope label", async () => {
    setup(mockAssessmentFull);
    expect(await screen.findByText(/risk scope/i)).toBeInTheDocument();
  });

  it("renders Line of Business label", async () => {
    setup(mockAssessmentFull);
    expect(await screen.findByText(/line of business/i)).toBeInTheDocument();
  });

  it("renders input fields", async () => {
    setup(mockAssessmentFull);
    await screen.findByText(/assessment unit details/i);
    const inputs = document.querySelectorAll("input, textarea");
    expect(inputs.length).toBeGreaterThan(0);
  });
});

describe("StepPreparation — onValidChange", () => {
  it("calls onValidChange(false) when title and scope are empty", async () => {
    const onValidChange = vi.fn();
    setup(mockAssessmentEmpty, onValidChange);
    await waitFor(() => expect(onValidChange).toHaveBeenCalledWith(false));
  });

  it("calls onValidChange(true) when title and scope are filled", async () => {
    const onValidChange = vi.fn();
    setup(mockAssessmentFull, onValidChange);
    await waitFor(() => expect(onValidChange).toHaveBeenCalledWith(true));
  });
});
