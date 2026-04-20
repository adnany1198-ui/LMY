import { useStore } from "../state/store";
import { nearest12TET } from "../lib/theory";

export function RootControl() {
  const { rootHz, setRootHz, system } = useStore();
  const tet = nearest12TET(rootHz);

  return (
    <section className="panel root-control">
      <header className="panel-head">
        <h2>Root</h2>
      </header>
      <div className="root-row">
        <label>
          <span>Hz</span>
          <input
            type="number"
            step={0.01}
            min={20}
            max={2000}
            value={rootHz}
            onChange={(e) => setRootHz(parseFloat(e.target.value) || system.defaultRootHz)}
          />
        </label>
        <div className="root-meta">
          nearest: {tet.name}
          {tet.octave} ({tet.deviation >= 0 ? "+" : ""}
          {tet.deviation.toFixed(1)}¢)
        </div>
        <button
          type="button"
          className="reset"
          onClick={() => setRootHz(system.defaultRootHz)}
          title={`Reset to ${system.defaultRootName}`}
        >
          reset → {system.defaultRootName}
        </button>
      </div>
    </section>
  );
}
