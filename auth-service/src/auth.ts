import { betterAuth } from "better-auth";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Better Auth queries the 'auth' schema; pg defaults to 'public'.
pool.on("connect", (client) => {
  client.query("SET search_path TO auth, public").catch(() => {});
});

export const auth = betterAuth({
  database: pool, // pass Pool directly — NOT { type, pool, schema }
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: (process.env.TRUSTED_ORIGINS || "")
    .split(",")
    .filter(Boolean),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 },
  },
  advanced: {
    cookiePrefix: "rca",
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    },
  },
  user: {
    additionalFields: {
      role:     { type: "string", defaultValue: "analyst", required: false },
      tenantId: { type: "string", required: false },
    },
  },
});
