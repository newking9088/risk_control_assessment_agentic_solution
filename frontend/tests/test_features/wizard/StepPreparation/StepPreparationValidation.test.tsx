import { describe, it, expect } from "vitest";

describe.skip("StepPreparation — validation (placeholder)", () => {
  it("blocks next when required fields empty", () => {
    expect(true).toBe(true);
  });

  it("unblocks next when all required fields filled", () => {
    expect(true).toBe(true);
  });
});
