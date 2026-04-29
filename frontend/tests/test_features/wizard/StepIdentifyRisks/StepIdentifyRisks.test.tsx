import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { api } from "@/lib/api";
import { StepIdentifyRisks } from "@/features/wizard/steps/StepIdentifyRisks";

const mockRisks = [
  { id: "r1", name: "Fraud Risk", category: "Financial", source: "EXT", description: "" },
  { id: "r2", name: "Compliance Risk", category: "Compliance", source: "INT", description: "" },
];

function setup(risks: object[], onValidChange = vi.fn()) {
  (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve(risks),
    ok: true,
  });
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve({ id: "new-r" }),
    ok: true,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepIdentifyRisks assessmentId="a1" onValidChange={onValidChange} />
    </QueryClientProvider>
  );
}

describe("StepIdentifyRisks — structure", () => {
  it("renders Identify Risks heading", async () => {
    setup(mockRisks);
    expect(await screen.findByText(/identify risks/i)).toBeInTheDocument();
  });

  it("renders risk names from mock data", async () => {
    setup(mockRisks);
    expect(await screen.findByText("Fraud Risk")).toBeInTheDocument();
    expect(await screen.findByText("Compliance Risk")).toBeInTheDocument();
  });

  it("renders category dropdown", async () => {
    setup(mockRisks);
    await screen.findByText("Fraud Risk");
    const selects = document.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("renders category options including Operational and Financial", async () => {
    setup(mockRisks);
    await screen.findByText("Fraud Risk");
    expect(screen.getByText("Operational")).toBeInTheDocument();
    expect(screen.getByText("Financial")).toBeInTheDocument();
    expect(screen.getByText("Compliance")).toBeInTheDocument();
  });

  it("renders add risk form elements", async () => {
    setup(mockRisks);
    await screen.findByText("Fraud Risk");
    const inputs = document.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThan(0);
  });
});

describe("StepIdentifyRisks — onValidChange", () => {
  it("calls onValidChange(true) when risks.length > 0", async () => {
    const onValidChange = vi.fn();
    setup(mockRisks, onValidChange);
    await screen.findByText("Fraud Risk");
    expect(onValidChange).toHaveBeenCalledWith(true);
  });

  it("calls onValidChange(false) when risks array is empty", async () => {
    const onValidChange = vi.fn();
    setup([], onValidChange);
    await screen.findByText(/identify risks/i);
    expect(onValidChange).toHaveBeenCalledWith(false);
  });
});

describe("StepIdentifyRisks — source tags", () => {
  it("shows EXT tag for external risk", async () => {
    setup(mockRisks);
    expect(await screen.findByText("EXT")).toBeInTheDocument();
  });

  it("shows INT tag for internal risk", async () => {
    setup(mockRisks);
    expect(await screen.findByText("INT")).toBeInTheDocument();
  });
});
