import { useEffect, useMemo, useRef, useState } from "react";
import { FDTDSimulation, ColorMap } from "../core/FDTDSimulation";
import type { Grid } from "../core/Grid";
import { buildBoundaryMask, newWallId, WallRect } from "../core/Boundary";
import type { Source } from "../core/Source";
import {
  pixelsPerMeter,
  screenToWorld,
  worldScreenOrigin,
  worldScreenSize,
  Viewport,
  zoomAt,
} from "../utils/coordinates";
import type { Tool } from "./types";

interface Props {
  grid: Grid;
  tool: Tool;
  sources: Source[];
  walls: WallRect[];
  selectedSourceId: string | null;
  running: boolean;
  stepsPerFrame: number;
  gain: number;
  colormap: ColorMap;
  wallAlpha: number;
  showGrid: boolean;
  resetSignal: number;
  onAddSource: (xMeters: number, yMeters: number) => void;
  onSelectSource: (id: string | null) => void;
  onAddWall: (w: WallRect) => void;
  onDeleteSource: (id: string) => void;
  onDeleteWall: (id: string) => void;
}

interface DragState {
  mode: "wall" | "pan" | "measure";
  startScreenX: number;
  startScreenY: number;
  startWorldX: number;
  startWorldY: number;
  startPanX: number;
  startPanY: number;
  currentScreenX: number;
  currentScreenY: number;
  currentWorldX: number;
  currentWorldY: number;
}

