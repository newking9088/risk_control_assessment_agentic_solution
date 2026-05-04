import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import { StepEvaluateControls } from "@/features/wizard/steps/StepEvaluateControls";

const mockRisks = [
  {
    id: "r1",
    name: "Fraud Risk",
    category: "Financial",
    source: "EXT",
    inherent_likelihood: "high",
    inherent_impact: "critical",
  },
  {
    id: "r2",
    name: "Compliance Risk",
    category: "Regulatory",
    source: "INT",
    inherent_likelihood: "medium",
    inherent_impact: "medium",
  },
];

const mockControls = [
  {
    id: "c1",
    risk_id: "r1",
    name: "Transaction Monitoring",
    control_ref: "CT-001",
    type: "Detective",
    is_key: true,
    description: "Real-time transaction monitoring for fraud patterns",
    design_effectiveness: 3,
    operating_effectiveness: 3,
    overall_effectiveness: "Moderately Effective",
    rationale: "Some gaps in coverage",
  },
];

function setup(onValidChange = vi.fn()) {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.includes("/controls")) {
      return Promise.resolve({ json: () => Promise.resolve(mockControls), ok: true });
    }
    return Promise.resolve({ json: () => Promise.resolve(mockRisks), ok: true });
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepEvaluateControls assessmentId="a1" onValidChange={onValidChange} />
    </QueryClientProvider>
  );
}

describe("StepEvaluateControls — structure", () => {
  it("renders Evaluate Controls heading", async () => {
    setup();
    expect(await screen.findByText("Evaluate Controls")).toBeInTheDocument();
  });

  it("renders Applicable Risks list header", async () => {
    setup();
    expect(await screen.findByText("Applicable Risks")).toBeInTheDocument();
  });

  it("renders both risk names in left panel", async () => {
    setup();
    expect(await screen.findByText("Fraud Risk")).toBeInTheDocument();
    expect(await screen.findByText("Compliance Risk")).toBeInTheDocument();
  });
});

describe("StepEvaluateControls — control panel", () => {
  it("shows control name for selected risk", async () => {
    setup();
    expect(await screen.findByText("Transaction Monitoring")).toBeInTheDocument();
  });

  it("shows key badge for key controls", async () => {
    setup();
    expect(await screen.findByText("Key")).toBeInTheDocument();
  });

  it("shows control reference", async () => {
    setup();
    expect(await screen.findByText("CT-001")).toBeInTheDocument();
  });
});

describe("StepEvaluateControls — badge classes (no inline hex)", () => {
  it("inherent level badge uses Step.module.scss class not inline style", async () => {
    setup();
    await screen.findByText("Fraud Risk");
    const badges = document.querySelectorAll("[class*='badge']");
    badges.forEach((badge) => {
      expect((badge as HTMLElement).style.backgroundColor).toBe("");
      expect((badge as HTMLElement).style.color).toBe("");
    });
  });
});

describe("StepEvaluateControls — source tags", () => {
  it("shows EXT tag for external risk", async () => {
    setup();
    expect(await screen.findByText("EXT")).toBeInTheDocument();
  });

  it("shows INT tag for internal risk", async () => {
    setup();
    expect(await screen.findByText("INT")).toBeInTheDocument();
  });
});

describe("StepEvaluateControls — add control", () => {
  it("shows Add Control button", async () => {
    setup();
    expect(await screen.findByText("+ Add Control")).toBeInTheDocument();
  });

  it("shows new control form on Add Control click", async () => {
    setup();
    const addBtn = await screen.findByText("+ Add Control");
    fireEvent.click(addBtn);
    expect(screen.getByText("New Control")).toBeInTheDocument();
  });

  it("cancel hides the new control form", async () => {
    setup();
    const addBtn = await screen.findByText("+ Add Control");
    fireEvent.click(addBtn);
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("New Control")).toBeNull();
  });
});

describe("StepEvaluateControls — onValidChange", () => {
  it("calls onValidChange(true) when controls exist", async () => {
    const onValidChange = vi.fn();
    setup(onValidChange);
    await screen.findByText("Transaction Monitoring");
    expect(onValidChange).toHaveBeenCalledWith(true);
  });
});
