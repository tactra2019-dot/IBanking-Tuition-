import { expect, test } from "vitest";
import { secondsRemaining, money } from "./format";
test("countdown uses absolute backend expiry across delayed renders and expires at zero", () => {
  expect(
    secondsRemaining(
      "2026-01-01T00:05:00Z",
      Date.parse("2026-01-01T00:00:00Z"),
    ),
  ).toBe(300);
  expect(
    secondsRemaining(
      "2026-01-01T00:05:00Z",
      Date.parse("2026-01-01T00:03:30Z"),
    ),
  ).toBe(90);
  expect(
    secondsRemaining(
      "2026-01-01T00:05:00Z",
      Date.parse("2026-01-01T00:06:00Z"),
    ),
  ).toBe(0);
  expect(secondsRemaining()).toBe(0);
});
test("VND amount retains full tuition precision", () => {
  expect(money(7500000)).toContain("7.500.000");
});
