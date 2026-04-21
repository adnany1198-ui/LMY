/**
 * SitePlanAnalysis — classify site-plan pixels by colour into acoustic
 * material zones, then downsample into grid-resolution wall and absorption
 * masks that the FDTD engine can consume.
 *
 * Classes:
 *   WALL   — desaturated grey rectangles on the masterplan (buildings)
 *   WATER  — blue lake surface (treated as wall + high reflectivity)
 *   TREE   — green canopy blobs (absorption ≈ 0.5)
 *   GROUND — cream/beige open areas (absorption ≈ 0.1)
 *   AIR    — anything else (absorption 0)
 *
 * Classification is per-pixel in HSL; downsampling aggregates a block of
 * image pixels into one grid cell. Majority vote for class; wall / water
 * override anything else because their acoustic effect is dominant.
 */

import type { Grid } from "./Grid";

export type PixelClass = "wall" | "water" | "tree" | "ground" | "air";

export interface SitePlanCalibration {
  /**
   * Axis-aligned rectangle within the image (pixel coords) that
   * corresponds to the full world domain (0..widthMeters, 0..heightMeters).
   * If omitted, the whole image is used.
   */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SegmentationResult {
  wallMask: Uint8Array; // 255 = wall
  absorptionMask: Uint8Array; // 0..255
  /** Per-class pixel counts (useful for UI feedback) */
  counts: Record<PixelClass, number>;
}

export interface SegmentationThresholds {
  /** Saturation below which a pixel is "grey" */
  greyMaxSaturation: number;
  /** Lightness range for wall grey */
  wallMinLight: number;
  wallMaxLight: number;
  /** Hue ranges (degrees) */
  waterHueMin: number;
  waterHueMax: number;
  waterMinSaturation: number;
  treeHueMin: number;
  treeHueMax: number;
  treeMinSaturation: number;
  /** Absorption values applied to each class */
  absorbTree: number; // 0..1
  absorbGround: number;
}

export const DEFAULT_THRESHOLDS: SegmentationThresholds = {
  greyMaxSaturation: 0.18,
  wallMinLight: 0.35,
  wallMaxLight: 0.8,
  waterHueMin: 180,
  waterHueMax: 250,
  waterMinSaturation: 0.15,
  treeHueMin: 60,
  treeHueMax: 170,
  treeMinSaturation: 0.12,
  absorbTree: 0.55,
  absorbGround: 0.1,
};

/** Convert sRGB (0..255) to HSL with h in degrees, s/l in 0..1. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255,
    G = g / 255,
    B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case R:
        h = ((G - B) / d) * 60 + (G < B ? 360 : 0);
        break;
      case G:
        h = ((B - R) / d) * 60 + 120;
        break;
      default:
        h = ((R - G) / d) * 60 + 240;
    }
  }
  return [h, s, l];
}

export function classifyPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  t: SegmentationThresholds,
): PixelClass {
  if (a < 16) return "air";
  const [h, s, l] = rgbToHsl(r, g, b);

  // Blue water first — strong signal on this plan
  if (h >= t.waterHueMin && h <= t.waterHueMax && s >= t.waterMinSaturation && l < 0.75) {
    return "water";
  }

  // Green tree cover
  if (h >= t.treeHueMin && h <= t.treeHueMax && s >= t.treeMinSaturation && l < 0.8) {
    return "tree";
  }

  // Grey buildings: low saturation, mid-range lightness
  if (s <= t.greyMaxSaturation && l >= t.wallMinLight && l <= t.wallMaxLight) {
    return "wall";
  }

  // Cream/beige ground: warm low-saturation bright pixels
  if (l > 0.75 && s < 0.35) return "ground";
  if (l > 0.6 && s < 0.25 && h > 20 && h < 80) return "ground";

  return "air";
}

/**
 * Segment an ImageData into grid-resolution masks. Each grid cell samples
 * a block of image pixels; the class with the most votes wins. Wall and
 * water force the cell to wall (water is a hard reflector on this plan).
 */
export function segmentSitePlan(
  img: ImageData,
  grid: Grid,
  calibration: SitePlanCalibration,
  thresholds: SegmentationThresholds = DEFAULT_THRESHOLDS,
): SegmentationResult {
  const wallMask = new Uint8Array(grid.width * grid.height);
  const absorptionMask = new Uint8Array(grid.width * grid.height);
  const counts: Record<PixelClass, number> = {
    wall: 0,
    water: 0,
    tree: 0,
    ground: 0,
    air: 0,
  };

  const { x0, y0, x1, y1 } = calibration;
  const regionW = x1 - x0;
  const regionH = y1 - y0;
  if (regionW <= 0 || regionH <= 0) {
    return { wallMask, absorptionMask, counts };
  }

  const pxPerCellX = regionW / grid.width;
  const pxPerCellY = regionH / grid.height;

  // Sample budget per cell: at most ~16 samples regardless of grid/image ratio.
  const sampleStrideX = Math.max(1, Math.floor(pxPerCellX / 4));
  const sampleStrideY = Math.max(1, Math.floor(pxPerCellY / 4));

  const data = img.data;
  const imgW = img.width;

  const votes = new Int32Array(5); // indexed by PixelClass order below
  const CLASS_AT: PixelClass[] = ["wall", "water", "tree", "ground", "air"];
  const CLASS_IDX: Record<PixelClass, number> = {
    wall: 0,
    water: 1,
    tree: 2,
    ground: 3,
    air: 4,
  };

  for (let gy = 0; gy < grid.height; gy++) {
    const imgYStart = y0 + gy * pxPerCellY;
    const imgYEnd = imgYStart + pxPerCellY;
    for (let gx = 0; gx < grid.width; gx++) {
      const imgXStart = x0 + gx * pxPerCellX;
      const imgXEnd = imgXStart + pxPerCellX;

      votes.fill(0);

      for (let py = Math.floor(imgYStart); py < imgYEnd; py += sampleStrideY) {
        if (py < 0 || py >= img.height) continue;
        const rowOff = py * imgW * 4;
        for (let px = Math.floor(imgXStart); px < imgXEnd; px += sampleStrideX) {
          if (px < 0 || px >= imgW) continue;
          const i = rowOff + px * 4;
          const cls = classifyPixel(data[i], data[i + 1], data[i + 2], data[i + 3], thresholds);
          votes[CLASS_IDX[cls]] += 1;
        }
      }

      // Pick winner; wall/water dominate if they have any meaningful count
      let winnerIdx = 4;
      let best = -1;
      for (let k = 0; k < 5; k++) {
        if (votes[k] > best) {
          best = votes[k];
          winnerIdx = k;
        }
      }
      const winner = CLASS_AT[winnerIdx];
      counts[winner] += 1;

      const cellIdx = gy * grid.width + gx;
      if (winner === "wall" || winner === "water") {
        wallMask[cellIdx] = 255;
        absorptionMask[cellIdx] = 0;
      } else if (winner === "tree") {
        absorptionMask[cellIdx] = Math.round(thresholds.absorbTree * 255);
      } else if (winner === "ground") {
        absorptionMask[cellIdx] = Math.round(thresholds.absorbGround * 255);
      } else {
        absorptionMask[cellIdx] = 0;
      }
    }
  }

  return { wallMask, absorptionMask, counts };
}

/** Load an image URL/file into a canvas and return its ImageData. */
export async function loadImageData(src: string | File | Blob): Promise<{
  image: HTMLImageElement;
  imageData: ImageData;
}> {
  const url =
    typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D context unavailable");
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { image, imageData };
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}
