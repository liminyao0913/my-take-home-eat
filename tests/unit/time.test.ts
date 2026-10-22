import { expect, it } from "vitest";
import { toInstant } from "@/lib/time";

it("converts using the room zone rather than the server zone", () => {
  expect(toInstant("2027-06-01", "12:30", "America/Los_Angeles")).toBe(Date.parse("2027-06-01T19:30:00Z"));
});
it.each([
  ["2027-02-30", "12:30", "UTC"], ["2027-06-01", "12:30", "No/Such_Zone"],
  ["2027-03-14", "02:30", "America/Los_Angeles"], ["2027-11-07", "01:30", "America/Los_Angeles"],
])("rejects invalid or ambiguous local time %s %s %s", (date, time, zone) => {
  expect(() => toInstant(date, time, zone)).toThrow();
});
