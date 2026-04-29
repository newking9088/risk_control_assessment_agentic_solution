import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Mocks ─────────────────────────────────────────────── */
vi.mock("@tanstack/react-router", () => ({
  createRoute: vi.fn(() => ({ path: "/assessments" })),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockResolvedValue({
    id: "s1",
    userId: "u1",
    email: "analyst@example.com",
    role: "analyst",
    tenantId: "t1",
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "@/lib/api";

const mockAssessments = [
  {
    id: "aaa-111-bbb-222",
    title: "Consumer Credit Card Opening",
    status: "in_progress",
    current_step: 4,
    created_at: "2026-04-22T10:00:00Z",
    owner: "John Doe",
    business_unit: "Retail",
    inherent_risk_rating: "very high",
    controls_effectiveness_rating: "weak",
    residual_risk_rating: "very high",
  },
  {
    id: "ccc-333-ddd-444",
    title: "Digital Banking Platform",
    status: "complete",
    current_step: 7,
    created_at: "2026-03-19T10:00:00Z",
    updated_at: "2026-03-19T16:00:00Z",
    owner: "Jane Smith",
    business_unit: "Digital",
    inherent_risk_rating: "very high",
    controls_effectiveness_rating: "partial",
    residual_risk_rating: "high",
  },
];

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/* ── Helpers ────────────────────────────────────────────── */
function renderDashboard() {
  const qc = makeClient();
  (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve(mockAssessments),
    ok: true,
  });

  /* Import the page component directly (bypassing router route wrapper) */
  const { AssessmentsPage } = require("../../../routes/assessments.tsx") as { AssessmentsPage: React.FC };
  return render(
    <QueryClientProvider client={qc}>
      <AssessmentsPage />
    </QueryClientProvider>
  );
}

/* ── Tests ──────────────────────────────────────────────── */
describe("Assessments dashboard — stat cards", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows total assessment count", async () => {
    renderDashboard();
    expect(await screen.findByText("2")).toBeInTheDocument();
  });
});

describe("Assessments dashboard — filter tabs", () => {
  it("renders All tab", async () => {
    renderDashboard();
    expect(await screen.findByRole("button", { name: /all/i })).toBeInTheDocument();
  });

  it("renders In Progress tab", async () => {
    renderDashboard();
    expect(await screen.findByRole("button", { name: /in progress/i })).toBeInTheDocument();
  });

  it("renders Completed tab", async () => {
    renderDashboard();
    expect(await screen.findByRole("button", { name: /completed/i })).toBeInTheDocument();
  });
});

describe("Assessments dashboard — table content", () => {
  it("shows assessment title in table", async () => {
    renderDashboard();
    expect(await screen.findByText("Consumer Credit Card Opening")).toBeInTheDocument();
  });

  it("shows AU ID derived from uuid", async () => {
    renderDashboard();
    expect(await screen.findByText("AU-AAA111")).toBeInTheDocument();
  });

  it("shows both assessments", async () => {
    renderDashboard();
    expect(await screen.findByText("Digital Banking Platform")).toBeInTheDocument();
  });
});

describe("Assessments dashboard — search", () => {
  it("filters by search term", async () => {
    renderDashboard();
    const input = await screen.findByPlaceholderText(/search assessment/i);
    fireEvent.change(input, { target: { value: "Digital" } });
    expect(screen.queryByText("Consumer Credit Card Opening")).toBeNull();
    expect(screen.getByText("Digital Banking Platform")).toBeInTheDocument();
  });

  it("clears filter when search is emptied", async () => {
    renderDashboard();
    const input = await screen.findByPlaceholderText(/search assessment/i);
    fireEvent.change(input, { target: { value: "Digital" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(await screen.findByText("Consumer Credit Card Opening")).toBeInTheDocument();
  });
});

describe("Assessments dashboard — stat icon CSS vars", () => {
  it("stat icons use CSS variable colours not hardcoded hex", async () => {
    renderDashboard();
    await screen.findByText("Assessment Dashboard");
    const icons = document.querySelectorAll("[class*='statIcon']");
    icons.forEach((icon) => {
      const style = (icon as HTMLElement).style.color;
      expect(style).toMatch(/^var\(--fra-stat-/);
    });
  });
});
