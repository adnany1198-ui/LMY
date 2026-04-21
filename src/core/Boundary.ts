/**
 * Boundary mask — an RG8 texture where each cell is encoded as
 *   R = 255 : rigid Neumann wall (buildings, water surfaces)
 *   G = 0..255 : per-cell absorption in [0, 1] (tree cover, soft ground)
 *
 * Walls are drawn manually as axis-aligned rectangles in world metres, and
 * zones (e.g. tree cover from image segmentation) are provided as a
 * grid-sized absorption map. Both layers are composed into the final
 * interleaved RG buffer uploaded to the GPU.
 */

import type { Grid } from "./Grid";

export interface WallRect {
  id: string;
  /** axis-aligned rectangle in world metres */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

let _wallCounter = 0;
export function newWallId(): string {
  _wallCounter += 1;
  return `wall-${Date.now().toString(36)}-${_wallCounter}`;
}

export interface BoundaryBuildInput {
  /** Manual wall rectangles in world metres */
  walls: readonly WallRect[];
  /**
   * Optional grid-sized wall mask (255 = wall, 0 = air). Merged with the
   * manual walls via logical-or. Produced by image segmentation.
   */
  wallMask?: Uint8Array | null;
  /**
   * Optional grid-sized absorption map (0..255). Applied as-is to the G
   * channel. Wall cells are still treated as rigid regardless.
   */
  absorptionMask?: Uint8Array | null;
}

/**
 * Build the interleaved RG8 boundary buffer for the GPU.
 * Output length = grid.width * grid.height * 2.
 */
export function buildBoundaryMask(grid: Grid, input: BoundaryBuildInput): Uint8Array {
  const N = grid.width * grid.height;
  const out = new Uint8Array(N * 2);

  // 1) Seed from the segmented wall mask, if present
  if (input.wallMask && input.wallMask.length === N) {
    for (let i = 0; i < N; i++) {
      if (input.wallMask[i] > 127) out[i * 2] = 255;
    }
  }

  // 2) Overlay absorption mask
  if (input.absorptionMask && input.absorptionMask.length === N) {
    for (let i = 0; i < N; i++) {
      out[i * 2 + 1] = input.absorptionMask[i];
    }
  }

  // 3) Rasterise manual wall rectangles on top
  for (const w of input.walls) {
    const a = grid.metersToCell(Math.min(w.x0, w.x1), Math.min(w.y0, w.y1));
    const b = grid.metersToCell(Math.max(w.x0, w.x1), Math.max(w.y0, w.y1));

    const x0 = Math.max(0, Math.floor(a.x));
    const y0 = Math.max(0, Math.floor(a.y));
    const x1 = Math.min(grid.width - 1, Math.ceil(b.x));
    const y1 = Math.min(grid.height - 1, Math.ceil(b.y));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        out[(y * grid.width + x) * 2] = 255;
      }
    }
  }

  return out;
}
