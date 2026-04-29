/**
 * JS mirror of the CSS custom properties in ratings.css.
 * Used ONLY where CSS vars cannot be applied — Recharts strokes,
 * SVG fills, and inline style={{ background }} in methodology.
 * Nowhere else. Do not add hex values outside this file.
 */

export const RATING_COLORS = {
  low:       { bg: "#788972", fg: "#000000" },
  medium:    { bg: "#F3CC65", fg: "#000000" },
  high:      { bg: "#E58231", fg: "#000000" },
  critical:  { bg: "#063831", fg: "#FFFFFF" },
  completed: { bg: "#415389", fg: "#FFFFFF" },
  nri:       { bg: "#F3F3F3", fg: "#474747" },
} as const;

export const CONTROL_COLORS = {
  effective: { bg: "#788972", fg: "#000000" },
  partial:   { bg: "#F3CC65", fg: "#000000" },
  weak:      { bg: "#063831", fg: "#FFFFFF" },
} as const;
