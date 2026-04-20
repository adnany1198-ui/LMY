import { createContext, useContext } from "react";
import type { RatioDef, TuningSystem } from "../data/tuning";
import type { LatticePoint } from "../lib/theory";

export interface SequenceItem {
  ratio: RatioDef;
  point: LatticePoint;
  groupOctaves: [number, number, number];
}

export interface AppState {
  system: TuningSystem;
  points: LatticePoint[];
  rootHz: number;
  selectedKey: string | null;
  hoverKey: string | null;
  sequence: SequenceItem[];
  defaultGroupOctaves: [number, number, number];
}

export interface AppActions {
  setRootHz(hz: number): void;
  selectRatio(key: string | null): void;
  hoverRatio(key: string | null): void;
  appendToSequence(p: LatticePoint, ratio: RatioDef): void;
  removeFromSequence(index: number): void;
  moveSequenceItem(from: number, to: number): void;
  updateGroupOctave(index: number, group: 0 | 1 | 2, octave: number): void;
  setDefaultGroupOctave(group: 0 | 1 | 2, octave: number): void;
  clearSequence(): void;
}

export interface AppStore extends AppState, AppActions {}

export const ratioKey = (r: { num: number; den: number }): string => `${r.num}/${r.den}`;

export const StoreCtx = createContext<AppStore | null>(null);

export function useStore(): AppStore {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("StoreCtx missing");
  return s;
}
