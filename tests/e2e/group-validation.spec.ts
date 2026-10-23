import { test } from "@playwright/test";
import { verifyGroupFlow } from "../browser/group-flow";
import { verifyInvitations } from "../browser/invitations-flow";

test("P1: three isolated browsers contribute, handle late arrival, race close against vote, and retain private inputs", async ({ browser }, testInfo) => {
  const evidence = await verifyGroupFlow(browser, "http://localhost:3100", (page, name) => page.screenshot({ path: testInfo.outputPath(name), fullPage: true }));
  await testInfo.attach("p1-validation", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
});

test("P1 invitations: optional headcount and explicit organizer override", async ({ browser }, testInfo) => {
  const evidence = await verifyInvitations(browser, "http://localhost:3100", (page, name) => page.screenshot({ path: testInfo.outputPath(name), fullPage: true }));
  await testInfo.attach("p1-invitations", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
});
