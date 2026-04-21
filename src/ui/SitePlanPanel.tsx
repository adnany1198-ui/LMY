import { useCallback, useRef } from "react";
import { ImageCropBox } from "./ImageCropBox";
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
  domainWidthMeters: number;
  onDomainWidthChange: (v: number) => void;
  cropAspect: number;
  showSegmentationOverlay: boolean;
  onShowSegmentationOverlayChange: (v: boolean) => void;
  segmentationOpacity: number;
  onSegmentationOpacityChange: (v: number) => void;
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

          {cal && p.state.imageUrl && (
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
                Crop to world domain
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                Drag the rectangle or its handles to crop the image to the
                0..{Math.round(p.state.imageWidth && p.state.imageHeight ? 300 : 0)} m
                domain. Exclude the legend and margins.
              </div>
              <ImageCropBox
                imageUrl={p.state.imageUrl}
                imageWidth={p.state.imageWidth}
                imageHeight={p.state.imageHeight}
                calibration={cal}
                onChange={p.onCalibrationChange}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  color: "var(--text-dim)",
                }}
              >
                <span>
                  {cal.x0}, {cal.y0}
                </span>
                <span>
                  {cal.x1}, {cal.y1}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{ flex: 1, fontSize: 11 }}
                  onClick={() =>
                    updateCal({
                      x0: 0,
                      y0: 0,
                      x1: p.state.imageWidth,
                      y1: p.state.imageHeight,
                    })
                  }
                >
                  Full image
                </button>
                <button
                  style={{ flex: 1, fontSize: 11 }}
                  onClick={() =>
                    updateCal({
                      x0: 0,
                      y0: 0,
                      x1: Math.round(p.state.imageWidth * 0.72),
                      y1: p.state.imageHeight,
                    })
                  }
                >
                  Drop legend
                </button>
              </div>
            </div>
          )}

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
              Domain scale
            </div>
            <label>
              Width: <span className="mono">{p.domainWidthMeters} m</span>
              <input
                type="range"
                min={20}
                max={800}
                step={5}
                value={p.domainWidthMeters}
                onChange={(e) => p.onDomainWidthChange(parseFloat(e.target.value))}
              />
            </label>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Height (from crop): {(p.domainWidthMeters / p.cropAspect).toFixed(1)} m · aspect{" "}
              {p.cropAspect.toFixed(3)}
            </div>
          </div>

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
            <>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={p.showSegmentationOverlay}
                  onChange={(e) => p.onShowSegmentationOverlayChange(e.target.checked)}
                />
                <span>Show segmentation overlay</span>
              </label>
              <label>
                Overlay opacity:{" "}
                <span className="mono">{p.segmentationOpacity.toFixed(2)}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={p.segmentationOpacity}
                  onChange={(e) =>
                    p.onSegmentationOpacityChange(parseFloat(e.target.value))
                  }
                />
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 4,
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  color: "var(--text-dim)",
                }}
              >
                <LegendSwatch color="rgb(230,230,230)" label="wall" />
                <LegendSwatch color="rgb(50,140,230)" label="water" />
                <LegendSwatch color="rgb(70,170,90)" label="tree" />
                <LegendSwatch color="rgb(200,170,120)" label="ground" />
              </div>
              <button onClick={p.onClearSegmentation}>Clear segmentation</button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          width: 10,
          height: 10,
          background: color,
          border: "1px solid var(--border)",
        }}
      />
      <span>{label}</span>
    </div>
  );
}
