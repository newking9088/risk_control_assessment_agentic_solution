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

describe.skip("Dashboard — wizard integration (placeholder)", () => {
  it("placeholder: renders wizard stepper", () => {
    expect(true).toBe(true);
  });
});
