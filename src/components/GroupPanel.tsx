import { useStore } from "../state/store";
import { formatRatio, ratioToHz } from "../lib/theory";

const GROUPS: Array<0 | 1 | 2> = [0, 1, 2];

export function GroupPanel() {
  const { sequence, defaultGroupOctaves, setDefaultGroupOctave, updateGroupOctave, rootHz } = useStore();

  return (
    <section className="panel group-panel">
      <header className="panel-head">
        <h2>Three-group register</h2>
      </header>

      <div className="group-default">
        <div className="subtitle">default octave spread</div>
        <div className="group-row">
          {GROUPS.map((g) => (
            <label key={g} className="group-cell">
              <span>G{g + 1}</span>
              <input
                type="number"
                min={-2}
                max={6}
                step={1}
                value={defaultGroupOctaves[g]}
                onChange={(e) => setDefaultGroupOctave(g, parseInt(e.target.value, 10) || 0)}
              />
            </label>
          ))}
        </div>
      </div>

      {sequence.length === 0 ? (
        <p className="empty">Sequence empty. Add ratios to assign per-step register.</p>
      ) : (
        <ol className="group-list">
          {sequence.map((item, i) => {
            const baseHz = ratioToHz({ num: item.ratio.num, den: item.ratio.den }, rootHz);
            return (
              <li key={i}>
                <div className="group-step-head">
                  <span className="idx">{i + 1}</span>
                  <span className="ratio">{formatRatio(item.ratio)}</span>
                </div>
                <div className="group-row">
                  {GROUPS.map((g) => {
                    const oct = item.groupOctaves[g];
                    const hz = baseHz * Math.pow(2, oct);
                    return (
                      <label key={g} className="group-cell">
                        <span>G{g + 1}</span>
                        <input
                          type="number"
                          min={-4}
                          max={6}
                          step={1}
                          value={oct}
                          onChange={(e) =>
                            updateGroupOctave(i, g, parseInt(e.target.value, 10) || 0)
                          }
                        />
                        <span className="hz">{hz.toFixed(1)} Hz</span>
                      </label>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
