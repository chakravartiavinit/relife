// Shared seed palette for the dither chart family. Mirrors the seeds in
// `dither-chart.tsx` so a series rendered through the composable engine reads
// with the exact same fill / line / star hues as the legacy sparkline.

export type Rgb = [number, number, number]

export type DitherColor =
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "orange"
  | "red"
  | "grey"
  // ReLife: category tokens from app/globals.css, converted from OKLCH at a lightness between the light and dark themes.
  | "health"
  | "mind"
  | "skills"
  | "wealth"
  | "relationships"
  | "pill"

export type Seed = { fill: Rgb; line: Rgb; star: Rgb }

// Each seed: the area-fill hue, the bright series line, and the star sparkle.
export const PALETTE: Record<DitherColor, Seed> = {
  green: { fill: [40, 210, 110], line: [150, 255, 180], star: [200, 255, 220] },
  blue: { fill: [53, 143, 243], line: [150, 200, 255], star: [205, 228, 255] },
  purple: {
    fill: [150, 110, 255],
    line: [200, 175, 255],
    star: [225, 210, 255],
  },
  pink: { fill: [240, 90, 190], line: [255, 170, 220], star: [255, 205, 235] },
  orange: {
    fill: [255, 150, 50],
    line: [255, 195, 130],
    star: [255, 220, 175],
  },
  red: { fill: [240, 70, 70], line: [255, 150, 140], star: [255, 195, 185] },
  // No-data: a muted grey so empty metrics read as "nothing here".
  grey: { fill: [92, 92, 100], line: [140, 140, 150], star: [165, 165, 175] },
  health: { fill: [208, 83, 134], line: [208, 83, 134], star: [208, 83, 134] },
  mind: { fill: [130, 106, 208], line: [130, 106, 208], star: [130, 106, 208] },
  skills: { fill: [52, 131, 193], line: [52, 131, 193], star: [52, 131, 193] },
  wealth: { fill: [172, 122, 36], line: [172, 122, 36], star: [172, 122, 36] },
  relationships: { fill: [0, 149, 131], line: [0, 149, 131], star: [0, 149, 131] },
  pill: { fill: [62, 140, 201], line: [62, 140, 201], star: [62, 140, 201] },
}

export const rgb = ([r, g, b]: Rgb, k = 1, a = 1) =>
  `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`

export const seedOfColor = (color: DitherColor): Seed => PALETTE[color]

export const isDitherColor = (value: unknown): value is DitherColor =>
  typeof value === "string" && value in PALETTE
