// Pure music-theory math. No React, no DOM, no side effects.
// All calculations are exact integer-ratio where possible; floating-point
// is only used for cents / Hz / beat readouts.

import type { RatioDef } from "../data/tuning";

export interface Ratio {
  num: number;
  den: number;
}

export interface LatticePoint extends Ratio {
  x: number; // powers of 3 (after octave reduction)
  y: number; // powers of 7 (after octave reduction)
  cents: number;
  value: number; // decimal form (already octave-reduced: 1 <= value < 2)
}

// ---- integer helpers ----------------------------------------------------

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function simplify(r: Ratio): Ratio {
  const g = gcd(r.num, r.den);
  return { num: r.num / g, den: r.den / g };
}

function countPrime(n: number, p: number): { count: number; rest: number } {
  let count = 0;
  while (n % p === 0) {
    n /= p;
    count++;
  }
  return { count, rest: n };
}

// ---- octave reduction ---------------------------------------------------

// Reduce a ratio into [1, 2) by multiplying/dividing by 2.
export function octaveReduce(r: Ratio): Ratio {
  let { num, den } = simplify(r);
  while (num * 1.0 >= 2 * den) den *= 2;
  while (num * 1.0 < den) num *= 2;
  return simplify({ num, den });
}

// ---- conversions --------------------------------------------------------

export function ratioValue(r: Ratio): number {
  return r.num / r.den;
}

export function ratioToCents(r: Ratio): number {
  return 1200 * Math.log2(ratioValue(r));
}

export function ratioToHz(r: Ratio, rootHz: number): number {
  return rootHz * ratioValue(r);
}

// ---- lattice coordinates (WTP: axes = 3 and 7) --------------------------

export function latticeCoords(r: Ratio, xPrime = 3, yPrime = 7): { x: number; y: number } {
  // Strip all 2s from num and den (octave equivalence).
  let { num, den } = simplify(r);
  while (num % 2 === 0) num /= 2;
  while (den % 2 === 0) den /= 2;

  const nx = countPrime(num, xPrime);
  const dx = countPrime(den, xPrime);
  const ny = countPrime(nx.rest, yPrime);
  const dy = countPrime(dx.rest, yPrime);

  return { x: nx.count - dx.count, y: ny.count - dy.count };
}

export function buildLatticePoint(def: RatioDef, axes: { x: number; y: number }): LatticePoint {
  const reduced = octaveReduce({ num: def.num, den: def.den });
  const coords = latticeCoords(reduced, axes.x, axes.y);
  return {
    num: def.num,
    den: def.den,
    value: ratioValue(reduced),
    cents: ratioToCents(reduced),
    x: coords.x,
    y: coords.y
  };
}

// ---- interval between two ratios ---------------------------------------

export function intervalBetween(a: Ratio, b: Ratio): Ratio {
  // b / a, then octave-reduce
  const raw = simplify({ num: b.num * a.den, den: b.den * a.num });
  return octaveReduce(raw);
}

export function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// ---- formatting --------------------------------------------------------

export function formatRatio(r: Ratio): string {
  return `${r.num}:${r.den}`;
}

export function formatCents(cents: number, digits = 1): string {
  const sign = cents >= 0 ? "+" : "";
  return `${sign}${cents.toFixed(digits)}¢`;
}

export function primeFactorisation(n: number): string {
  if (n === 1) return "1";
  const parts: string[] = [];
  for (const p of [2, 3, 5, 7, 11, 13]) {
    const { count, rest } = countPrime(n, p);
    if (count > 0) parts.push(count === 1 ? `${p}` : `${p}^${count}`);
    n = rest;
  }
  if (n > 1) parts.push(`${n}`);
  return parts.join(" · ");
}

export function formatFactoredRatio(r: Ratio): string {
  return `${primeFactorisation(r.num)}  /  ${primeFactorisation(r.den)}`;
}

// ---- 12-TET reference --------------------------------------------------

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

