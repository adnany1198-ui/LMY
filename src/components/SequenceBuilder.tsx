import { useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import {
  formatRatio,
  formatCents,
  intervalBetween,
  ratioToCents,
  manhattan
} from "../lib/theory";

export function SequenceBuilder() {
  const { sequence, removeFromSequence, moveSequenceItem, clearSequence, rootHz, system } = useStore();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLAnchorElement>(null);

  // Cumulative harmonic distance from first ratio (1:1 if empty).
  const cumDistances = useMemo(() => {
    const out: number[] = [];
    let total = 0;
    for (let i = 0; i < sequence.length; i++) {
      if (i === 0) {
        out.push(0);
        continue;
      }
      total += manhattan(sequence[i - 1].point, sequence[i].point);
      out.push(total);
    }
    return out;
  }, [sequence]);

  const maxCum = Math.max(1, ...cumDistances);

  const exportJson = () => {
    const payload = {
      system: system.id,
      rootHz,
      steps: sequence.map((item) => ({
        ratio: { num: item.ratio.num, den: item.ratio.den },
        lattice: { x: item.point.x, y: item.point.y },
        cents: item.point.cents,
        groupOctaves: item.groupOctaves
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lmy-sequence-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    void fileInputRef.current; // keep ref for future extensions
  };

  return (
    <section className="panel sequence-panel">
      <header className="panel-head">
        <h2>Sequence</h2>
        <div className="actions">
          <button type="button" onClick={exportJson} disabled={sequence.length === 0}>
            export JSON
          </button>
          <button type="button" onClick={clearSequence} disabled={sequence.length === 0}>
            clear
          </button>
        </div>
      </header>

      {sequence.length === 0 ? (
        <p className="empty">Double-click any node to start a sequence.</p>
      ) : (
        <ol className="sequence-list">
          {sequence.map((item, i) => {
            const prev = i > 0 ? sequence[i - 1] : null;
            const interval = prev
              ? intervalBetween(
                  { num: prev.ratio.num, den: prev.ratio.den },
                  { num: item.ratio.num, den: item.ratio.den }
                )
              : null;
            return (
              <li
                key={`${i}-${item.ratio.num}-${item.ratio.den}`}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null && dragIndex !== i) moveSequenceItem(dragIndex, i);
                  setDragIndex(null);
                }}
              >
                <span className="idx">{i + 1}</span>
                <span className="ratio">{formatRatio(item.ratio)}</span>
                <span className="cents">{formatCents(item.point.cents, 0)}</span>
                <span className="interval">
                  {interval
                    ? `Δ ${formatRatio(interval)} · ${formatCents(ratioToCents(interval), 0)}`
                    : "—"}
                </span>
                <span className="dist">d {cumDistances[i]}</span>
                <button
                  type="button"
                  className="remove"
                  onClick={() => removeFromSequence(i)}
                  aria-label="remove"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {sequence.length > 1 && (
        <div className="tension-curve">
          <div className="tension-label">harmonic distance from start</div>
          <svg viewBox={`0 0 ${Math.max(200, sequence.length * 28)} 80`} className="tension-svg">
            <polyline
              points={cumDistances
                .map((d, i) => {
                  const x = (i * (Math.max(200, sequence.length * 28) - 10)) / (sequence.length - 1) + 5;
                  const y = 75 - (d / maxCum) * 65;
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke="var(--seq)"
              strokeWidth={2}
            />
            {cumDistances.map((d, i) => {
              const x = (i * (Math.max(200, sequence.length * 28) - 10)) / (sequence.length - 1) + 5;
              const y = 75 - (d / maxCum) * 65;
              return <circle key={i} cx={x} cy={y} r={2.5} fill="var(--seq)" />;
            })}
          </svg>
        </div>
      )}
    </section>
  );
}
