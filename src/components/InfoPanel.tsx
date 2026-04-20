import { useStore, ratioKey } from "../state/store";
import {
  formatRatio,
  formatCents,
  formatFactoredRatio,
  ratioToHz,
  ratioToCents,
  nearest12TET,
  overtoneCoincidences,
  dominantBeat
} from "../lib/theory";

export function InfoPanel() {
  const { system, points, selectedKey, rootHz } = useStore();

  if (!selectedKey) {
    return (
      <aside className="panel info-panel">
        <h2>Ratio</h2>
        <p className="empty">Click a node to inspect it. Double-click to append to the sequence.</p>
      </aside>
    );
  }

  const ratio = system.ratios.find((r) => ratioKey(r) === selectedKey)!;
  const point = points.find((p) => ratioKey(p) === selectedKey)!;
  const hz = ratioToHz({ num: ratio.num, den: ratio.den }, rootHz);
  const reducedHz = ratioToHz(point, rootHz);
  const cents = ratioToCents(point);
  const tet = nearest12TET(reducedHz);

  const coincidences = overtoneCoincidences({ num: 1, den: 1 }, { num: ratio.num, den: ratio.den }, 32);
  const beat = dominantBeat(rootHz, reducedHz, 8);

  return (
    <aside className="panel info-panel">
      <header>
        <h2>{formatRatio(ratio)}</h2>
        {ratio.name && <div className="subtitle">{ratio.name}</div>}
      </header>

      <section>
        <h3>Physical</h3>
        <dl>
          <dt>Frequency</dt>
          <dd>{hz.toFixed(2)} Hz</dd>
          <dt>Reduced (in-octave)</dt>
          <dd>{reducedHz.toFixed(2)} Hz</dd>
          <dt>Cents from root</dt>
          <dd>{formatCents(cents)}</dd>
          <dt>Nearest 12-TET</dt>
          <dd>
            {tet.name}
            {tet.octave} ({formatCents(tet.deviation)})
          </dd>
          <dt>Beating with root</dt>
          <dd>
            {beat
              ? `${beat.hz.toFixed(2)} Hz between harmonic ${beat.kA} of root and harmonic ${beat.kB} of this tone`
              : "no audible beat within first 8 harmonics"}
          </dd>
          <dt>Shared harmonics</dt>
          <dd>
            {coincidences.length === 0
              ? "none within 32"
              : coincidences
                  .map((c) => `h${c.kA}·root = h${c.kB}·this at h${c.rootHarmonic}`)
                  .join("  ·  ")}
          </dd>
        </dl>
      </section>

      <section>
        <h3>Musical</h3>
        <dl>
          <dt>Lattice</dt>
          <dd>
            ({point.x}, {point.y}) — {point.x} fifth{Math.abs(point.x) === 1 ? "" : "s"}, {point.y}{" "}
            septimal{Math.abs(point.y) === 1 ? "" : "s"}
          </dd>
          <dt>Prime factors</dt>
          <dd className="mono">{formatFactoredRatio({ num: ratio.num, den: ratio.den })}</dd>
          <dt>Character</dt>
          <dd className="character">{ratio.character}</dd>
        </dl>
      </section>
    </aside>
  );
}
