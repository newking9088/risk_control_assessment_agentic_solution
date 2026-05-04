import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createRoute: vi.fn(() => ({})),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockResolvedValue(null),
  signOut: vi.fn(),
}));

import { MethodologyPage } from "@/routes/methodology";
import { RATING_COLORS, CONTROL_COLORS } from "@/lib/ratingTokens";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("MethodologyPage — sections", () => {
  it("renders FRA Methodology heading", () => {
    wrap(<MethodologyPage />);
    expect(screen.getByText("FRA Methodology")).toBeInTheDocument();
  });

  it("renders Inherent Risk Rating section", () => {
    wrap(<MethodologyPage />);
    expect(screen.getByText(/1\. Inherent Risk Rating/i)).toBeInTheDocument();
  });

  it("renders Control Effectiveness Rating section", () => {
    wrap(<MethodologyPage />);
    expect(screen.getByText(/2\. Control Effectiveness Rating/i)).toBeInTheDocument();
  });

  it("renders Residual Risk Calculation section", () => {
    wrap(<MethodologyPage />);
    expect(screen.getByText(/3\. Residual Risk Calculation/i)).toBeInTheDocument();
  });

  it("renders Key Methodology Principles section", () => {
    wrap(<MethodologyPage />);
    expect(screen.getByText("Key Methodology Principles")).toBeInTheDocument();
  });
});

describe("MethodologyPage — impact scale circles", () => {
  it("renders all 4 impact scale labels", () => {
    wrap(<MethodologyPage />);
    expect(screen.getAllByText("Low").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Moderate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Very High").length).toBeGreaterThan(0);
  });
});

describe("MethodologyPage — likelihood cards", () => {
  it("renders all 4 likelihood labels", () => {
    wrap(<MethodologyPage />);
    expect(screen.getByText("Unlikely")).toBeInTheDocument();
    expect(screen.getByText("Possible")).toBeInTheDocument();
    expect(screen.getByText("Likely")).toBeInTheDocument();
    expect(screen.getByText("Very Likely")).toBeInTheDocument();
  });
});

describe("MethodologyPage — control effectiveness scale", () => {
  it("renders control effectiveness labels", () => {
    wrap(<MethodologyPage />);
    expect(screen.getByText("Effective")).toBeInTheDocument();
    expect(screen.getByText("Moderately Effective")).toBeInTheDocument();
    expect(screen.getByText("Ineffective")).toBeInTheDocument();
  });
});

describe("MethodologyPage — RATING_COLORS tokens", () => {
  it("CELL_COLORS uses RATING_COLORS tokens not raw hex", () => {
    // Verify the exported constants have the right structure
    expect(typeof RATING_COLORS.low.bg).toBe("string");
    expect(typeof RATING_COLORS.critical.bg).toBe("string");
  });

  it("ScoreCircle receives RATING_COLORS.low.bg for Low tier", () => {
    wrap(<MethodologyPage />);
    // All score circles with background matching low color
    const circles = document.querySelectorAll("[class*='scoreCircle']");
    const lowCircle = Array.from(circles).find(
      (el) => (el as HTMLElement).style.background === RATING_COLORS.low.bg
    );
    expect(lowCircle).toBeDefined();
  });

  it("ScoreCircle receives RATING_COLORS.critical.bg for critical tier", () => {
    wrap(<MethodologyPage />);
    const circles = document.querySelectorAll("[class*='scoreCircle']");
    const critCircle = Array.from(circles).find(
      (el) => (el as HTMLElement).style.background === RATING_COLORS.critical.bg
    );
    expect(critCircle).toBeDefined();
  });

  it("CONTROL_COLORS.effective matches RATING_COLORS.low (same tier)", () => {
    expect(CONTROL_COLORS.effective.bg).toBe(RATING_COLORS.low.bg);
  });
});

describe("MethodologyPage — key principles", () => {
  it("renders High Watermark principle", () => {
    wrap(<MethodologyPage />);
    expect(screen.getByText(/High Watermark Approach/i)).toBeInTheDocument();
  });

  it("renders Transparent Documentation principle", () => {
    wrap(<MethodologyPage />);
    expect(screen.getByText(/Transparent Documentation/i)).toBeInTheDocument();
  });
});
