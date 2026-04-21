export type Waveform = "sine" | "impulse" | "noise";

/** RGB in 0..1, the colour channel the source paints into the composite render. */
export type SourceColor = [number, number, number];

export interface Source {
  id: string;
  /** position in metres from site origin */
  xMeters: number;
  yMeters: number;
  /** signal frequency in Hz (sine & impulse centre freq) */
  frequencyHz: number;
  /** amplitude (dimensionless, 0–1 typical) */
  amplitude: number;
  /** phase offset in radians */
  phaseRad: number;
  waveform: Waveform;
  /** spatial radius in metres — how wide the injection Gaussian is */
  radiusMeters: number;
  enabled: boolean;
  /** unique RGB hue assigned at creation; drives the per-source pressure colour */
  color: SourceColor;
}

export function waveformId(w: Waveform): number {
  switch (w) {
    case "sine":
      return 0;
    case "impulse":
      return 1;
    case "noise":
      return 2;
  }
}

/**
 * Saturated, roughly equiluminant palette. Picked so that overlaps between
 * any two channels produce a clearly readable third colour — e.g. red + cyan
 * → white, gold + violet → pink, lime + magenta → pale orange — so the user
 * can read interference patterns visually.
 */
export const SOURCE_PALETTE: SourceColor[] = [
  [1.0, 0.18, 0.28], // red
  [0.18, 0.88, 1.0], // cyan
  [1.0, 0.25, 0.9], // magenta
  [1.0, 0.8, 0.22], // gold
  [0.45, 1.0, 0.35], // lime
  [1.0, 0.55, 0.18], // orange
  [0.7, 0.4, 1.0], // violet
  [0.2, 1.0, 0.75], // teal
];

/** Pick a palette colour based on the source's index in the list. Wraps around. */
export function sourceColorFor(index: number): SourceColor {
  return SOURCE_PALETTE[((index % SOURCE_PALETTE.length) + SOURCE_PALETTE.length) % SOURCE_PALETTE.length];
}

/** RGB 0..1 → #rrggbb, for CSS / SVG consumption. */
export function colorToCss(c: SourceColor): string {
  const hx = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hx(c[0])}${hx(c[1])}${hx(c[2])}`;
}

let _sourceCounter = 0;
export function newSourceId(): string {
  _sourceCounter += 1;
  return `src-${Date.now().toString(36)}-${_sourceCounter}`;
}
