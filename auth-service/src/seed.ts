import { auth } from "./auth.js";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

const SEED_USERS = [
  { email: "admin@example.com", password: "Admin1234!", role: "admin" },
  { email: "manager@example.com", password: "Manager1234!", role: "manager" },
  { email: "analyst@example.com", password: "Analyst1234!", role: "analyst" },
];

for (const u of SEED_USERS) {
  try {
    await auth.api.signUpEmail({
      body: {
        email: u.email,
        password: u.password,
        name: u.email.split("@")[0],
        role: u.role,
        tenantId: DEFAULT_TENANT_ID,
      },
    });
    console.log(`Created ${u.email}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`Skipped ${u.email}: ${msg}`);
  }
}
