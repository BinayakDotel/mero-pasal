import { describe, expect, it } from "vitest";
import { clampView, DOUBLE_TAP_ZOOM, doubleTap, MAX_ZOOM, RESET } from "./zoom";

describe("photo zoom (F-08)", () => {
  it("double-tap zooms in around the point, and out again", () => {
    const zoomed = doubleTap(RESET, 50, -20, 400, 600);
    expect(zoomed.scale).toBe(DOUBLE_TAP_ZOOM);
    expect(zoomed.x).toBeLessThan(0); // tapped right of centre → photo moves left
    expect(zoomed.y).toBeGreaterThan(0);
    expect(doubleTap(zoomed, 0, 0, 400, 600)).toEqual(RESET);
  });

  it("never scales outside 1…MAX_ZOOM or pans past an edge", () => {
    expect(clampView({ scale: 9, x: 0, y: 0 }, 400, 600).scale).toBe(MAX_ZOOM);
    expect(clampView({ scale: 0.3, x: 50, y: 50 }, 400, 600)).toEqual(RESET);
    expect(clampView({ scale: 2, x: 999, y: -999 }, 400, 600)).toEqual({
      scale: 2,
      x: 200,
      y: -300,
    });
  });
});
