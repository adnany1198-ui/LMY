import { useMemo } from "react";
import { useStore, ratioKey } from "../state/store";
import { formatRatio } from "../lib/theory";
import type { LatticePoint } from "../lib/theory";
import type { RatioDef } from "../data/tuning";

const CELL = 110;
const PAD = 70;
const NODE_R = 28;

// Simpler ratios draw larger. "Simplicity" = log of the octave-reduced
// denominator (small denominators -> more prominent).
function simplicityScale(p: LatticePoint): number {
  const { num, den } = p;
  const logSize = Math.log2(Math.max(num, den));
  // Map [0, 11] -> [1.0, 0.55]
  const t = Math.min(1, logSize / 11);
  return 1 - 0.45 * t;
}

export function Lattice({ ratios }: { ratios: RatioDef[] }) {
  const { points, selectedKey, hoverKey, sequence, selectRatio, hoverRatio, appendToSequence } = useStore();

  const { viewBox, xRange, yRange } = useMemo(() => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = (maxX - minX) * CELL + PAD * 2;
    const h = (maxY - minY) * CELL + PAD * 2;
    return {
      viewBox: `0 0 ${w} ${h}`,
      xRange: { min: minX, max: maxX, w },
      yRange: { min: minY, max: maxY, h }
    };
  }, [points]);

  const toPx = (x: number, y: number) => ({
    cx: (x - xRange.min) * CELL + PAD,
    cy: yRange.h - PAD - (y - yRange.min) * CELL // flip Y so +7 goes up
  });

  // Edges: any two points one step apart on either axis.
  const edges = useMemo(() => {
    const result: { a: LatticePoint; b: LatticePoint; axis: "x" | "y" }[] = [];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        if (a.x === b.x && Math.abs(a.y - b.y) === 1) result.push({ a, b, axis: "y" });
        else if (a.y === b.y && Math.abs(a.x - b.x) === 1) result.push({ a, b, axis: "x" });
      }
    }
    return result;
  }, [points]);

  const sequenceKeys = sequence.map((s) => ratioKey(s.ratio));

  // Build sequence path segments (consecutive pairs).
  const seqSegments = useMemo(() => {
    const segs: { from: LatticePoint; to: LatticePoint; index: number }[] = [];
    for (let i = 0; i < sequence.length - 1; i++) {
      segs.push({ from: sequence[i].point, to: sequence[i + 1].point, index: i });
    }
    return segs;
  }, [sequence]);

  return (
    <svg className="lattice" viewBox={viewBox} role="img" aria-label="WTP lattice">
      {/* Axis labels */}
      <g className="axis-labels">
        <text x={PAD} y={16} className="axis-label">
          7-axis (septimal) ↑
        </text>
        <text x={xRange.w - PAD} y={yRange.h - 16} textAnchor="end" className="axis-label">
          3-axis (fifths) →
        </text>
      </g>

      {/* Grid */}
      <g className="grid">
        {Array.from({ length: xRange.max - xRange.min + 1 }, (_, i) => xRange.min + i).map((gx) => {
          const x = (gx - xRange.min) * CELL + PAD;
          return (
            <line
              key={`vx-${gx}`}
              x1={x}
              y1={PAD}
              x2={x}
              y2={yRange.h - PAD}
              className="grid-line"
            />
          );
        })}
        {Array.from({ length: yRange.max - yRange.min + 1 }, (_, i) => yRange.min + i).map((gy) => {
          const y = yRange.h - PAD - (gy - yRange.min) * CELL;
          return (
            <line
              key={`gy-${gy}`}
              x1={PAD}
              y1={y}
              x2={xRange.w - PAD}
              y2={y}
              className="grid-line"
            />
          );
        })}
      </g>

      {/* Edges */}
      <g className="edges">
        {edges.map((e, i) => {
          const a = toPx(e.a.x, e.a.y);
          const b = toPx(e.b.x, e.b.y);
          return (
            <line
              key={i}
              x1={a.cx}
              y1={a.cy}
              x2={b.cx}
              y2={b.cy}
              className={`edge edge-${e.axis}`}
            />
          );
        })}
      </g>

      {/* Sequence path */}
      <g className="sequence-path">
        {seqSegments.map((s, i) => {
          const a = toPx(s.from.x, s.from.y);
          const b = toPx(s.to.x, s.to.y);
          return (
            <line
              key={i}
              x1={a.cx}
              y1={a.cy}
              x2={b.cx}
              y2={b.cy}
              className="seq-line"
              markerEnd="url(#seq-arrow)"
            />
          );
        })}
      </g>

      <defs>
        <marker
          id="seq-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--seq)" />
        </marker>
      </defs>

      {/* Nodes */}
      <g className="nodes">
        {ratios.map((ratio, i) => {
          const point = points[i];
          const { cx, cy } = toPx(point.x, point.y);
          const key = ratioKey(ratio);
          const isSelected = selectedKey === key;
          const isHovered = hoverKey === key;
          const seqIdx = sequenceKeys.indexOf(key);
          const r = NODE_R * simplicityScale(point);
          return (
            <g
              key={key}
              className={[
                "node",
                isSelected ? "is-selected" : "",
                isHovered ? "is-hovered" : "",
                seqIdx >= 0 ? "in-sequence" : ""
              ].join(" ")}
              transform={`translate(${cx} ${cy})`}
              onMouseEnter={() => hoverRatio(key)}
              onMouseLeave={() => hoverRatio(null)}
              onClick={() => selectRatio(key)}
              onDoubleClick={() => appendToSequence(point, ratio)}
            >
              <circle r={r + 6} className="node-halo" />
              <circle r={r} className="node-body" />
              <text y={-4} textAnchor="middle" className="node-ratio">
                {formatRatio(ratio)}
              </text>
              <text y={12} textAnchor="middle" className="node-cents">
                {point.cents.toFixed(0)}¢
              </text>
              <text y={24} textAnchor="middle" className="node-coord">
                ({point.x},{point.y})
              </text>
              {seqIdx >= 0 && (
                <g className="seq-badge" transform={`translate(${r - 4} ${-r + 4})`}>
                  <circle r={10} />
                  <text textAnchor="middle" dy="0.35em">
                    {seqIdx + 1}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
