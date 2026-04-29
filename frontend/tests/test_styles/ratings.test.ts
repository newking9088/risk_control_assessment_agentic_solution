import { RATING_COLORS, CONTROL_COLORS } from "@/lib/ratingTokens";

describe("RATING_COLORS — 5-tier FRA ladder", () => {
  it("very low tier is correct", () => {
    expect(RATING_COLORS.veryLow.bg).toBe("#3D8B37");
    expect(RATING_COLORS.veryLow.fg).toBe("#FFFFFF");
  });

  it("low tier is correct", () => {
    expect(RATING_COLORS.low.bg).toBe("#7BB972");
    expect(RATING_COLORS.low.fg).toBe("#000000");
  });

  it("medium tier is correct", () => {
    expect(RATING_COLORS.medium.bg).toBe("#F3CC65");
    expect(RATING_COLORS.medium.fg).toBe("#000000");
  });

  it("high tier is correct", () => {
    expect(RATING_COLORS.high.bg).toBe("#E58231");
    expect(RATING_COLORS.high.fg).toBe("#000000");
  });

  it("critical/very-high tier is correct", () => {
    expect(RATING_COLORS.critical.bg).toBe("#B63831");
    expect(RATING_COLORS.critical.fg).toBe("#FFFFFF");
  });

  it("completed status colour is correct", () => {
    expect(RATING_COLORS.completed.bg).toBe("#415385");
    expect(RATING_COLORS.completed.fg).toBe("#FFFFFF");
  });

  it("not-rated colour is correct", () => {
    expect(RATING_COLORS.nri.bg).toBe("#F3F3F3");
    expect(RATING_COLORS.nri.fg).toBe("#474747");
  });

  it("critical and very-low both have white foreground (accessible on dark bg)", () => {
    expect(RATING_COLORS.critical.fg).toBe("#FFFFFF");
    expect(RATING_COLORS.veryLow.fg).toBe("#FFFFFF");
  });

  it("all tiers have distinct backgrounds", () => {
    const bgs = [
      RATING_COLORS.veryLow.bg,
      RATING_COLORS.low.bg,
      RATING_COLORS.medium.bg,
      RATING_COLORS.high.bg,
      RATING_COLORS.critical.bg,
    ];
    expect(new Set(bgs).size).toBe(5);
  });
});

describe("CONTROL_COLORS — 3-tier control ladder", () => {
  it("effective tier is correct", () => {
    expect(CONTROL_COLORS.effective.bg).toBe("#7BB972");
    expect(CONTROL_COLORS.effective.fg).toBe("#000000");
  });

  it("partial tier is correct", () => {
    expect(CONTROL_COLORS.partial.bg).toBe("#F3CC65");
    expect(CONTROL_COLORS.partial.fg).toBe("#000000");
  });

  it("weak / not-effective tier is correct", () => {
    expect(CONTROL_COLORS.weak.bg).toBe("#B63831");
    expect(CONTROL_COLORS.weak.fg).toBe("#FFFFFF");
  });

  it("effective and weak tiers differ", () => {
    expect(CONTROL_COLORS.effective.bg).not.toBe(CONTROL_COLORS.weak.bg);
  });

  it("effective bg matches FRA low (single source of truth)", () => {
    expect(CONTROL_COLORS.effective.bg).toBe(RATING_COLORS.low.bg);
  });

  it("weak bg matches FRA critical (single source of truth)", () => {
    expect(CONTROL_COLORS.weak.bg).toBe(RATING_COLORS.critical.bg);
  });
});
