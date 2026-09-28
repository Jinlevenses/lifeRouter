import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, type Db } from "./db/client";
import * as authSchema from "./db/auth-schema";

/**
 * Single-owner authentication (docs/13_security, ADR-001).
 * - Email/password only, public sign-up disabled; `pnpm owner:create` provisions the one owner.
 * - Session cookies are httpOnly/SameSite=Lax; Better Auth rejects cross-origin requests
 *   whose Origin is not trusted (CSRF), and rate-limits sign-in attempts in the database.
 */
export function trustedOrigins(): string[] {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const extra = (process.env.LIFEROUTE_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([new URL(base).origin, ...extra])];
}

export function createAuth(db: Db) {
  return betterAuth({
    appName: "LifeRoute",
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: (process.env.BETTER_AUTH_URL ?? "").startsWith("https://"),
      cookiePrefix: "liferoute",
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;

const authKey = Symbol.for("liferoute.auth");
type GlobalWithAuth = typeof globalThis & { [authKey]?: Auth };

export function getAuth(): Auth {
  const g = globalThis as GlobalWithAuth;
  if (!g[authKey]) g[authKey] = createAuth(getDb());
  return g[authKey];
}

export class OwnerExistsError extends Error {
  constructor() {
    super("An owner account already exists. LifeRoute supports exactly one owner.");
    this.name = "OwnerExistsError";
  }
}

/** Creates the single owner. Refuses when any user exists (no second account, ever). */
export async function createOwner(
  auth: Auth,
  db: Db,
  input: { email: string; name: string; password: string },
): Promise<{ id: string; email: string }> {
  const existing = await db.select({ id: authSchema.user.id }).from(authSchema.user).limit(1);
  if (existing.length > 0) throw new OwnerExistsError();
  if (input.password.length < 12) throw new Error("Password must be at least 12 characters.");
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(input.password);
  const created = await ctx.internalAdapter.createUser(
    { email: input.email.trim().toLowerCase(), name: input.name.trim(), emailVerified: true },
    { method: "email-password" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: hash,
  });
  return { id: created.id, email: created.email };
}

/** Resolves the owner session from request headers; null when signed out. */
export async function getOwnerSession(headers: Headers) {
  const result = await getAuth().api.getSession({ headers });
  return result ? { userId: result.user.id, email: result.user.email, name: result.user.name } : null;
}
