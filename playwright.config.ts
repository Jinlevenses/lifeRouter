import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (docs/12_quality): runs the real app against a throwaway PostgreSQL database.
 * E2E_DATABASE_URL must point at a database that may be wiped (default: local liferoute_e2e).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://liferoute:liferoute@127.0.0.1:5432/liferoute_e2e";
export const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    storageState: "./e2e/.auth/owner.json",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    {
      name: "iphone",
      use: { ...devices["iPhone 14"], browserName: "chromium" },
      testMatch: /layout\.spec\.ts/,
    },
  ],
  webServer: {
    command: `pnpm --filter @liferoute/web exec next dev --port ${PORT}`,
    url: `${BASE_URL}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-use-000000",
      LIFEROUTE_DATA_DIR: process.env.E2E_DATA_DIR ?? "/tmp/liferoute-e2e-data",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      ANTHROPIC_API_KEY: "",
    },
  },
});
