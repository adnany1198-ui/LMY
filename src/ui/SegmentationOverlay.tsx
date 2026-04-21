import { useEffect, useRef } from "react";
import { CLASS_PREVIEW_RGBA, CODE_CLASS } from "../core/SitePlanAnalysis";

interface Props {
  width: number; // grid cells X
  height: number; // grid cells Y
  classMap: Uint8Array;
  originX: number;
  originY: number;
  widthPx: number;
  heightPx: number;
  opacity: number;
}

/**
 * Renders the per-cell class map as a colour-coded canvas (one pixel per
 * grid cell), then CSS-scales it to cover the world rect. Lets the user
 * verify segmentation quality before running the physics.
 */
export function SegmentationOverlay({
  width,
  height,
  classMap,
  originX,
  originY,
  widthPx,
  heightPx,
  opacity,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(width, height);
    const data = img.data;
    for (let i = 0; i < width * height; i++) {
      const cls = CODE_CLASS[classMap[i]] ?? "air";
      const rgba = CLASS_PREVIEW_RGBA[cls];
      const off = i * 4;
      data[off] = rgba[0];
      data[off + 1] = rgba[1];
      data[off + 2] = rgba[2];
      data[off + 3] = rgba[3];
    }
    ctx.putImageData(img, 0, 0);
  }, [width, height, classMap]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        left: originX,
        top: originY,
        width: widthPx,
        height: heightPx,
        opacity,
        imageRendering: "pixelated",
        pointerEvents: "none",
      }}
    />
  );
}
