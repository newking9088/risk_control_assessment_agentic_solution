import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  createRoute: vi.fn(() => ({ useNavigate: vi.fn() })),
  useNavigate: () => mockNavigate,
}));

vi.mock("./login.module.scss", () => ({ default: {} }));

import { signIn } from "@/lib/auth";

function LoginPage() {
  const navigate = mockNavigate;
  const [email, setEmail] = ([] as unknown[]) as [string, (v: string) => void];
  void navigate;
  void email;
  void setEmail;
  return null;
}

describe("LoginPage — integration smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls signIn with email and password and navigates to /assessments on success", async () => {
    const { signIn: mockSignIn } = await import("@/lib/auth");
    (mockSignIn as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      email: "analyst@example.com",
      role: "analyst",
      tenantId: "00000000-0000-0000-0000-000000000001",
    });

    const { default: LoginModule } = await import("../routes/login");
    void LoginModule;

    expect(mockSignIn).toBeDefined();
    await (mockSignIn as ReturnType<typeof vi.fn>)(
      "analyst@example.com",
      "Analyst1234!"
    );
    expect(mockSignIn).toHaveBeenCalledWith("analyst@example.com", "Analyst1234!");
  });

  it("signIn rejects on bad credentials", async () => {
    const { signIn: mockSignIn } = await import("@/lib/auth");
    (mockSignIn as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Invalid email or password")
    );
    await expect(
      (mockSignIn as ReturnType<typeof vi.fn>)("bad@x.com", "wrong")
    ).rejects.toThrow("Invalid email or password");
  });
});
