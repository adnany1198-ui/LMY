/**
 * Grid — owns the mapping between real-world metres, grid cells, and
 * simulation time. All FDTD parameters flow from here so that coordinate
 * transforms, the shader's Courant number, and the time advance stay in
 * lockstep.
 */

export const SPEED_OF_SOUND_MPS = 343; // 20°C, dry air

export interface GridConfig {
  /** width of simulated domain in metres */
  widthMeters: number;
  /** height of simulated domain in metres */
  heightMeters: number;
  /** grid cell size in metres (dx = dy) */
  dxMeters: number;
  /** Courant number; stability requires <= 1/sqrt(2) ≈ 0.707 */
  courant: number;
  /** speed of sound in m/s */
  speedOfSound: number;
}

export class Grid {
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly dx: number;
  readonly courant: number;
  readonly c: number;

  readonly width: number; // cells
  readonly height: number; // cells
  readonly dt: number; // seconds per timestep

  constructor(cfg: GridConfig) {
    if (cfg.courant > 1 / Math.SQRT2 + 1e-6) {
      throw new Error(
        `Courant number ${cfg.courant} exceeds 2D FDTD stability limit 1/sqrt(2).`,
      );
    }
    this.widthMeters = cfg.widthMeters;
    this.heightMeters = cfg.heightMeters;
    this.dx = cfg.dxMeters;
    this.courant = cfg.courant;
    this.c = cfg.speedOfSound;
    this.width = Math.max(8, Math.round(cfg.widthMeters / cfg.dxMeters));
    this.height = Math.max(8, Math.round(cfg.heightMeters / cfg.dxMeters));
    this.dt = (cfg.courant * cfg.dxMeters) / cfg.speedOfSound;
  }

  /** Maximum frequency resolvable with >= 5 cells per wavelength. */
  maxAccurateFrequencyHz(minCellsPerWavelength = 5): number {
    return this.c / (minCellsPerWavelength * this.dx);
  }

  /** Metres from origin → grid cell (floating point). */
  metersToCell(xMeters: number, yMeters: number): { x: number; y: number } {
    return {
      x: (xMeters / this.widthMeters) * this.width,
      y: (yMeters / this.heightMeters) * this.height,
    };
  }

  cellToMeters(cellX: number, cellY: number): { x: number; y: number } {
    return {
      x: (cellX / this.width) * this.widthMeters,
      y: (cellY / this.height) * this.heightMeters,
    };
  }
}
