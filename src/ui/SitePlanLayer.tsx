import type { SitePlanCalibration } from "../core/SitePlanAnalysis";

interface Props {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  calibration: SitePlanCalibration | null;
  originX: number;
  originY: number;
  widthPx: number;
  heightPx: number;
  opacity: number;
}

/**
 * Background layer that renders the site plan image behind the FDTD
 * canvas. The image is positioned so its calibrated region (x0,y0)→(x1,y1)
 * maps exactly onto the simulation world rect at (originX, originY)–
 * (originX+widthPx, originY+heightPx).
 */
export function SitePlanLayer({
  imageUrl,
  imageWidth,
  imageHeight,
  calibration,
  originX,
  originY,
  widthPx,
  heightPx,
  opacity,
}: Props) {
  if (!imageUrl || !calibration || !imageWidth || !imageHeight) return null;

  const regionW = calibration.x1 - calibration.x0;
  const regionH = calibration.y1 - calibration.y0;
  if (regionW <= 0 || regionH <= 0) return null;

  const scaleX = widthPx / regionW;
  const scaleY = heightPx / regionH;
  const renderedW = imageWidth * scaleX;
  const renderedH = imageHeight * scaleY;
  const offsetX = -calibration.x0 * scaleX;
  const offsetY = -calibration.y0 * scaleY;

  return (
    <div
      style={{
        position: "absolute",
        left: originX,
        top: originY,
        width: widthPx,
        height: heightPx,
        overflow: "hidden",
        opacity,
        pointerEvents: "none",
      }}
    >
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: offsetX,
          top: offsetY,
          width: renderedW,
          height: renderedH,
          imageRendering: "auto",
        }}
      />
    </div>
  );
}
