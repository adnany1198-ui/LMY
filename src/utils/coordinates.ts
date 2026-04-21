/**
 * Viewport transform: maps between world metres, canvas CSS pixels, and
 * screen pixels once pan + zoom are applied. Origin is top-left of the
 * world rectangle; y increases downward (matches image/SVG convention).
 */

export interface Viewport {
  /** width of world domain in metres */
  worldWidth: number;
  /** height of world domain in metres */
  worldHeight: number;
  /** width of canvas container in CSS pixels */
  containerWidth: number;
  /** height of canvas container in CSS pixels */
  containerHeight: number;
  /** zoom multiplier (1 = fit to container) */
  zoom: number;
  /** pan offset in CSS pixels */
  panX: number;
  panY: number;
}

/** CSS pixels per metre at the current zoom. */
export function pixelsPerMeter(v: Viewport): number {
  const fit = Math.min(v.containerWidth / v.worldWidth, v.containerHeight / v.worldHeight);
  return fit * v.zoom;
}

/** Size of the world rect on screen at the current zoom, in CSS pixels. */
export function worldScreenSize(v: Viewport): { width: number; height: number } {
  const ppm = pixelsPerMeter(v);
  return { width: v.worldWidth * ppm, height: v.worldHeight * ppm };
}

/** World rect origin on screen (top-left in CSS pixels). */
export function worldScreenOrigin(v: Viewport): { x: number; y: number } {
  const { width, height } = worldScreenSize(v);
  return {
    x: (v.containerWidth - width) / 2 + v.panX,
    y: (v.containerHeight - height) / 2 + v.panY,
  };
}

export function worldToScreen(v: Viewport, x: number, y: number): { x: number; y: number } {
  const ppm = pixelsPerMeter(v);
  const origin = worldScreenOrigin(v);
  return { x: origin.x + x * ppm, y: origin.y + y * ppm };
}

export function screenToWorld(
  v: Viewport,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  const ppm = pixelsPerMeter(v);
  const origin = worldScreenOrigin(v);
  return { x: (screenX - origin.x) / ppm, y: (screenY - origin.y) / ppm };
}

/** Zoom around a screen-space anchor point, preserving the world point under it. */
export function zoomAt(v: Viewport, screenX: number, screenY: number, factor: number): Viewport {
  const before = screenToWorld(v, screenX, screenY);
  const next: Viewport = { ...v, zoom: Math.max(0.2, Math.min(20, v.zoom * factor)) };
  const after = worldToScreen(next, before.x, before.y);
  return { ...next, panX: next.panX + (screenX - after.x), panY: next.panY + (screenY - after.y) };
}
