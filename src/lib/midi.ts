// Stub MIDI layer. Phase 2 will implement this against a virtual
// MIDI bus (IAC on macOS) so that movements on the lattice send
// note + pitch-bend to Ableton Live.
//
// The SequenceBuilder already dispatches events matching this shape;
// implementing the interface is all that Phase 2 needs to do.

import type { Ratio } from "./theory";

export interface MIDIOutput {
  sendNote(midiNote: number, velocity: number, durationMs: number): void;
  sendPitchBend(value: number): void;
}

export interface SequenceStep {
  ratio: Ratio;
  rootHz: number;
  groups?: { group: number; octave: number }[];
}

export type SequenceEvent =
  | { type: "select"; step: SequenceStep; index: number }
  | { type: "append"; step: SequenceStep }
  | { type: "clear" };

type Listener = (e: SequenceEvent) => void;

class Bus {
  private listeners = new Set<Listener>();
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: SequenceEvent): void {
    this.listeners.forEach((fn) => fn(e));
  }
}

export const sequenceBus = new Bus();

// Placeholder — returns null until Phase 2 wires a real output.
export function getMIDIOutput(): MIDIOutput | null {
  return null;
}
