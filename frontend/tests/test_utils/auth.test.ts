import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
}));

import { signIn, signOut, getSession } from "@/lib/auth";

describe("auth utilities", () => {
  it("signIn resolves with a session on valid credentials", async () => {
    (signIn as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      email: "analyst@example.com",
      role: "analyst",
      tenantId: "t1",
    });
    const session = await signIn("analyst@example.com", "Password1!");
    expect(session).toMatchObject({ email: "analyst@example.com", role: "analyst" });
  });

  it("signIn rejects with an error on invalid credentials", async () => {
    (signIn as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Invalid email or password")
    );
    await expect(signIn("bad@example.com", "wrong")).rejects.toThrow(
      "Invalid email or password"
    );
  });

  it("getSession returns null when no active session", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const session = await getSession();
    expect(session).toBeNull();
  });

  it("signOut resolves without error", async () => {
    (signOut as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    await expect(signOut()).resolves.toBeUndefined();
  });
});
