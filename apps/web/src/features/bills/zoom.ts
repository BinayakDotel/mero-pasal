// F-08 photo zoom maths (pure, tested): double-tap toggles, pinch scales, drag pans; the photo
// never scales below 1 or above MAX_ZOOM and never pans past its own edges.

export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;

export type View = { scale: number; x: number; y: number };
export const RESET: View = { scale: 1, x: 0, y: 0 };

/** Keep the zoomed photo covering its box: a pan can't show past an edge. */
export function clampView(view: View, width: number, height: number): View {
  const scale = Math.min(Math.max(view.scale, 1), MAX_ZOOM);
  const maxX = ((scale - 1) * width) / 2;
  const maxY = ((scale - 1) * height) / 2;
  return {
    scale,
    x: Math.min(Math.max(view.x, -maxX), maxX),
    y: Math.min(Math.max(view.y, -maxY), maxY),
  };
}

/** Double-tap: zoom in around the tapped point (relative to the box centre), or back out. */
export function doubleTap(view: View, px: number, py: number, width: number, height: number): View {
  if (view.scale > 1) return RESET;
  return clampView(
    { scale: DOUBLE_TAP_ZOOM, x: -px * (DOUBLE_TAP_ZOOM - 1), y: -py * (DOUBLE_TAP_ZOOM - 1) },
    width,
    height,
  );
}
