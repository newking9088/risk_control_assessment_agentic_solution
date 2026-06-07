import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from "@/lib/api";
import { StepIdentifyRisks } from "@/features/wizard/steps/StepIdentifyRisks";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockAssessment = { id: "a1", title: "Consumer Contact Center" };

const mockRisks = [
  {
    id: "r1",
    assessment_id: "a1",
    name: "Payment Fraud",
    category: "Card Fraud",
    source: "EXT" as const,
    description: "Risk that fraudulent payments may occur.",
    applicable: null,
    rationale: null,
    applicability_confidence: null,
    confidence_label: null,
    decision_basis: null,
    requires_review: false,
    taxonomy_risk_id: "R001E",
  },
  {
    id: "r2",
    assessment_id: "a1",
    name: "Employee Data Theft",
    category: "Insider Threat",
    source: "INT" as const,
    description: "Risk that employees may exfiltrate customer data.",
    applicable: null,
    rationale: null,
    applicability_confidence: null,
    confidence_label: null,
    decision_basis: null,
    requires_review: false,
    taxonomy_risk_id: "R002I",
  },
];

function setup(risks = mockRisks, onValidChange = vi.fn()) {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.includes("/risks")) {
      return Promise.resolve({ json: () => Promise.resolve(risks), ok: true });
    }
    return Promise.resolve({ json: () => Promise.resolve(mockAssessment), ok: true });
  });
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve({ imported: 3, skipped: 0 }),
    ok: true,
  });
  (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve({ id: "r1" }),
    ok: true,
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepIdentifyRisks assessmentId="a1" onValidChange={onValidChange} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("StepIdentifyRisks — rendering", () => {
  it("renders the step heading", async () => {
    setup();
    expect(await screen.findByText(/identify.*risks/i)).toBeInTheDocument();
  });

  it("renders all risk names from the API response", async () => {
    setup();
    expect(await screen.findByText("Payment Fraud")).toBeInTheDocument();
    expect(await screen.findByText("Employee Data Theft")).toBeInTheDocument();
  });

  it("shows 'External Fraud/Risk' label in L1 column for EXT source", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    expect(screen.getByText("External Fraud/Risk")).toBeInTheDocument();
  });

  it("shows 'Internal/Insider Fraud/Risk' label in L1 column for INT source", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    expect(screen.getByText("Internal/Insider Fraud/Risk")).toBeInTheDocument();
  });

  it("shows category value in the L2 column", async () => {
    setup();
    expect(await screen.findByText("Card Fraud")).toBeInTheDocument();
    expect(await screen.findByText("Insider Threat")).toBeInTheDocument();
  });

  it("shows risk description as the statement text", async () => {
    setup();
    expect(await screen.findByText("Risk that fraudulent payments may occur.")).toBeInTheDocument();
  });

  it("renders an AI badge in each risk row", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    const aiBadges = screen.getAllByText("AI");
    expect(aiBadges).toHaveLength(mockRisks.length);
  });

  it("renders a toggle switch for each risk", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    const toggles = screen.getAllByRole("switch");
    expect(toggles).toHaveLength(mockRisks.length);
  });

  it("shows empty state when no risks have been loaded", async () => {
    setup([]);
    expect(await screen.findByText(/no risks loaded yet/i)).toBeInTheDocument();
  });

  it("shows the decided count bar with correct counts", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    expect(screen.getByText(/0 of 2 risks marked applicable/i)).toBeInTheDocument();
  });
});

// ── Filter dropdowns ──────────────────────────────────────────────────────────

describe("StepIdentifyRisks — filters", () => {
  it("renders L1 and L2 filter dropdowns", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    const selects = document.querySelectorAll("select");
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it("L1 dropdown contains L1 labels derived from source field", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    const selects = Array.from(document.querySelectorAll("select"));
    const l1Select = selects[0];
    expect(l1Select.textContent).toContain("External Fraud/Risk");
    expect(l1Select.textContent).toContain("Internal/Insider Fraud/Risk");
  });

  it("L2 dropdown contains category values from the risk data", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    const selects = Array.from(document.querySelectorAll("select"));
    const l2Select = selects[1];
    expect(l2Select.textContent).toContain("Card Fraud");
    expect(l2Select.textContent).toContain("Insider Threat");
  });

  it("search input filters the visible risk rows", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    const searchInput = document.querySelector("input[type='text']") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "Payment" } });
    await waitFor(() => {
      expect(screen.getByText("Payment Fraud")).toBeInTheDocument();
      expect(screen.queryByText("Employee Data Theft")).not.toBeInTheDocument();
    });
  });

  it("shows 'No risks match' message when search has no results", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    const searchInput = document.querySelector("input[type='text']") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "zzz-no-match-zzz" } });
    await waitFor(() => {
      expect(screen.getByText(/no risks match/i)).toBeInTheDocument();
    });
  });
});

