import { useCallback, useRef } from "react";
import type { SitePlanCalibration, SitePlanState } from "./siteplan-state";

interface Props {
  state: SitePlanState;
  onFileSelect: (file: File) => void;
  onCalibrationChange: (c: SitePlanCalibration) => void;
  onOpacityChange: (v: number) => void;
  onToggleVisible: (v: boolean) => void;
  onAutoSegment: () => void;
  onClearSegmentation: () => void;
  segmenting: boolean;
}

/**
 * UI for importing a site-plan image, calibrating its world extent, and
 * running auto-segmentation to produce boundary/absorption masks.
 */
export function SitePlanPanel(p: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) p.onFileSelect(f);
    },
    [p],
  );

  const cal = p.state.calibration;
  const imageLoaded = !!p.state.imageUrl;

  const updateCal = (patch: Partial<SitePlanCalibration>) => {
    if (!cal) return;
    p.onCalibrationChange({ ...cal, ...patch });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: "none" }}
      />

      <button onClick={() => fileRef.current?.click()}>
        {imageLoaded ? "Replace site plan…" : "Load site plan image…"}
      </button>

      {imageLoaded && (
        <>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            Image: {p.state.imageWidth} × {p.state.imageHeight} px
          </div>

          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={p.state.visible}
              onChange={(e) => p.onToggleVisible(e.target.checked)}
            />
            <span>Show background</span>
          </label>

          <label>
            Opacity: <span className="mono">{p.state.opacity.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={p.state.opacity}
              onChange={(e) => p.onOpacityChange(parseFloat(e.target.value))}
            />
          </label>

          {cal && (
            <div
              style={{
                border: "1px solid var(--border)",
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 6,
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
                Calibration (image px → world)
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                Crop the image to the rect that corresponds to the 0..W × 0..H m
                domain. Exclude the legend panel.
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                }}
              >
                <label>
                  x0
                  <input
                    type="number"
                    value={cal.x0}
                    onChange={(e) => updateCal({ x0: parseInt(e.target.value || "0", 10) })}
                  />
                </label>
                <label>
                  y0
                  <input
                    type="number"
                    value={cal.y0}
                    onChange={(e) => updateCal({ y0: parseInt(e.target.value || "0", 10) })}
                  />
                </label>
                <label>
                  x1
                  <input
                    type="number"
                    value={cal.x1}
                    onChange={(e) => updateCal({ x1: parseInt(e.target.value || "0", 10) })}
                  />
                </label>
                <label>
                  y1
                  <input
                    type="number"
                    value={cal.y1}
                    onChange={(e) => updateCal({ y1: parseInt(e.target.value || "0", 10) })}
                  />
                </label>
              </div>
            </div>
          )}

          <button onClick={p.onAutoSegment} disabled={p.segmenting} className="active">
            {p.segmenting ? "Segmenting…" : "Auto-segment → boundaries"}
          </button>

          {p.state.segmentationSummary && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-dim)",
                fontFamily: "var(--mono)",
                lineHeight: 1.5,
              }}
            >
              {p.state.segmentationSummary}
            </div>
          )}

          {p.state.hasSegmentation && (
            <button onClick={p.onClearSegmentation}>Clear segmentation</button>
          )}
        </>
      )}
    </div>
  );
}
