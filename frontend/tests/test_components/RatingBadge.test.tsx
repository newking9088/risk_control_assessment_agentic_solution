import { render, screen } from "@testing-library/react";
import { RatingBadge } from "@/components/RatingBadge";

describe("RatingBadge — type=risk", () => {
  it.each([
    ["very high",  "veryHigh"],
    ["very_high",  "veryHigh"],
    ["critical",   "critical"],
    ["high",       "high"],
    ["moderate",   "moderate"],
    ["medium",     "moderate"],
    ["low",        "low"],
    ["very low",   "veryLow"],
    ["very_low",   "veryLow"],
    ["not rated",  "notRated"],
    ["nr",         "notRated"],
  ])('"%s" maps to class %s', (value, expectedClass) => {
    const { container } = render(<RatingBadge value={value} type="risk" />);
    expect(container.firstChild).toHaveClass(expectedClass);
  });
});

describe("RatingBadge — type=control", () => {
  it.each([
    ["satisfactory",          "satisfactory"],
    ["effective",             "effective"],
    ["Effective",             "effective"],
    ["Moderately Effective",  "moderatelyEffective"],
    ["moderatelyeffective",   "moderatelyEffective"],
    ["partial",               "moderatelyEffective"],
    ["partially",             "moderatelyEffective"],
    ["Partially Effective",   "moderatelyEffective"],
    ["needs improvement",     "moderatelyEffective"],
    ["needsimprovement",      "moderatelyEffective"],
    ["weak",                  "ineffective"],
    ["Weak",                  "ineffective"],
    ["ineffective",           "ineffective"],
    ["Ineffective",           "ineffective"],
    ["not tested",            "notRated"],
  ])('"%s" maps to class %s', (value, expectedClass) => {
    const { container } = render(<RatingBadge value={value} type="control" />);
    expect(container.firstChild).toHaveClass(expectedClass);
  });
});

describe("RatingBadge — type=status", () => {
  it.each([
    ["in_progress", "inProgress"],
    ["in progress", "inProgress"],
    ["complete",    "completed"],
    ["completed",   "completed"],
    ["draft",       "draft"],
    ["not started", "draft"],
    ["review",      "review"],
    ["archived",    "archived"],
  ])('"%s" maps to class %s', (value, expectedClass) => {
    const { container } = render(<RatingBadge value={value} type="status" />);
    expect(container.firstChild).toHaveClass(expectedClass);
  });
});

describe("RatingBadge — null / empty states", () => {
  it("renders — for null value", () => {
    render(<RatingBadge value={null} type="risk" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders — for undefined value", () => {
    render(<RatingBadge value={undefined} type="risk" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders — for empty string", () => {
    render(<RatingBadge value="" type="risk" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("null renders no badge element", () => {
    const { container } = render(<RatingBadge value={null} type="risk" />);
    expect(container.querySelector("[class*='badge']")).toBeNull();
  });
});

describe("RatingBadge — label override", () => {
  it("shows custom label instead of raw value", () => {
    render(<RatingBadge value="very_high" type="risk" label="Very High" />);
    expect(screen.getByText("Very High")).toBeInTheDocument();
  });

  it("shows status label override", () => {
    render(<RatingBadge value="in_progress" type="status" label="In Progress" />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });
});

describe("RatingBadge — badge base class always present", () => {
  it("always has badge class when value is truthy", () => {
    const { container } = render(<RatingBadge value="high" type="risk" />);
    expect(container.firstChild).toHaveClass("badge");
  });
});
