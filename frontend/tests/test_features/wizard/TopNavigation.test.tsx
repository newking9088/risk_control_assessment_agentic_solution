import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

import { TopNav } from "@/features/wizard/TopNav";
import { getSession, signOut } from "@/lib/auth";

const mockNavigate = vi.fn();

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("TopNav — brand", () => {
  it("renders brand name", () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    wrap(<TopNav />);
    expect(screen.getByText("Risk & Control")).toBeInTheDocument();
  });

  it("renders RCA logo badge", () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    wrap(<TopNav />);
    expect(screen.getByText("RCA")).toBeInTheDocument();
  });
});

describe("TopNav — nav links", () => {
  beforeEach(() => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("renders Assessment Dashboard link", () => {
    wrap(<TopNav />);
    expect(screen.getByText(/Assessment Dashboard/i)).toBeInTheDocument();
  });

  it("renders Methodology link", () => {
    wrap(<TopNav />);
    expect(screen.getByText("Methodology")).toBeInTheDocument();
  });

  it("renders Create New Assessment button", () => {
    wrap(<TopNav />);
    expect(screen.getByText(/Create New Assessment/i)).toBeInTheDocument();
  });
});

describe("TopNav — user avatar", () => {
  it("shows initials from email", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1",
      userId: "u1",
      email: "analyst@example.com",
      role: "analyst",
      tenantId: "t1",
    });
    wrap(<TopNav />);
    expect(await screen.findByText("AN")).toBeInTheDocument();
  });

  it("shows ? when session is null", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    wrap(<TopNav />);
    expect(await screen.findByText("?")).toBeInTheDocument();
  });
});

describe("TopNav — user dropdown", () => {
  beforeEach(() => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1",
      userId: "u1",
      email: "analyst@example.com",
      role: "analyst",
      tenantId: "t1",
    });
    vi.clearAllMocks();
  });

  it("dropdown is hidden initially", async () => {
    wrap(<TopNav />);
    await screen.findByText("AN");
    expect(screen.queryByText("Logout")).toBeNull();
  });

  it("opens dropdown on avatar click", async () => {
    wrap(<TopNav />);
    const avatar = await screen.findByText("AN");
    fireEvent.click(avatar);
    expect(screen.getByText("Logout")).toBeInTheDocument();
    expect(screen.getByText("View Profile")).toBeInTheDocument();
    expect(screen.getByText("Edit Profile")).toBeInTheDocument();
  });

  it("shows email in dropdown header", async () => {
    wrap(<TopNav />);
    const avatar = await screen.findByText("AN");
    fireEvent.click(avatar);
    expect(screen.getByText("analyst@example.com")).toBeInTheDocument();
  });

  it("calls signOut and navigates to /login on logout", async () => {
    wrap(<TopNav />);
    const avatar = await screen.findByText("AN");
    fireEvent.click(avatar);
    fireEvent.click(screen.getByText("Logout"));
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
  });
});

describe("TopNav — onCreateNew prop", () => {
  it("calls onCreateNew when + Create New Assessment clicked", () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const onCreateNew = vi.fn();
    wrap(<TopNav onCreateNew={onCreateNew} />);
    fireEvent.click(screen.getByText(/Create New Assessment/i));
    expect(onCreateNew).toHaveBeenCalledOnce();
  });

  it("disables button when createPending is true", () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    wrap(<TopNav createPending />);
    const btn = screen.getByText(/Create New Assessment/i).closest("button");
    expect(btn).toBeDisabled();
  });
});
