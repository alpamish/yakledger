import { describe, it, expect } from "vitest";
import {
  polygonArea,
  convexHull,
  approxPolyDP,
  approxPolyDPClosed,
  orderQuad,
  solveLinearSystem,
  getPerspectiveTransform,
  invertMatrix3x3,
  applyHomography,
  distance,
  type Point,
} from "@/lib/document-capture";

const sq = (n: number): Point[] => [
  { x: 0, y: 0 },
  { x: n, y: 0 },
  { x: n, y: n },
  { x: 0, y: n },
];

describe("polygonArea", () => {
  it("computes the shoelace area of a square", () => {
    expect(polygonArea(sq(10))).toBeCloseTo(100, 6);
  });

  it("is orientation independent", () => {
    expect(polygonArea(sq(10).reverse())).toBeCloseTo(100, 6);
  });
});

describe("convexHull", () => {
  it("reduces interior points to the enclosing corners", () => {
    const points = [
      { x: 5, y: 5 },
      { x: 2, y: 6 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(4);
    for (const corner of sq(10)) {
      expect(hull.some((p) => p.x === corner.x && p.y === corner.y)).toBe(true);
    }
  });
});

describe("approxPolyDP", () => {
  it("collapses a near-straight chain to its endpoints", () => {
    const chain = [
      { x: 0, y: 0 },
      { x: 1, y: 0.1 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const simplified = approxPolyDP(chain, 0.5);
    expect(simplified).toHaveLength(2);
  });

  it("keeps the bulge when it exceeds epsilon", () => {
    const chain = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 0 },
    ];
    const simplified = approxPolyDP(chain, 0.5);
    expect(simplified).toHaveLength(3);
  });
});

describe("approxPolyDPClosed", () => {
  it("reduces a noisy rectangle to four corners", () => {
    const contour = [
      { x: 0, y: 0 },
      { x: 3, y: 0.2 },
      { x: 10, y: 0 },
      { x: 10, y: 2 },
      { x: 9.8, y: 10 },
      { x: 4, y: 9.9 },
      { x: 0, y: 10 },
      { x: 0.1, y: 4 },
    ];
    const poly = approxPolyDPClosed(contour, 0.6);
    expect(poly).toHaveLength(4);
  });
});

describe("orderQuad", () => {
  it("orders corners as TL, TR, BR, BL regardless of input order", () => {
    const shuffled = [sq(100)[3], sq(100)[1], sq(100)[0], sq(100)[2]];
    const ordered = orderQuad(shuffled)!;
    expect(ordered[0]).toEqual({ x: 0, y: 0 });
    expect(ordered[1]).toEqual({ x: 100, y: 0 });
    expect(ordered[2]).toEqual({ x: 100, y: 100 });
    expect(ordered[3]).toEqual({ x: 0, y: 100 });
  });
});

describe("solveLinearSystem", () => {
  it("solves a small system", () => {
    const x = solveLinearSystem(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10]
    )!;
    expect(x[0]).toBeCloseTo(1, 6);
    expect(x[1]).toBeCloseTo(3, 6);
  });
});

describe("getPerspectiveTransform / applyHomography", () => {
  it("maps the source quad exactly onto the destination rect", () => {
    const src: Point[] = [
      { x: 10, y: 20 },
      { x: 190, y: 25 },
      { x: 195, y: 140 },
      { x: 15, y: 130 },
    ];
    const dst: Point[] = [
      { x: 0, y: 0 },
      { x: 180, y: 0 },
      { x: 180, y: 120 },
      { x: 0, y: 120 },
    ];
    const h = getPerspectiveTransform(src, dst)!;
    expect(h).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      const [X, Y] = applyHomography(h, src[i].x, src[i].y);
      expect(X).toBeCloseTo(dst[i].x, 4);
      expect(Y).toBeCloseTo(dst[i].y, 4);
    }
  });

  it("preserves straightness of midpoints under perspective", () => {
    const src: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const dst: Point[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ];
    const h = getPerspectiveTransform(src, dst)!;
    const [X, Y] = applyHomography(h, 50, 50);
    expect(X).toBeCloseTo(100, 4);
    expect(Y).toBeCloseTo(100, 4);
  });
});

describe("invertMatrix3x3", () => {
  it("inverts the identity matrix", () => {
    const inv = invertMatrix3x3([1, 0, 0, 0, 1, 0, 0, 0, 1])!;
    expect(inv.map((v) => Math.abs(v))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("H * H^-1 is identity", () => {
    const h = [2, 0.5, 3, 0.25, 1.5, -1, 0.05, 0.1, 1];
    const inv = invertMatrix3x3(h)!;
    const prod = Array.from({ length: 9 }, (_, i) => {
      const r = (i / 3) | 0;
      const c = i % 3;
      return h[0 + r * 3] * inv[c] + h[1 + r * 3] * inv[3 + c] + h[2 + r * 3] * inv[6 + c];
    });
    for (let i = 0; i < 9; i++) {
      const expected = i % 4 === 0 ? 1 : 0;
      expect(prod[i]).toBeCloseTo(expected, 6);
    }
  });
});

describe("distance", () => {
  it("computes euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});