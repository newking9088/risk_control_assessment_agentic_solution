import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import { StepInherentRisk } from "@/features/wizard/steps/StepInherentRisk";

const mockRisks = [
  {
    id: "r1",
    name: "Fraud Risk",
    category: "Financial",
    source: "EXT",
    inherent_likelihood: null,
    inherent_impact: null,
  },
  {
    id: "r2",
    name: "Compliance Risk",
    category: "Regulatory",
    source: "INT",
    inherent_likelihood: "medium",
    inherent_impact: "high",
  },
];

function setup(onValidChange = vi.fn()) {
  (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve(mockRisks),
    ok: true,
  });
  (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve({}),
    ok: true,
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepInherentRisk assessmentId="a1" onValidChange={onValidChange} />
    </QueryClientProvider>
  );
}

describe("StepInherentRisk — structure", () => {
  it("renders Inherent Risk Rating heading", async () => {
    setup();
    expect(await screen.findByText("Inherent Risk Rating")).toBeInTheDocument();
  });

  it("renders risk names", async () => {
    setup();
    expect(await screen.findByText("Fraud Risk")).toBeInTheDocument();
    expect(await screen.findByText("Compliance Risk")).toBeInTheDocument();
  });

  it("renders Likelihood and Impact panels for each risk", async () => {
    setup();
    expect(await screen.findAllByText("Likelihood")).toHaveLength(2);
    expect(await screen.findAllByText("Impact")).toHaveLength(2);
  });
});

describe("StepInherentRisk — level buttons", () => {
  it("renders Low/Medium/High/Critical buttons", async () => {
    setup();
    await screen.findByText("Fraud Risk");
    const lowBtns = screen.getAllByText("Low");
    expect(lowBtns.length).toBeGreaterThan(0);
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
  });

  it("level button classes use CSS variables not inline hex", async () => {
    setup();
    await screen.findByText("Fraud Risk");
    const levelBtns = document.querySelectorAll("[class*='levelBtn']");
    levelBtns.forEach((btn) => {
      expect((btn as HTMLElement).style.backgroundColor).toBe("");
    });
  });
});

describe("StepInherentRisk — progress hint", () => {
  it("shows rated count progress hint", async () => {
    setup();
    expect(await screen.findByText(/1 \/ 2 rated/)).toBeInTheDocument();
  });
});

describe("StepInherentRisk — onValidChange", () => {
  it("calls onValidChange(false) when not all risks rated", async () => {
    const onValidChange = vi.fn();
    setup(onValidChange);
    await screen.findByText("Fraud Risk");
    expect(onValidChange).toHaveBeenCalledWith(false);
  });

  it("calls onValidChange(true) when all risks rated", async () => {
    const allRated = mockRisks.map((r) => ({
      ...r,
      inherent_likelihood: "high",
      inherent_impact: "critical",
    }));
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () => Promise.resolve(allRated),
      ok: true,
    });
    const onValidChange = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <StepInherentRisk assessmentId="a1" onValidChange={onValidChange} />
      </QueryClientProvider>
    );
    await screen.findByText("Fraud Risk");
    expect(onValidChange).toHaveBeenCalledWith(true);
  });
});
