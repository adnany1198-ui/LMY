import { useCallback, useMemo, useState } from "react";
import { WTP } from "./data/tuning";
import type { RatioDef } from "./data/tuning";
import { buildLatticePoint } from "./lib/theory";
import type { LatticePoint } from "./lib/theory";
import { StoreCtx, ratioKey } from "./state/store";
import type { AppStore, SequenceItem } from "./state/store";
import { sequenceBus } from "./lib/midi";
import { Lattice } from "./components/Lattice";
import { InfoPanel } from "./components/InfoPanel";
import { MovementGuide } from "./components/MovementGuide";
import { SequenceBuilder } from "./components/SequenceBuilder";
import { GroupPanel } from "./components/GroupPanel";
import { RootControl } from "./components/RootControl";

export function App() {
  const system = WTP;
  const points: LatticePoint[] = useMemo(
    () => system.ratios.map((r) => buildLatticePoint(r, system.axes)),
    [system]
  );

  const [rootHz, setRootHz] = useState(system.defaultRootHz);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [sequence, setSequence] = useState<SequenceItem[]>([]);
  const [defaultGroupOctaves, setDefaultGroupOctaves] = useState<[number, number, number]>([2, 3, 4]);

  const appendToSequence = useCallback(
    (point: LatticePoint, ratio: RatioDef) => {
      setSequence((s) => {
        const item: SequenceItem = { ratio, point, groupOctaves: [...defaultGroupOctaves] };
        const next = [...s, item];
        sequenceBus.emit({
          type: "append",
          step: { ratio: { num: ratio.num, den: ratio.den }, rootHz }
        });
        return next;
      });
    },
    [defaultGroupOctaves, rootHz]
  );

  const removeFromSequence = useCallback((index: number) => {
    setSequence((s) => s.filter((_, i) => i !== index));
  }, []);

  const moveSequenceItem = useCallback((from: number, to: number) => {
    setSequence((s) => {
      const next = [...s];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const updateGroupOctave = useCallback((index: number, group: 0 | 1 | 2, octave: number) => {
    setSequence((s) =>
      s.map((item, i) => {
        if (i !== index) return item;
        const groupOctaves: [number, number, number] = [...item.groupOctaves];
        groupOctaves[group] = octave;
        return { ...item, groupOctaves };
      })
    );
  }, []);

  const setDefaultGroupOctave = useCallback((group: 0 | 1 | 2, octave: number) => {
    setDefaultGroupOctaves((prev) => {
      const next: [number, number, number] = [...prev];
      next[group] = octave;
      return next;
    });
  }, []);

  const clearSequence = useCallback(() => {
    setSequence([]);
    sequenceBus.emit({ type: "clear" });
  }, []);

  const selectRatio = useCallback((key: string | null) => {
    setSelectedKey(key);
    if (key) {
      const idx = system.ratios.findIndex((r) => ratioKey(r) === key);
      if (idx >= 0) {
        sequenceBus.emit({
          type: "select",
          step: { ratio: { num: system.ratios[idx].num, den: system.ratios[idx].den }, rootHz },
          index: idx
        });
      }
    }
  }, [rootHz, system]);

  const hoverRatio = useCallback((key: string | null) => setHoverKey(key), []);

  const store: AppStore = {
    system,
    points,
    rootHz,
    selectedKey,
    hoverKey,
    sequence,
    defaultGroupOctaves,
    setRootHz,
    selectRatio,
    hoverRatio,
    appendToSequence,
    removeFromSequence,
    moveSequenceItem,
    updateGroupOctave,
    setDefaultGroupOctave,
    clearSequence
  };

  return (
    <StoreCtx.Provider value={store}>
      <div className="app-shell">
        <header className="app-header">
          <div className="title">
            <h1>LMY Lattice</h1>
            <span className="sub">{system.title}</span>
          </div>
          <RootControl />
        </header>

        <main className="app-body">
          <section className="lattice-area">
            <Lattice ratios={system.ratios} />
          </section>

          <div className="side-col">
            <InfoPanel />
            <MovementGuide />
          </div>
        </main>

        <footer className="app-footer">
          <SequenceBuilder />
          <GroupPanel />
        </footer>
      </div>
    </StoreCtx.Provider>
  );
}
