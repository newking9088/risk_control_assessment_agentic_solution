/**
 * JS mirror of the CSS custom properties in ratings.css.
 * Used ONLY where CSS vars cannot be applied — Recharts strokes,
 * SVG fills, and inline style={{ background }} in methodology.
 * Nowhere else. Do not add hex values outside this file.
 */

export const RATING_COLORS = {
  veryLow:   { bg: "#3D8B37", fg: "#FFFFFF" },
  low:       { bg: "#7BB972", fg: "#000000" },
  medium:    { bg: "#F3CC65", fg: "#000000" },
  high:      { bg: "#E58231", fg: "#000000" },
  critical:  { bg: "#B63831", fg: "#FFFFFF" },
  completed: { bg: "#415385", fg: "#FFFFFF" },
  nri:       { bg: "#F3F3F3", fg: "#474747" },
} as const;

export const CONTROL_COLORS = {
  effective:           { bg: "#7BB972", fg: "#000000" },
  moderatelyEffective: { bg: "#F3CC65", fg: "#000000" },
  ineffective:         { bg: "#B63831", fg: "#FFFFFF" },
} as const;
