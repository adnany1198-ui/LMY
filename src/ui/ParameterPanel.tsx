import type { Grid } from "../core/Grid";
import type { Source, Waveform } from "../core/Source";
import type { ScaleMode } from "../core/FDTDSimulation";

interface Props {
  grid: Grid;
  dxMeters: number;
  onDxChange: (v: number) => void;
  stepsPerFrame: number;
  onStepsPerFrameChange: (v: number) => void;
  damping: number;
  onDampingChange: (v: number) => void;
  gain: number;
  onGainChange: (v: number) => void;
  scaleMode: ScaleMode;
  onScaleModeChange: (v: ScaleMode) => void;
  dbFloor: number;
  onDbFloorChange: (v: number) => void;
  wallAlpha: number;
  onWallAlphaChange: (v: number) => void;
  alphaThreshold: number;
  onAlphaThresholdChange: (v: number) => void;
  gamma: number;
  onGammaChange: (v: number) => void;
  showGrid: boolean;
  onShowGridChange: (v: boolean) => void;
  selectedSource: Source | null;
  onUpdateSource: (id: string, patch: Partial<Source>) => void;
}

const DX_PRESETS = [
  { label: "Coarse · 1.0 m", value: 1.0 },
  { label: "Medium · 0.5 m", value: 0.5 },
  { label: "Fine · 0.3 m", value: 0.3 },
  { label: "Physics · 0.2 m", value: 0.2 },
];

