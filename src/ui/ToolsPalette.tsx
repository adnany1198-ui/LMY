import type { Source } from "../core/Source";
import type { WallRect } from "../core/Boundary";
import type { Tool } from "./types";

interface Props {
  tool: Tool;
  onToolChange: (t: Tool) => void;
  sources: Source[];
  selectedSourceId: string | null;
  onSelectSource: (id: string | null) => void;
  onDeleteSource: (id: string) => void;
  walls: WallRect[];
  onDeleteWall: (id: string) => void;
}

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "speaker", label: "Speaker", hint: "click to place" },
  { id: "wall", label: "Wall", hint: "click-drag rect" },
  { id: "erase", label: "Erase", hint: "click element" },
  { id: "measure", label: "Measure", hint: "click two points" },
  { id: "pan", label: "Pan", hint: "drag to pan" },
];

export function ToolsPalette({
  tool,
  onToolChange,
  sources,
  selectedSourceId,
  onSelectSource,
  onDeleteSource,
  walls,
  onDeleteWall,
}: Props) {
  return (
    <aside
      style={{
        gridRow: "2",
        borderRight: "1px solid var(--border)",
        background: "var(--panel)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
        <div style={paletteLabel}>Tools</div>
        <div style={{ display: "grid", gap: 4 }}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? "active" : ""}
              onClick={() => onToolChange(t.id)}
              style={{ textAlign: "left", display: "flex", justifyContent: "space-between" }}
            >
              <span>{t.label}</span>
              <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 10, borderBottom: "1px solid var(--border)", overflow: "auto" }}>
        <div style={paletteLabel}>Sources ({sources.length})</div>
        {sources.length === 0 && <div style={emptyHint}>No sources placed</div>}
        <div style={{ display: "grid", gap: 2 }}>
          {sources.map((s, i) => {
            const selected = s.id === selectedSourceId;
            return (
              <div
                key={s.id}
                onClick={() => onSelectSource(s.id)}
                style={{
                  ...rowStyle,
                  borderColor: selected ? "var(--accent)" : "var(--border)",
                  color: selected ? "var(--accent)" : "var(--text)",
                }}
              >
                <span className="mono" style={{ fontSize: 11 }}>
                  #{i + 1}
                </span>
                <span style={{ flex: 1 }}>
                  {s.frequencyHz.toFixed(0)} Hz · {s.waveform}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSource(s.id);
                  }}
                  style={smallBtn}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: 10, overflow: "auto", flex: 1 }}>
        <div style={paletteLabel}>Walls ({walls.length})</div>
        {walls.length === 0 && <div style={emptyHint}>No walls drawn</div>}
        <div style={{ display: "grid", gap: 2 }}>
          {walls.map((w, i) => (
            <div key={w.id} style={rowStyle}>
              <span className="mono" style={{ fontSize: 11 }}>
                #{i + 1}
              </span>
              <span style={{ flex: 1, fontSize: 11, color: "var(--text-dim)" }}>
                {Math.abs(w.x1 - w.x0).toFixed(1)}×{Math.abs(w.y1 - w.y0).toFixed(1)} m
              </span>
              <button onClick={() => onDeleteWall(w.id)} style={smallBtn}>
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

const paletteLabel: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-faint)",
  marginBottom: 8,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 6px",
  border: "1px solid var(--border)",
  borderRadius: 2,
  cursor: "pointer",
  background: "var(--panel-2)",
};

const smallBtn: React.CSSProperties = {
  padding: "0 6px",
  fontSize: 14,
  lineHeight: 1,
};

const emptyHint: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-faint)",
  fontStyle: "italic",
  marginBottom: 6,
};
