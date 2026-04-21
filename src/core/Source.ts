export type Waveform = "sine" | "impulse" | "noise";

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

let _sourceCounter = 0;
export function newSourceId(): string {
  _sourceCounter += 1;
  return `src-${Date.now().toString(36)}-${_sourceCounter}`;
}