export function ParameterPanel(p: Props) {
  const maxFreq = p.grid.maxAccurateFrequencyHz();
  const dtMs = p.grid.dt * 1000;
  return (
    <aside
      style={{
        gridRow: "2",
        borderLeft: "1px solid var(--border)",
        background: "var(--panel)",
        overflow: "auto",
      }}
    >
      <Section title="Simulation">
        <Stat label="Grid" value={`${p.grid.width} × ${p.grid.height} cells`} />
        <Stat
          label="Domain"
          value={`${p.grid.widthMeters} × ${p.grid.heightMeters} m`}
        />
        <Stat label="dx" value={`${p.grid.dx.toFixed(2)} m`} />
        <Stat label="dt" value={`${dtMs.toFixed(3)} ms`} />
        <Stat label="Courant C" value={p.grid.courant.toFixed(3)} />
        <Stat label="c" value={`${p.grid.c} m/s`} />
        <Stat label="f_max (5 cells/λ)" value={`${maxFreq.toFixed(0)} Hz`} />

        <label>
          Grid resolution (dx)
          <select
            value={p.dxMeters}
            onChange={(e) => p.onDxChange(parseFloat(e.target.value))}
          >
            {DX_PRESETS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Steps per frame: <span className="mono">{p.stepsPerFrame}</span>
          <input
            type="range"
            min={1}
            max={20}
            value={p.stepsPerFrame}
            onChange={(e) => p.onStepsPerFrameChange(parseInt(e.target.value, 10))}
          />
        </label>

        <label>
          Damping: <span className="mono">{p.damping.toFixed(4)}</span>
          <input
            type="range"
            min={0.9}
            max={1.0}
            step={0.0005}
            value={p.damping}
            onChange={(e) => p.onDampingChange(parseFloat(e.target.value))}
          />
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
            per-step pressure retention · lower = faster 1/r-like falloff
          </div>
        </label>
      </Section>

      <Section title="Visualisation">
        <label>
          Amplitude scale
          <select
            value={p.scaleMode}
            onChange={(e) => p.onScaleModeChange(e.target.value as ScaleMode)}
          >
            <option value="linear">Linear (|p|)</option>
            <option value="db">Decibel (20·log₁₀|p|)</option>
          </select>
        </label>

        {p.scaleMode === "db" && (
          <label>
            dB floor: <span className="mono">{p.dbFloor.toFixed(0)} dB</span>
            <input
              type="range"
              min={-90}
              max={-20}
              step={1}
              value={p.dbFloor}
              onChange={(e) => p.onDbFloorChange(parseFloat(e.target.value))}
            />
          </label>
        )}

        <label>
          Visibility γ: <span className="mono">{p.gamma.toFixed(2)}</span>
          <input
            type="range"
            min={0.3}
            max={4}
            step={0.05}
            value={p.gamma}
            onChange={(e) => p.onGammaChange(parseFloat(e.target.value))}
          />
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
            higher = distant wavefronts visible · lower = peaks only
          </div>
        </label>

        <label>
          Threshold: <span className="mono">{p.alphaThreshold.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={0.6}
            step={0.01}
            value={p.alphaThreshold}
            onChange={(e) => p.onAlphaThresholdChange(parseFloat(e.target.value))}
          />
        </label>

        <label>
          Pressure gain: <span className="mono">{p.gain.toFixed(2)}</span>
          <input
            type="range"
            min={0.1}
            max={10}
            step={0.1}
            value={p.gain}
            onChange={(e) => p.onGainChange(parseFloat(e.target.value))}
          />
        </label>

        <label>
          Wall overlay: <span className="mono">{p.wallAlpha.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={p.wallAlpha}
            onChange={(e) => p.onWallAlphaChange(parseFloat(e.target.value))}
          />
        </label>

        <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={p.showGrid}
            onChange={(e) => p.onShowGridChange(e.target.checked)}
          />
          <span>Show grid overlay (10 m)</span>
        </label>
      </Section>

      <Section title="Selected source">
        {p.selectedSource ? (
          <SourceEditor source={p.selectedSource} onUpdate={p.onUpdateSource} />
        ) : (
          <div style={{ color: "var(--text-faint)", fontSize: 11 }}>
            Select a source from the list or place a new one to edit its parameters.
          </div>
        )}
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 12,
        borderBottom: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-faint)",
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function SourceEditor({
  source,
  onUpdate,
}: {
  source: Source;
  onUpdate: (id: string, patch: Partial<Source>) => void;
}) {
  const s = source;
  return (
    <>
      <Stat label="Position" value={`${s.xMeters.toFixed(1)}, ${s.yMeters.toFixed(1)} m`} />

      <label>
        Waveform
        <select
          value={s.waveform}
          onChange={(e) => onUpdate(s.id, { waveform: e.target.value as Waveform })}
        >
          <option value="sine">Sine</option>
          <option value="impulse">Impulse (Gaussian)</option>
          <option value="noise">White noise</option>
        </select>
      </label>

      <label>
        Frequency: <span className="mono">{s.frequencyHz.toFixed(0)} Hz</span>
        <input
          type="range"
          min={20}
          max={500}
          step={1}
          value={s.frequencyHz}
          onChange={(e) => onUpdate(s.id, { frequencyHz: parseFloat(e.target.value) })}
        />
      </label>

      <label>
        Amplitude: <span className="mono">{s.amplitude.toFixed(2)}</span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={s.amplitude}
          onChange={(e) => onUpdate(s.id, { amplitude: parseFloat(e.target.value) })}
        />
      </label>

      <label>
        Phase: <span className="mono">{((s.phaseRad / Math.PI) * 180).toFixed(0)}°</span>
        <input
          type="range"
          min={0}
          max={Math.PI * 2}
          step={0.01}
          value={s.phaseRad}
          onChange={(e) => onUpdate(s.id, { phaseRad: parseFloat(e.target.value) })}
        />
      </label>

      <label>
        Radius: <span className="mono">{s.radiusMeters.toFixed(2)} m</span>
        <input
          type="range"
          min={0.2}
          max={5}
          step={0.1}
          value={s.radiusMeters}
          onChange={(e) => onUpdate(s.id, { radiusMeters: parseFloat(e.target.value) })}
        />
      </label>

      <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          checked={s.enabled}
          onChange={(e) => onUpdate(s.id, { enabled: e.target.checked })}
        />
        <span>Enabled</span>
      </label>
    </>
  );
}
