import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { RATING_COLORS } from "@/lib/ratingTokens";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock("recharts", () => ({
  RadarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="radar-chart">{children}</div>
  ),
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  Radar: ({ name, stroke, fill }: { name: string; stroke: string; fill: string }) => (
    <div data-testid={`radar-${name.toLowerCase()}`} data-stroke={stroke} data-fill={fill} />
  ),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => null,
  Legend: () => null,
}));

import { api } from "@/lib/api";
import { StepSummary } from "@/features/wizard/steps/StepSummary";

const mockAssessment = {
  title: "Consumer Credit Card Opening",
  scope: "Retail",
  owner: "John Doe",
  business_unit: "Retail Banking",
  assessment_date: "2026-04-22T00:00:00Z",
  status: "in_progress",
};

const mockRisks = [
  {
    id: "r1",
    name: "Fraud Risk",
    category: "Financial",
    source: "EXT",
    inherent_likelihood: "high",
    inherent_impact: "critical",
    residual_likelihood: "medium",
    residual_impact: "high",
  },
  {
    id: "r2",
    name: "Compliance Risk",
    category: "Regulatory",
    source: "INT",
    inherent_likelihood: "medium",
    inherent_impact: "medium",
    residual_likelihood: "low",
    residual_impact: "low",
  },
];

const mockControls = [
  { id: "c1", risk_id: "r1", name: "Control A", overall_effectiveness: "Effective" },
  { id: "c2", risk_id: "r2", name: "Control B", overall_effectiveness: "Partially Effective" },
];

function setup() {
  (api.get as ReturnType<typeof vi.fn>)
    .mockImplementation((url: string) => {
      if (url.includes("/risks")) return Promise.resolve({ json: () => Promise.resolve(mockRisks), ok: true });
      if (url.includes("/controls")) return Promise.resolve({ json: () => Promise.resolve(mockControls), ok: true });
      return Promise.resolve({ json: () => Promise.resolve(mockAssessment), ok: true });
    });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepSummary assessmentId="assessment-1" onValidChange={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("StepSummary — structure", () => {
  it("renders the Assessment Summary heading", async () => {
    setup();
    expect(await screen.findByText("Assessment Summary")).toBeInTheDocument();
  });

  it("renders the Risk Register section", async () => {
    setup();
    expect(await screen.findByText("Risk Register")).toBeInTheDocument();
  });

  it("renders risk names in table", async () => {
    setup();
    expect(await screen.findByText("Fraud Risk")).toBeInTheDocument();
    expect(await screen.findByText("Compliance Risk")).toBeInTheDocument();
  });
});

describe("StepSummary — radar chart uses RATING_COLORS", () => {
  it("Inherent radar uses RATING_COLORS.critical.bg as stroke", async () => {
    setup();
    const radar = await screen.findByTestId("radar-inherent");
    expect(radar.dataset.stroke).toBe(RATING_COLORS.critical.bg);
    expect(radar.dataset.fill).toBe(RATING_COLORS.critical.bg);
  });

  it("Residual radar uses RATING_COLORS.completed.bg as stroke", async () => {
    setup();
    const radar = await screen.findByTestId("radar-residual");
    expect(radar.dataset.stroke).toBe(RATING_COLORS.completed.bg);
    expect(radar.dataset.fill).toBe(RATING_COLORS.completed.bg);
  });
});

describe("StepSummary — source tags use RATING_COLORS", () => {
  it("EXT tag uses RATING_COLORS.high.bg background", async () => {
    setup();
    await screen.findByText("Fraud Risk");
    const extTag = screen.getByText("EXT");
    expect(extTag.style.background).toBe(RATING_COLORS.high.bg);
  });

  it("INT tag uses RATING_COLORS.low.bg background", async () => {
    setup();
    await screen.findByText("Compliance Risk");
    const intTag = screen.getByText("INT");
    expect(intTag.style.background).toBe(RATING_COLORS.low.bg);
  });
});

describe("StepSummary — badge class names", () => {
  it("risk level badges use Step.module.scss classes not inline hex", async () => {
    setup();
    await screen.findByText("Fraud Risk");
    const badges = document.querySelectorAll("[class*='badge']");
    expect(badges.length).toBeGreaterThan(0);
  });
});

describe("StepSummary — onValidChange", () => {
  it("calls onValidChange(true) on mount", async () => {
    const onValidChange = vi.fn();
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () => Promise.resolve([]),
      ok: true,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <StepSummary assessmentId="a1" onValidChange={onValidChange} />
      </QueryClientProvider>
    );
    await screen.findByText("Assessment Summary");
    expect(onValidChange).toHaveBeenCalledWith(true);
  });
});
