import { useCallback, useMemo, useRef, useState } from "react";
import { Grid, SPEED_OF_SOUND_MPS } from "../core/Grid";
import { newSourceId, Source, sourceColorFor } from "../core/Source";
import type { WallRect } from "../core/Boundary";
import type { ScaleMode } from "../core/FDTDSimulation";
import {
  DEFAULT_THRESHOLDS,
  loadImageData,
  segmentSitePlan,
} from "../core/SitePlanAnalysis";
import { SimulationCanvas } from "./Canvas";
import { ToolsPalette } from "./ToolsPalette";
import { ParameterPanel } from "./ParameterPanel";
import { SitePlanPanel } from "./SitePlanPanel";
import { emptySitePlanState, SitePlanCalibration, SitePlanState } from "./siteplan-state";
import type { Tool } from "./types";

// Default site envelope: width in metres is the "domain scale". Height is
// derived from the cropped site-plan aspect ratio once an image is loaded,
// so the simulation grid always matches the plan's shape. Before a plan
// is loaded we fall back to a 3:2 box.
const DEFAULT_DOMAIN_WIDTH_METERS = 300;
const FALLBACK_ASPECT = 1.5; // width / height

export function App() {
  const [dxMeters, setDxMeters] = useState(0.5);
  const [domainWidthMeters, setDomainWidthMeters] = useState(DEFAULT_DOMAIN_WIDTH_METERS);

  // Site plan state
  const [sitePlan, setSitePlan] = useState<SitePlanState>(emptySitePlanState);
  const imageDataRef = useRef<ImageData | null>(null);
  const [segmentedMasks, setSegmentedMasks] = useState<{
    wall: Uint8Array;
    absorption: Uint8Array;
    classMap: Uint8Array;
  } | null>(null);
  const [showSegmentationOverlay, setShowSegmentationOverlay] = useState(true);
  const [segmentationOpacity, setSegmentationOpacity] = useState(0.55);
  const [segmenting, setSegmenting] = useState(false);

  // Derive world dimensions from the crop aspect (width/height of the
  // calibration rect in image pixels). If no crop yet, fall back.
  const cropAspect = useMemo(() => {
    const cal = sitePlan.calibration;
    if (!cal) return FALLBACK_ASPECT;
    const w = cal.x1 - cal.x0;
    const h = cal.y1 - cal.y0;
    if (w <= 0 || h <= 0) return FALLBACK_ASPECT;
    return w / h;
  }, [sitePlan.calibration]);

  const grid = useMemo(
    () =>
      new Grid({
        widthMeters: domainWidthMeters,
        heightMeters: domainWidthMeters / cropAspect,
        dxMeters,
        courant: 0.5,
        speedOfSound: SPEED_OF_SOUND_MPS,
      }),
    [dxMeters, domainWidthMeters, cropAspect],
  );

  const [tool, setTool] = useState<Tool>("speaker");
  const [sources, setSources] = useState<Source[]>([]);
  const [walls, setWalls] = useState<WallRect[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const [running, setRunning] = useState(true);
  const [stepsPerFrame, setStepsPerFrame] = useState(6);
  const [damping, setDamping] = useState(0.99);
  const [gain, setGain] = useState(1.8);
  const [scaleMode, setScaleMode] = useState<ScaleMode>("db");
  const [dbFloor, setDbFloor] = useState(-48);
  const [wallAlpha, setWallAlpha] = useState(0.0);
  const [alphaThreshold, setAlphaThreshold] = useState(0.05);
  const [gamma, setGamma] = useState(1.6);
  const [showGrid, setShowGrid] = useState(false);
  const captureRef = useRef<null | (() => void)>(null);

  const resetKey = useRef(0);
  const [resetSignal, setResetSignal] = useState(0);

  const addSource = useCallback((xMeters: number, yMeters: number) => {
    setSources((prev) => {
      const s: Source = {
        id: newSourceId(),
        xMeters,
        yMeters,
        frequencyHz: 120,
        amplitude: 0.9,
        phaseRad: 0,
        waveform: "sine",
        radiusMeters: 1.0,
        enabled: true,
        color: sourceColorFor(prev.length),
      };
      setSelectedSourceId(s.id);
      return [...prev, s];
    });
  }, []);

  const addWall = useCallback((w: WallRect) => setWalls((prev) => [...prev, w]), []);

  const updateSource = useCallback((id: string, patch: Partial<Source>) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const deleteSource = useCallback(
    (id: string) => {
      setSources((prev) => prev.filter((s) => s.id !== id));
      if (selectedSourceId === id) setSelectedSourceId(null);
    },
    [selectedSourceId],
  );

  const deleteWall = useCallback((id: string) => {
    setWalls((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const selectedSource = sources.find((s) => s.id === selectedSourceId) ?? null;

  const handleReset = useCallback(() => {
    resetKey.current += 1;
    setResetSignal(resetKey.current);
  }, []);

  const handleClear = useCallback(() => {
    setSources([]);
    setWalls([]);
    setSelectedSourceId(null);
    handleReset();
  }, [handleReset]);

  // --- Site plan handlers ---

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      const { image, imageData } = await loadImageData(file);
      imageDataRef.current = imageData;
      const url = URL.createObjectURL(file);
      setSitePlan((prev) => {
        if (prev.imageUrl) URL.revokeObjectURL(prev.imageUrl);
        return {
          ...prev,
          imageUrl: url,
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          // Default calibration: use the left portion of the image, assuming
          // the Serranova plans have a legend panel to the right.
          calibration: {
            x0: 0,
            y0: 0,
            x1: Math.round(image.naturalWidth * 0.72),
            y1: image.naturalHeight,
          },
          hasSegmentation: false,
          segmentationSummary: null,
        };
      });
    } catch (err) {
      console.error("Site plan load failed:", err);
      alert("Failed to load image. Check the file and try again.");
    }
  }, []);

  const handleCalibrationChange = useCallback((c: SitePlanCalibration) => {
    setSitePlan((prev) => ({ ...prev, calibration: c }));
  }, []);

  const handleOpacityChange = useCallback((v: number) => {
    setSitePlan((prev) => ({ ...prev, opacity: v }));
  }, []);

  const handleToggleVisible = useCallback((v: boolean) => {
    setSitePlan((prev) => ({ ...prev, visible: v }));
  }, []);

  const handleAutoSegment = useCallback(async () => {
    const img = imageDataRef.current;
    const cal = sitePlan.calibration;
    if (!img || !cal) return;
    setSegmenting(true);
    // Yield a frame so the UI can update
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const result = segmentSitePlan(img, grid, cal, DEFAULT_THRESHOLDS);
      setSegmentedMasks({
        wall: result.wallMask,
        absorption: result.absorptionMask,
        classMap: result.classMap,
      });
      const total = grid.width * grid.height;
      const pct = (n: number) => ((n / total) * 100).toFixed(1) + "%";
      setSitePlan((prev) => ({
        ...prev,
        hasSegmentation: true,
        segmentationSummary: [
          `wall ${pct(result.counts.wall)}`,
          `water ${pct(result.counts.water)}`,
          `tree ${pct(result.counts.tree)}`,
          `ground ${pct(result.counts.ground)}`,
          `air ${pct(result.counts.air)}`,
        ].join(" · "),
      }));
      setShowSegmentationOverlay(true);
    } finally {
      setSegmenting(false);
    }
  }, [grid, sitePlan.calibration]);

  const handleClearSegmentation = useCallback(() => {
    setSegmentedMasks(null);
    setSitePlan((prev) => ({ ...prev, hasSegmentation: false, segmentationSummary: null }));
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr 300px",
        gridTemplateRows: "40px 1fr",
        height: "100vh",
        width: "100vw",
      }}
    >
      <header
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
        }}
      >
        <div style={{ fontWeight: 600, letterSpacing: "0.02em" }}>
          ACOUSTIC PROPAGATION ENGINE
        </div>
        <div style={{ color: "var(--text-faint)", fontSize: 11 }}>
          FDTD · 2D wave equation · WebGL2
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setRunning((r) => !r)}>
          {running ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button onClick={handleReset}>↻ Reset field</button>
        <button onClick={handleClear}>Clear all</button>
        <button onClick={() => captureRef.current?.()}>📸 Snapshot PNG</button>
      </header>

      <ToolsPalette
        tool={tool}
        onToolChange={setTool}
        sources={sources}
        selectedSourceId={selectedSourceId}
        onSelectSource={setSelectedSourceId}
        onDeleteSource={deleteSource}
        walls={walls}
        onDeleteWall={deleteWall}
      />

      <SimulationCanvas
        grid={grid}
        tool={tool}
        sources={sources}
        walls={walls}
        selectedSourceId={selectedSourceId}
        running={running}
        stepsPerFrame={stepsPerFrame}
        damping={damping}
        gain={gain}
        wallAlpha={wallAlpha}
        alphaThreshold={alphaThreshold}
        gamma={gamma}
        scaleMode={scaleMode}
        dbFloor={dbFloor}
        showGrid={showGrid}
        resetSignal={resetSignal}
        onAddSource={addSource}
        onSelectSource={setSelectedSourceId}
        onAddWall={addWall}
        onDeleteSource={deleteSource}
        onDeleteWall={deleteWall}
        sitePlan={sitePlan}
        segmentedMasks={segmentedMasks}
        showSegmentationOverlay={showSegmentationOverlay}
        segmentationOpacity={segmentationOpacity}
        captureRef={captureRef}
      />

      <div style={{ gridRow: "2", borderLeft: "1px solid var(--border)", overflow: "auto" }}>
        <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
              marginBottom: 8,
            }}
          >
            Site plan
          </div>
          <SitePlanPanel
            state={sitePlan}
            onFileSelect={handleFileSelect}
            onCalibrationChange={handleCalibrationChange}
            onOpacityChange={handleOpacityChange}
            onToggleVisible={handleToggleVisible}
            onAutoSegment={handleAutoSegment}
            onClearSegmentation={handleClearSegmentation}
            segmenting={segmenting}
            domainWidthMeters={domainWidthMeters}
            onDomainWidthChange={setDomainWidthMeters}
            cropAspect={cropAspect}
            showSegmentationOverlay={showSegmentationOverlay}
            onShowSegmentationOverlayChange={setShowSegmentationOverlay}
            segmentationOpacity={segmentationOpacity}
            onSegmentationOpacityChange={setSegmentationOpacity}
          />
        </div>
        <ParameterPanel
          grid={grid}
          dxMeters={dxMeters}
          onDxChange={setDxMeters}
          stepsPerFrame={stepsPerFrame}
          onStepsPerFrameChange={setStepsPerFrame}
          damping={damping}
          onDampingChange={setDamping}
          gain={gain}
          onGainChange={setGain}
          scaleMode={scaleMode}
          onScaleModeChange={setScaleMode}
          dbFloor={dbFloor}
          onDbFloorChange={setDbFloor}
          wallAlpha={wallAlpha}
          onWallAlphaChange={setWallAlpha}
          alphaThreshold={alphaThreshold}
          onAlphaThresholdChange={setAlphaThreshold}
          gamma={gamma}
          onGammaChange={setGamma}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
          selectedSource={selectedSource}
          onUpdateSource={updateSource}
        />
      </div>
    </div>
  );
}
