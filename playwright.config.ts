import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const filename = process.env.LETS_EAT_E2E_DB ?? join(mkdtempSync(join(tmpdir(), "lets-eat-e2e-")), "test.sqlite");
process.env.LETS_EAT_E2E_DB = filename;

export default defineConfig({
  testDir: "tests/e2e", fullyParallel: false, workers: 1, retries: 0,
  timeout: 45_000, expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure", timezoneId: "UTC" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run db:migrate && npm run start -- --port 3100",
    url: "http://localhost:3100/api/health", reuseExistingServer: false, timeout: 60_000,
    env: { DATABASE_PATH: filename, APP_ORIGIN: "http://localhost:3100" },
  },
});
