import { expect, test } from "vitest";
import { easeOutBack, sampleShape } from "./PixelAssembly";

test("easeOutBack starts at 0, ends at 1 and overshoots a little on the way", () => {
  expect(easeOutBack(0)).toBeCloseTo(0);
  expect(easeOutBack(1)).toBeCloseTo(1);
  expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(easeOutBack))).toBeGreaterThan(1);
  expect(easeOutBack(-1)).toBeCloseTo(0);
  expect(easeOutBack(2)).toBeCloseTo(1);
});

test("sampleShape keeps only the opaque cells of the image, on the grid", () => {
  // 4 x 2 image: only the pixel at (2, 0) is opaque.
  const data = new Uint8ClampedArray(4 * 2 * 4);
  data.set([10, 20, 30, 255], (0 * 4 + 2) * 4);
  expect(sampleShape(data, 4, 2, 1)).toEqual([{ x: 2, y: 0, r: 10, g: 20, b: 30 }]);
  expect(sampleShape(data, 4, 2, 3)).toEqual([]); // the grid (0, 3) misses it
});