// Returns nearest equal-tempered note + cent deviation from that note.
export function nearest12TET(hz: number): { name: string; octave: number; deviation: number } {
  // MIDI 69 = A4 = 440 Hz
  const midiFloat = 69 + 12 * Math.log2(hz / 440);
  const midi = Math.round(midiFloat);
  const deviation = (midiFloat - midi) * 100;
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { name, octave, deviation };
}

// ---- overtone overlap --------------------------------------------------

// For two ratios p/q and r/s over a common fundamental:
// harmonic k of ratio p/q coincides with harmonic m of ratio r/s
// when k * (p/q) == m * (r/s), i.e. the nth harmonic of the root
// where n = lcm(k*p/q-denominator, ...). Simpler: express both as
// rationals over root and list shared harmonics up to a limit.
export interface Coincidence {
  rootHarmonic: number; // which harmonic of the root
  kA: number; // harmonic index of tone A
  kB: number; // harmonic index of tone B
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

export function overtoneCoincidences(a: Ratio, b: Ratio, limit = 16): Coincidence[] {
  // Express each tone as rational frequency = root * (p/q).
  // Harmonic k of tone is root * k * p / q. Shared root-harmonic n
  // satisfies n = k * p / q = j * r / s. Solve over small integers.
  const A = simplify(a);
  const B = simplify(b);
  const out: Coincidence[] = [];
  const denomCommon = lcm(A.den, B.den);
  for (let n = 1; n <= limit; n++) {
    // n is a candidate harmonic index of the fundamental (root).
    // kA = n * A.den / A.num, must be positive integer.
    const kA = (n * A.den) / A.num;
    const kB = (n * B.den) / B.num;
    if (Number.isInteger(kA) && Number.isInteger(kB) && kA > 0 && kB > 0) {
      out.push({ rootHarmonic: n, kA, kB });
      if (out.length >= 4) break;
    }
  }
  void denomCommon;
  return out;
}

// Beat frequency between a harmonic of tone A and a harmonic of tone B
// when neither exactly coincides — approximate first near-miss.
export function beatFrequency(aHz: number, bHz: number): number {
  return Math.abs(aHz - bHz);
}

// Beating between first few matching harmonics of two pitches.
// Returns the strongest (lowest-order) non-zero beat rate found
// between harmonics within `limit`.
export function dominantBeat(aHz: number, bHz: number, limit = 8): { kA: number; kB: number; hz: number } | null {
  let best: { kA: number; kB: number; hz: number } | null = null;
  for (let k = 1; k <= limit; k++) {
    for (let j = 1; j <= limit; j++) {
      const diff = Math.abs(k * aHz - j * bHz);
      if (diff < 1e-6) continue;
      if (diff > 40) continue; // only audible as beating, not as a separate pitch
      if (!best || k + j < best.kA + best.kB) best = { kA: k, kB: j, hz: diff };
    }
  }
  return best;
}

// ---- movement description ----------------------------------------------

export function describeMovement(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return "return to the same node";
  if (dy === 0) {
    return dx > 0
      ? `+${dx} on the 3-axis (up a fifth${dx > 1 ? `, ${dx}×` : ""})`
      : `${dx} on the 3-axis (down a fifth${dx < -1 ? `, ${-dx}×` : ""})`;
  }
  if (dx === 0) {
    return dy > 0
      ? `+${dy} on the 7-axis (up a septimal seventh${dy > 1 ? `, ${dy}×` : ""})`
      : `${dy} on the 7-axis (down a septimal seventh${dy < -1 ? `, ${-dy}×` : ""})`;
  }
  const xs = dx > 0 ? `+${dx}` : `${dx}`;
  const ys = dy > 0 ? `+${dy}` : `${dy}`;
  return `${xs} on the 3-axis, ${ys} on the 7-axis (diagonal)`;
}

export function movementCharacter(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return "no movement — the tone is held";
  if (dx !== 0 && dy === 0)
    return "modulation by fifths — the most traditional harmonic movement, creates a sense of key change";
  if (dx === 0 && dy !== 0)
    return "septimal shift — changes colour and warmth without disturbing the fifth relationship";
  return "compound shift — both the fifth-structure and the septimal colour change at once";
}
