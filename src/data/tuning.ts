// Tuning data for La Monte Young's Well-Tuned Piano.
// Prime factors restricted to {2, 3, 7}. All ratios stored as
// (numerator, denominator) integer pairs to avoid floating drift.
//
// To swap in another tuning system later: provide a new `TuningSystem`
// that matches the interface below and plug it into the store.

export interface RatioDef {
  num: number;
  den: number;
  name?: string;
  character: string;
}

export interface TuningSystem {
  id: string;
  title: string;
  primes: number[];
  axes: { x: number; y: number };
  defaultRootHz: number;
  defaultRootName: string;
  ratios: RatioDef[];
}

export const WTP: TuningSystem = {
  id: "wtp",
  title: "Well-Tuned Piano (La Monte Young)",
  primes: [2, 3, 7],
  axes: { x: 3, y: 7 },
  defaultRootHz: 311.13,
  defaultRootName: "Eb3",
  ratios: [
    { num: 1, den: 1, name: "unison", character: "complete stillness, unison" },
    { num: 567, den: 512, name: "high-lattice", character: "distant, high-lattice" },
    { num: 9, den: 8, name: "whole tone", character: "bright, tense whole tone" },
    { num: 147, den: 128, character: "complex, dense, microtonal cluster" },
    { num: 1323, den: 1024, character: "maximally remote in this system" },
    { num: 21, den: 16, name: "narrow fourth", character: "tense, wants to move, narrow fourth" },
    { num: 189, den: 128, character: "between fifth and fourth, ambiguous" },
    { num: 3, den: 2, name: "perfect fifth", character: "open, stable, spacious" },
    { num: 49, den: 32, name: "double septimal", character: "remote, floating, double-septimal" },
    { num: 441, den: 256, character: "remote warmth, deep lattice" },
    { num: 7, den: 4, name: "septimal seventh", character: "warm, gravitational, deep" },
    { num: 63, den: 32, character: "almost-octave, luminous tension" }
  ]
};
