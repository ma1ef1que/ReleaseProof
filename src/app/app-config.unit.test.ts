import { describe, expect, it } from "vitest";
import { appConfig } from "../config/app-config";

describe("app configuration", () => {
  it("defines the working product name", () => {
    expect(appConfig.productName).toBe("ReleaseProof");
  });
});