export function SimulationCanvas(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<FDTDSimulation | null>(null);
  const rafRef = useRef<number | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Viewport>(() => ({
    worldWidth: props.grid.widthMeters,
    worldHeight: props.grid.heightMeters,
    containerWidth: 1,
    containerHeight: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
  }));

  const [drag, setDrag] = useState<DragState | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [measurement, setMeasurement] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  const viewportLive = useMemo(
    () => ({
      ...viewport,
      worldWidth: props.grid.widthMeters,
      worldHeight: props.grid.heightMeters,
      containerWidth: containerSize.width || 1,
      containerHeight: containerSize.height || 1,
    }),
    [viewport, props.grid.widthMeters, props.grid.heightMeters, containerSize],
  );

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setContainerSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // (Re)create simulation when grid changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = props.grid.width;
    canvas.height = props.grid.height;
    try {
      const sim = new FDTDSimulation(canvas, { grid: props.grid });
      simRef.current = sim;
      return () => {
        sim.dispose();
        simRef.current = null;
      };
    } catch (err) {
      console.error("Failed to create FDTD simulation:", err);
      return;
    }
  }, [props.grid]);

  // Reset pressure field on signal
  useEffect(() => {
    simRef.current?.reset();
  }, [props.resetSignal]);

  // Upload boundaries whenever walls or grid change
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const mask = buildBoundaryMask(props.grid, props.walls);
    sim.uploadBoundaries(mask);
  }, [props.walls, props.grid]);

  // Animation loop
  useEffect(() => {
    let lastFpsT = performance.now();
    let frames = 0;

    const tick = () => {
      const sim = simRef.current;
      const canvas = canvasRef.current;
      if (sim && canvas) {
        const p = propsRef.current;
        if (p.running) {
          for (let i = 0; i < p.stepsPerFrame; i++) {
            sim.step(p.sources);
          }
        }
        sim.render(canvas.width, canvas.height, {
          gain: p.gain,
          colormap: p.colormap,
          wallAlpha: p.wallAlpha,
        });
      }

      frames += 1;
      const now = performance.now();
      if (now - lastFpsT > 500) {
        setFps((frames * 1000) / (now - lastFpsT));
        frames = 0;
        lastFpsT = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setViewport((v) =>
      zoomAt(
        {
          ...v,
          worldWidth: props.grid.widthMeters,
          worldHeight: props.grid.heightMeters,
          containerWidth: rect.width,
          containerHeight: rect.height,
        },
        x,
        y,
        factor,
      ),
    );
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(viewportLive, sx, sy);

    // Middle button = always pan
    if (e.button === 1 || props.tool === "pan" || e.shiftKey) {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setDrag({
        mode: "pan",
        startScreenX: sx,
        startScreenY: sy,
        startWorldX: w.x,
        startWorldY: w.y,
        startPanX: viewport.panX,
        startPanY: viewport.panY,
        currentScreenX: sx,
        currentScreenY: sy,
        currentWorldX: w.x,
        currentWorldY: w.y,
      });
      return;
    }

    if (e.button !== 0) return;

    // Click inside world bounds?
    const insideWorld =
      w.x >= 0 && w.y >= 0 && w.x <= props.grid.widthMeters && w.y <= props.grid.heightMeters;

    if (props.tool === "speaker" && insideWorld) {
      // Try selecting existing source first
      const hit = hitTestSource(propsRef.current.sources, w.x, w.y, viewportLive);
      if (hit) {
        propsRef.current.onSelectSource(hit.id);
        return;
      }
      propsRef.current.onAddSource(w.x, w.y);
      return;
    }

    if (props.tool === "erase") {
      const hitSource = hitTestSource(propsRef.current.sources, w.x, w.y, viewportLive);
      if (hitSource) {
        propsRef.current.onDeleteSource(hitSource.id);
        return;
      }
      const hitWall = hitTestWall(propsRef.current.walls, w.x, w.y);
      if (hitWall) {
        propsRef.current.onDeleteWall(hitWall.id);
        return;
      }
      return;
    }

    if (props.tool === "wall" && insideWorld) {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setDrag({
        mode: "wall",
        startScreenX: sx,
        startScreenY: sy,
        startWorldX: w.x,
        startWorldY: w.y,
        startPanX: viewport.panX,
        startPanY: viewport.panY,
        currentScreenX: sx,
        currentScreenY: sy,
        currentWorldX: w.x,
        currentWorldY: w.y,
      });
      return;
    }

    if (props.tool === "measure" && insideWorld) {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setDrag({
        mode: "measure",
        startScreenX: sx,
        startScreenY: sy,
        startWorldX: w.x,
        startWorldY: w.y,
        startPanX: viewport.panX,
        startPanY: viewport.panY,
        currentScreenX: sx,
        currentScreenY: sy,
        currentWorldX: w.x,
        currentWorldY: w.y,
      });
      setMeasurement({ x0: w.x, y0: w.y, x1: w.x, y1: w.y });
      return;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(viewportLive, sx, sy);
    setCursor({ x: w.x, y: w.y });

    if (!drag) return;

    if (drag.mode === "pan") {
      const dx = sx - drag.startScreenX;
      const dy = sy - drag.startScreenY;
      setViewport((v) => ({ ...v, panX: drag.startPanX + dx, panY: drag.startPanY + dy }));
      return;
    }

    setDrag({
      ...drag,
      currentScreenX: sx,
      currentScreenY: sy,
      currentWorldX: w.x,
      currentWorldY: w.y,
    });

    if (drag.mode === "measure") {
      setMeasurement({ x0: drag.startWorldX, y0: drag.startWorldY, x1: w.x, y1: w.y });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);

    if (drag.mode === "wall") {
      const minSize = props.grid.dx;
      const x0 = Math.max(0, Math.min(drag.startWorldX, drag.currentWorldX));
      const y0 = Math.max(0, Math.min(drag.startWorldY, drag.currentWorldY));
      const x1 = Math.min(
        props.grid.widthMeters,
        Math.max(drag.startWorldX, drag.currentWorldX),
      );
      const y1 = Math.min(
        props.grid.heightMeters,
        Math.max(drag.startWorldY, drag.currentWorldY),
      );
      if (x1 - x0 > minSize && y1 - y0 > minSize) {
        propsRef.current.onAddWall({ id: newWallId(), x0, y0, x1, y1 });
      }
    }

    setDrag(null);
  };

  // Compute canvas position/size on screen
  const origin = worldScreenOrigin(viewportLive);
  const worldSize = worldScreenSize(viewportLive);
  const ppm = pixelsPerMeter(viewportLive);

  // Preview wall rectangle during drag
  let previewWall: { x: number; y: number; w: number; h: number } | null = null;
  if (drag?.mode === "wall") {
    const x0 = Math.min(drag.startWorldX, drag.currentWorldX);
    const y0 = Math.min(drag.startWorldY, drag.currentWorldY);
    const x1 = Math.max(drag.startWorldX, drag.currentWorldX);
    const y1 = Math.max(drag.startWorldY, drag.currentWorldY);
    previewWall = {
      x: origin.x + x0 * ppm,
      y: origin.y + y0 * ppm,
      w: (x1 - x0) * ppm,
      h: (y1 - y0) * ppm,
    };
  }

  const cursorStyle =
    props.tool === "pan"
      ? "grab"
      : props.tool === "speaker"
        ? "crosshair"
        : props.tool === "wall"
          ? "crosshair"
          : props.tool === "erase"
            ? "not-allowed"
            : props.tool === "measure"
              ? "crosshair"
              : "default";

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        gridRow: "2",
        position: "relative",
        background: "#050506",
        overflow: "hidden",
        cursor: drag?.mode === "pan" ? "grabbing" : cursorStyle,
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {/* Simulation canvas — rendered at grid resolution, stretched to world screen size */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: origin.x,
          top: origin.y,
          width: worldSize.width,
          height: worldSize.height,
          imageRendering: "pixelated",
          pointerEvents: "none",
        }}
      />

      {/* World-bounds frame */}
      <div
        style={{
          position: "absolute",
          left: origin.x,
          top: origin.y,
          width: worldSize.width,
          height: worldSize.height,
          border: "1px solid #2a2a32",
          pointerEvents: "none",
        }}
      />

      {/* Grid overlay */}
      {props.showGrid && (
        <GridOverlay
          grid={props.grid}
          originX={origin.x}
          originY={origin.y}
          widthPx={worldSize.width}
          heightPx={worldSize.height}
          ppm={ppm}
        />
      )}

      {/* Walls overlay (SVG for precise shapes) */}
      <svg
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {props.walls.map((w) => (
          <rect
            key={w.id}
            x={origin.x + Math.min(w.x0, w.x1) * ppm}
            y={origin.y + Math.min(w.y0, w.y1) * ppm}
            width={Math.abs(w.x1 - w.x0) * ppm}
            height={Math.abs(w.y1 - w.y0) * ppm}
            fill="rgba(255,255,255,0.03)"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1}
          />
        ))}

        {previewWall && (
          <rect
            x={previewWall.x}
            y={previewWall.y}
            width={previewWall.w}
            height={previewWall.h}
            fill="rgba(255, 46, 136, 0.12)"
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}

        {props.sources.map((s) => {
          const cx = origin.x + s.xMeters * ppm;
          const cy = origin.y + s.yMeters * ppm;
          const selected = s.id === props.selectedSourceId;
          return (
            <g key={s.id}>
              <circle
                cx={cx}
                cy={cy}
                r={Math.max(6, s.radiusMeters * ppm)}
                fill="none"
                stroke={selected ? "var(--accent)" : "rgba(255,255,255,0.35)"}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <circle
                cx={cx}
                cy={cy}
                r={4}
                fill={s.enabled ? "var(--accent)" : "#444"}
                stroke="#000"
                strokeWidth={1}
              />
            </g>
          );
        })}

        {measurement && (
          <g>
            <line
              x1={origin.x + measurement.x0 * ppm}
              y1={origin.y + measurement.y0 * ppm}
              x2={origin.x + measurement.x1 * ppm}
              y2={origin.y + measurement.y1 * ppm}
              stroke="var(--warn)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <circle
              cx={origin.x + measurement.x0 * ppm}
              cy={origin.y + measurement.y0 * ppm}
              r={3}
              fill="var(--warn)"
            />
            <circle
              cx={origin.x + measurement.x1 * ppm}
              cy={origin.y + measurement.y1 * ppm}
              r={3}
              fill="var(--warn)"
            />
          </g>
        )}
      </svg>

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          background: "rgba(10,10,11,0.85)",
          border: "1px solid var(--border)",
          padding: "6px 8px",
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--text-dim)",
          lineHeight: 1.5,
          pointerEvents: "none",
        }}
      >
        {cursor && (
          <div>
            cursor: {cursor.x.toFixed(1)} m, {cursor.y.toFixed(1)} m
          </div>
        )}
        <div>zoom: {viewport.zoom.toFixed(2)}×</div>
        <div>fps: {fps.toFixed(0)}</div>
        <MeasurementReadout measurement={measurement} grid={props.grid} />
        <SimStats simRef={simRef} />
      </div>
    </div>
  );
}

