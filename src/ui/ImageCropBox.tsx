import { useCallback, useMemo, useRef, useState } from "react";
import type { SitePlanCalibration } from "./siteplan-state";

interface Props {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  calibration: SitePlanCalibration;
  onChange: (c: SitePlanCalibration) => void;
  maxWidth?: number;
  maxHeight?: number;
}

type DragMode =
  | { kind: "move"; startX: number; startY: number; initial: SitePlanCalibration }
  | {
      kind: "handle";
      handle: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
      initial: SitePlanCalibration;
    }
  | null;

/**
 * Interactive crop widget: shows the full image at a clamped display size,
 * overlays the calibration rect with 8 drag handles + move-inside-rect.
 * All coordinates map back to original image pixels.
 */
export function ImageCropBox({
  imageUrl,
  imageWidth,
  imageHeight,
  calibration,
  onChange,
  maxWidth = 260,
  maxHeight = 200,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragMode>(null);

  // Scale the image to fit the thumbnail while preserving aspect ratio
  const { displayW, displayH, scale } = useMemo(() => {
    if (!imageWidth || !imageHeight) return { displayW: 0, displayH: 0, scale: 1 };
    const s = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
    return {
      displayW: imageWidth * s,
      displayH: imageHeight * s,
      scale: s,
    };
  }, [imageWidth, imageHeight, maxWidth, maxHeight]);

  const rectX = calibration.x0 * scale;
  const rectY = calibration.y0 * scale;
  const rectW = (calibration.x1 - calibration.x0) * scale;
  const rectH = (calibration.y1 - calibration.y0) * scale;

  const screenToImage = useCallback(
    (sx: number, sy: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const x = (sx - rect.left) / scale;
      const y = (sy - rect.top) / scale;
      return { x, y };
    },
    [scale],
  );

  const clampCal = useCallback(
    (c: SitePlanCalibration): SitePlanCalibration => {
      const x0 = Math.max(0, Math.min(c.x0, imageWidth - 10));
      const y0 = Math.max(0, Math.min(c.y0, imageHeight - 10));
      const x1 = Math.max(x0 + 10, Math.min(c.x1, imageWidth));
      const y1 = Math.max(y0 + 10, Math.min(c.y1, imageHeight));
      return { x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1) };
    },
    [imageWidth, imageHeight],
  );

  const onPointerDown =
    (mode: DragMode) => (e: React.PointerEvent<SVGElement | HTMLDivElement>) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      if (mode?.kind === "move") {
        const p = screenToImage(e.clientX, e.clientY);
        setDrag({ kind: "move", startX: p.x, startY: p.y, initial: { ...calibration } });
      } else {
        setDrag(mode);
      }
    };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = screenToImage(e.clientX, e.clientY);

    if (drag.kind === "move") {
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      const w = drag.initial.x1 - drag.initial.x0;
      const h = drag.initial.y1 - drag.initial.y0;
      let x0 = drag.initial.x0 + dx;
      let y0 = drag.initial.y0 + dy;
      x0 = Math.max(0, Math.min(x0, imageWidth - w));
      y0 = Math.max(0, Math.min(y0, imageHeight - h));
      onChange(clampCal({ x0, y0, x1: x0 + w, y1: y0 + h }));
      return;
    }

    if (drag.kind === "handle") {
      let { x0, y0, x1, y1 } = drag.initial;
      if (drag.handle.includes("n")) y0 = p.y;
      if (drag.handle.includes("s")) y1 = p.y;
      if (drag.handle.includes("w")) x0 = p.x;
      if (drag.handle.includes("e")) x1 = p.x;
      if (x1 < x0 + 10) x1 = x0 + 10;
      if (y1 < y0 + 10) y1 = y0 + 10;
      onChange(clampCal({ x0, y0, x1, y1 }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    setDrag(null);
  };

  const handleSize = 8;
  type HandleKey = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
  const handles: { key: HandleKey; x: number; y: number; cursor: string }[] = [
    { key: "nw", x: rectX, y: rectY, cursor: "nwse-resize" },
    { key: "n", x: rectX + rectW / 2, y: rectY, cursor: "ns-resize" },
    { key: "ne", x: rectX + rectW, y: rectY, cursor: "nesw-resize" },
    { key: "e", x: rectX + rectW, y: rectY + rectH / 2, cursor: "ew-resize" },
    { key: "se", x: rectX + rectW, y: rectY + rectH, cursor: "nwse-resize" },
    { key: "s", x: rectX + rectW / 2, y: rectY + rectH, cursor: "ns-resize" },
    { key: "sw", x: rectX, y: rectY + rectH, cursor: "nesw-resize" },
    { key: "w", x: rectX, y: rectY + rectH / 2, cursor: "ew-resize" },
  ];

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "relative",
        width: displayW,
        height: displayH,
        background: "#0a0a0b",
        border: "1px solid var(--border)",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: displayW,
          height: displayH,
          pointerEvents: "none",
        }}
      />
      <svg
        width={displayW}
        height={displayH}
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        {/* Dimmed area outside calibration rect (four overlay strips) */}
        <mask id="cropMask">
          <rect x={0} y={0} width={displayW} height={displayH} fill="white" />
          <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="black" />
        </mask>
        <rect
          x={0}
          y={0}
          width={displayW}
          height={displayH}
          fill="rgba(0,0,0,0.55)"
          mask="url(#cropMask)"
          pointerEvents="none"
        />

        {/* Calibration rect body — drag to move */}
        <rect
          x={rectX}
          y={rectY}
          width={rectW}
          height={rectH}
          fill="transparent"
          stroke="var(--accent)"
          strokeWidth={1.2}
          style={{ cursor: "move" }}
          onPointerDown={onPointerDown({
            kind: "move",
            startX: 0,
            startY: 0,
            initial: calibration,
          } as DragMode)}
        />

        {handles.map((h) => (
          <rect
            key={h.key}
            x={h.x - handleSize / 2}
            y={h.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="var(--accent)"
            stroke="#000"
            strokeWidth={1}
            style={{ cursor: h.cursor }}
            onPointerDown={onPointerDown({
              kind: "handle",
              handle: h.key,
              initial: calibration,
            })}
          />
        ))}
      </svg>
    </div>
  );
}
