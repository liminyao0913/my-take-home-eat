import { defineConfig, devices } from "@playwright/test";
import { chmodSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const configured = process.env.HOSTED_BASE_URL;
if (!configured) throw new Error("Set HOSTED_BASE_URL to the deployed HTTPS service; this suite never starts a local server.");
const url = new URL(configured);
if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("HOSTED_BASE_URL must be an HTTPS origin.");
const artifacts = resolve(process.env.HOSTED_ARTIFACT_DIR || `.data/hosted/${new Date().toISOString().replaceAll(":", "-")}`);
mkdirSync(artifacts, { recursive: true, mode: 0o700 }); chmodSync(artifacts, 0o700);
process.env.HOSTED_ARTIFACT_DIR = artifacts;

export default defineConfig({
  testDir: "tests/hosted", fullyParallel: false, workers: 1, retries: 0,
  timeout: 90_000, expect: { timeout: 20_000 },
  outputDir: `${artifacts}/results`,
  reporter: [["list"], ["html", { outputFolder: `${artifacts}/report`, open: "never" }]],
  use: { baseURL: url.origin, timezoneId: "UTC", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "hosted-chromium", use: { ...devices["Desktop Chrome"] } }],
});
