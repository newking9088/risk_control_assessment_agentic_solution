const AUTH_BASE = "/api/auth";

export interface Session {
  id: string;
  userId: string;
  email: string;
  role: string;
  tenantId: string;
}

export async function getSession(): Promise<Session | null> {
  try {
    const res = await fetch(`${AUTH_BASE}/get-session`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.user) return null;
    return {
      id: data.session.id,
      userId: data.user.id,
      email: data.user.email,
      role: data.user.role,
      tenantId: data.user.tenantId,
    };
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string): Promise<Session> {
  const res = await fetch(`${AUTH_BASE}/sign-in/email`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? "Sign-in failed");
  }
  const data = await res.json();
  return {
    id: data.session.id,
    userId: data.user.id,
    email: data.user.email,
    role: data.user.role,
    tenantId: data.user.tenantId,
  };
}

export async function signOut(): Promise<void> {
  await fetch(`${AUTH_BASE}/sign-out`, { method: "POST", credentials: "include" });
}