function GridOverlay({
  grid,
  originX,
  originY,
  widthPx,
  heightPx,
  ppm,
}: {
  grid: Grid;
  originX: number;
  originY: number;
  widthPx: number;
  heightPx: number;
  ppm: number;
}) {
  // 10m grid lines
  const step = 10;
  const lines: JSX.Element[] = [];
  for (let x = 0; x <= grid.widthMeters; x += step) {
    lines.push(
      <line
        key={`vx${x}`}
        x1={originX + x * ppm}
        y1={originY}
        x2={originX + x * ppm}
        y2={originY + heightPx}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={1}
      />,
    );
  }
  for (let y = 0; y <= grid.heightMeters; y += step) {
    lines.push(
      <line
        key={`hy${y}`}
        x1={originX}
        y1={originY + y * ppm}
        x2={originX + widthPx}
        y2={originY + y * ppm}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={1}
      />,
    );
  }
  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {lines}
    </svg>
  );
}

function MeasurementReadout({
  measurement,
  grid,
}: {
  measurement: { x0: number; y0: number; x1: number; y1: number } | null;
  grid: Grid;
}) {
  if (!measurement) return null;
  const dx = measurement.x1 - measurement.x0;
  const dy = measurement.y1 - measurement.y0;
  const d = Math.hypot(dx, dy);
  const tMs = (d / grid.c) * 1000;
  return (
    <div style={{ color: "var(--warn)" }}>
      Δ = {d.toFixed(2)} m ({tMs.toFixed(1)} ms @ {grid.c} m/s)
    </div>
  );
}