// ── onValidChange ─────────────────────────────────────────────────────────────

describe("StepIdentifyRisks — onValidChange", () => {
  it("calls onValidChange(false) when no risks are loaded", async () => {
    const onValidChange = vi.fn();
    setup([], onValidChange);
    await screen.findByText(/no risks loaded yet/i);
    await waitFor(() => expect(onValidChange).toHaveBeenCalledWith(false));
  });

  it("calls onValidChange(false) when some risks still have applicable=null", async () => {
    const onValidChange = vi.fn();
    setup(mockRisks, onValidChange);  // all applicable=null
    await screen.findByText("Payment Fraud");
    await waitFor(() => expect(onValidChange).toHaveBeenCalledWith(false));
  });

  it("calls onValidChange(true) when every risk has applicable set (not null)", async () => {
    const onValidChange = vi.fn();
    const decidedRisks = mockRisks.map((r) => ({ ...r, applicable: true }));
    setup(decidedRisks, onValidChange);
    await screen.findByText("Payment Fraud");
    await waitFor(() => expect(onValidChange).toHaveBeenCalledWith(true));
  });

  it("calls onValidChange(true) even when some risks are applicable=false (decided, not null)", async () => {
    const onValidChange = vi.fn();
    const decidedRisks = [
      { ...mockRisks[0], applicable: true },
      { ...mockRisks[1], applicable: false },
    ];
    setup(decidedRisks, onValidChange);
    await screen.findByText("Payment Fraud");
    await waitFor(() => expect(onValidChange).toHaveBeenCalledWith(true));
  });
});

// ── Toggle switch ─────────────────────────────────────────────────────────────

describe("StepIdentifyRisks — toggle switch", () => {
  it("toggle is aria-checked=false when applicable is null", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    const toggles = screen.getAllByRole("switch");
    expect(toggles[0]).toHaveAttribute("aria-checked", "false");
  });

  it("toggle is aria-checked=true when applicable is true", async () => {
    const risksWithApplicable = [{ ...mockRisks[0], applicable: true }, mockRisks[1]];
    setup(risksWithApplicable);
    await screen.findByText("Payment Fraud");
    const toggles = screen.getAllByRole("switch");
    expect(toggles[0]).toHaveAttribute("aria-checked", "true");
  });

  it("toggle is aria-checked=false when applicable is false", async () => {
    const risksWithFalse = [{ ...mockRisks[0], applicable: false }, mockRisks[1]];
    setup(risksWithFalse);
    await screen.findByText("Payment Fraud");
    const toggles = screen.getAllByRole("switch");
    expect(toggles[0]).toHaveAttribute("aria-checked", "false");
  });

  it("clicking toggle calls api.patch with applicable=true when risk was not applicable", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    const toggles = screen.getAllByRole("switch");
    fireEvent.click(toggles[0]);
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/api/v1/assessments/a1/risks/r1",
        expect.objectContaining({ applicable: true })
      );
    });
  });

  it("clicking toggle calls api.patch with applicable=false when risk was applicable", async () => {
    const applicableRisks = [{ ...mockRisks[0], applicable: true }, mockRisks[1]];
    setup(applicableRisks);
    await screen.findByText("Payment Fraud");
    const toggles = screen.getAllByRole("switch");
    fireEvent.click(toggles[0]);
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/api/v1/assessments/a1/risks/r1",
        expect.objectContaining({ applicable: false })
      );
    });
  });
});

// ── Import from taxonomy ───────────────────────────────────────────────────────

describe("StepIdentifyRisks — import", () => {
  it("calls import-from-taxonomy endpoint when refresh button clicked", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    // The RotateCcw button has title="Load from Taxonomy"
    const importBtn = screen.getByTitle("Load from Taxonomy");
    fireEvent.click(importBtn);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/v1/assessments/a1/risks/import-from-taxonomy",
        {}
      );
    });
  });

  it("shows import confirmation banner after successful import", async () => {
    setup();
    await screen.findByText("Payment Fraud");
    const importBtn = screen.getByTitle("Load from Taxonomy");
    fireEvent.click(importBtn);
    expect(await screen.findByText(/imported 3 risks/i)).toBeInTheDocument();
  });
});
