import { expect, test } from "@playwright/test";

test("passes normally", () => {
  expect(2 + 2).toBe(4);
});

test("recovers after a retry", () => {
  expect(test.info().retry).toBeGreaterThan(0);
});

test("can be skipped", () => {
  test.skip();
});

test("expected failure is reported", () => {
  test.fail();
  expect(2 + 2).toBe(5);
});