function SimStats({ simRef }: { simRef: React.MutableRefObject<FDTDSimulation | null> }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const sim = simRef.current;
  if (!sim) return null;
  return (
    <div>
      sim t: {(sim.simTimeSeconds * 1000).toFixed(1)} ms · steps: {sim.stepCount}
    </div>
  );
}

function hitTestSource(
  sources: Source[],
  worldX: number,
  worldY: number,
  v: Viewport,
): Source | null {
  const ppm = pixelsPerMeter(v);
  const thresholdPx = 12;
  const thresholdMeters = thresholdPx / ppm;
  let best: { s: Source; d: number } | null = null;
  for (const s of sources) {
    const d = Math.hypot(s.xMeters - worldX, s.yMeters - worldY);
    if (d < thresholdMeters && (!best || d < best.d)) {
      best = { s, d };
    }
  }
  return best?.s ?? null;
}

function hitTestWall(walls: WallRect[], worldX: number, worldY: number): WallRect | null {
  for (let i = walls.length - 1; i >= 0; i--) {
    const w = walls[i];
    const x0 = Math.min(w.x0, w.x1);
    const y0 = Math.min(w.y0, w.y1);
    const x1 = Math.max(w.x0, w.x1);
    const y1 = Math.max(w.y0, w.y1);
    if (worldX >= x0 && worldX <= x1 && worldY >= y0 && worldY <= y1) return w;
  }
  return null;
}
