import { useStore, ratioKey } from "../state/store";
import {
  formatRatio,
  formatCents,
  intervalBetween,
  manhattan,
  ratioToCents,
  describeMovement,
  movementCharacter
} from "../lib/theory";

export function MovementGuide() {
  const { system, points, selectedKey, hoverKey } = useStore();

  if (!selectedKey || !hoverKey || selectedKey === hoverKey) {
    return (
      <aside className="panel move-panel">
        <h2>Movement</h2>
        <p className="empty">
          {selectedKey
            ? "Hover a second node to see the movement between them."
            : "Select a starting node first."}
        </p>
      </aside>
    );
  }

  const from = system.ratios.find((r) => ratioKey(r) === selectedKey)!;
  const to = system.ratios.find((r) => ratioKey(r) === hoverKey)!;
  const fromPt = points.find((p) => ratioKey(p) === selectedKey)!;
  const toPt = points.find((p) => ratioKey(p) === hoverKey)!;

  const interval = intervalBetween(
    { num: from.num, den: from.den },
    { num: to.num, den: to.den }
  );
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const dist = manhattan(fromPt, toPt);
  const deltaCents = ratioToCents(toPt) - ratioToCents(fromPt);

  return (
    <aside className="panel move-panel">
      <h2>Movement</h2>
      <div className="move-from-to">
        <span className="ratio">{formatRatio(from)}</span>
        <span className="arrow">→</span>
        <span className="ratio">{formatRatio(to)}</span>
      </div>
      <dl>
        <dt>Interval between</dt>
        <dd>
          {formatRatio(interval)} ({formatCents(ratioToCents(interval))})
        </dd>
        <dt>Cents change</dt>
        <dd>{formatCents(deltaCents)}</dd>
        <dt>Lattice step</dt>
        <dd>{describeMovement(dx, dy)}</dd>
        <dt>Harmonic distance</dt>
        <dd>
          {dist} step{dist === 1 ? "" : "s"}
        </dd>
        <dt>Character</dt>
        <dd className="character">{movementCharacter(dx, dy)}</dd>
      </dl>
    </aside>
  );
}
