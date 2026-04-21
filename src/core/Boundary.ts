/**
 * Boundary mask — a single-channel texture where each cell is either
 * air (0) or rigid wall (1). Walls are drawn as rectangles in world
 * metres and rasterised into this mask, which is then uploaded to the
 * GPU for the FDTD shader to read.
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

/**
 * Rasterise walls into a Uint8Array of size grid.width * grid.height.
 * Cell value: 255 for wall, 0 for air.
 */
export function buildBoundaryMask(grid: Grid, walls: WallRect[]): Uint8Array {
  const mask = new Uint8Array(grid.width * grid.height);

  for (const w of walls) {
    const a = grid.metersToCell(Math.min(w.x0, w.x1), Math.min(w.y0, w.y1));
    const b = grid.metersToCell(Math.max(w.x0, w.x1), Math.max(w.y0, w.y1));

    const x0 = Math.max(0, Math.floor(a.x));
    const y0 = Math.max(0, Math.floor(a.y));
    const x1 = Math.min(grid.width - 1, Math.ceil(b.x));
    const y1 = Math.min(grid.height - 1, Math.ceil(b.y));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        mask[y * grid.width + x] = 255;
      }
    }
  }

  return mask;
}
