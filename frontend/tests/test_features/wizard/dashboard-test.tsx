import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createRoute: vi.fn(() => ({})),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockResolvedValue(null),
  signOut: vi.fn(),
}));

describe("Dashboard wizard module", () => {
  it("wizard module loads without error", async () => {
    const mod = await import("@/features/wizard/WizardLayout");
    expect(mod).toBeDefined();
    expect(typeof mod.WizardLayout).toBe("function");
  });
});
