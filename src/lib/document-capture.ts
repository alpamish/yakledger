// Client-side document edge detection, perspective crop/straighten and image
// compression for the ID capture flow. Pure geometry helpers (convexHull,
// approxPolyDP, getPerspectiveTransform, ...) are unit-testable without a DOM.

export interface Point {
  x: number;
  y: number;
}

// Ordered as [top-left, top-right, bottom-right, bottom-left].
export type Quad = [Point, Point, Point, Point];

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Signed shoelace area; returns the absolute value. */
export function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/** Andrew's monotone chain convex hull (counter-clockwise, no duplicate endpoint). */
export function convexHull(points: Point[]): Point[] {
  const pts = points
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 1) return pts;

  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Douglas-Peucker on an open chain (first and last points are kept). */
export function approxPolyDP(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = -1;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = approxPolyDP(points.slice(0, index + 1), epsilon);
    const right = approxPolyDP(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

/** Douglas-Peucker on a closed contour. */
export function approxPolyDPClosed(contour: Point[], epsilon: number): Point[] {
  if (contour.length < 4) return contour.slice();
  // Split the contour at the two farthest points, simplify each chain.
  let maxD = -1;
  let a = 0;
  let b = 0;
  for (let i = 0; i < contour.length; i++) {
    for (let j = i + 1; j < contour.length; j++) {
      const d = distance(contour[i], contour[j]);
      if (d > maxD) {
        maxD = d;
        a = i;
        b = j;
      }
    }
  }
  const chain1: Point[] = [];
  const chain2: Point[] = [];
  for (let i = a; ; i = (i + 1) % contour.length) {
    chain1.push(contour[i]);
    if (i === b) break;
  }
  for (let i = b; ; i = (i + 1) % contour.length) {
    chain2.push(contour[i]);
    if (i === a) break;
  }
  const r1 = approxPolyDP(chain1, epsilon);
  const r2 = approxPolyDP(chain2, epsilon);
  return r1.concat(r2.slice(1, -1));
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return distance(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** Order any 4 points as [top-left, top-right, bottom-right, bottom-left]. */
export function orderQuad(points: Point[]): Quad | null {
  if (points.length !== 4) return null;
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = points
    .slice()
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // Ascending angle order yields TL, TR, BR, BL for a convex quad.
  return [sorted[0], sorted[1], sorted[2], sorted[3]];
}

export function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const t = M[col];
      M[col] = M[pivot];
      M[pivot] = t;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  const x = new Array(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x;
}

/**
 * Homography (3x3, row-major, h[8] === 1) mapping source points to destination
 * points. Solves the standard 8-unknown linear system.
 */
export function getPerspectiveTransform(src: Point[], dst: Point[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  const h = solveLinearSystem(A, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function invertMatrix3x3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ];
  return inv.map((v) => v / det);
}

/** Apply a 3x3 homography (row-major) to a point. */
export function applyHomography(m: number[], x: number, y: number): [number, number] {
  const d = m[6] * x + m[7] * y + m[8];
  if (Math.abs(d) < 1e-12) return [x, y];
  return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d];
}

// ---------------------------------------------------------------------------
// DOM-dependent helpers
// ---------------------------------------------------------------------------

export interface Size {
  w: number;
  h: number;
}

export function getSourceSize(source: CanvasImageSource): Size {
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth, h: source.naturalHeight };
  }
  if (source instanceof HTMLCanvasElement) {
    return { w: source.width, h: source.height };
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { w: source.width, h: source.height };
  }
  if (source instanceof HTMLVideoElement) {
    return { w: source.videoWidth, h: source.videoHeight };
  }
  return { w: 0, h: 0 };
}

/** Draw a source (image, canvas, video frame) onto a fresh canvas, optionally downscaled. */
export function sourceToCanvas(
  source: CanvasImageSource,
  maxDim?: number
): { canvas: HTMLCanvasElement; scale: number } {
  const { w, h } = getSourceSize(source);
  const scale = maxDim ? Math.min(1, maxDim / Math.max(w, h)) : 1;
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(source, 0, 0, cw, ch);
  return { canvas, scale };
}

export function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export async function fileToCanvas(file: File | Blob, maxDim?: number): Promise<HTMLCanvasElement> {
  const img = await loadImageFromFile(file);
  return sourceToCanvas(img, maxDim).canvas;
}

/**
 * Detect the four corners of the dominant rectangular document in `source`.
 * Corners are returned in the source's native pixel coordinates (or null when no
 * convincing quad is found).
 */
export async function detectDocumentCorners(
  source: CanvasImageSource
): Promise<Quad | null> {
  const { canvas, scale } = sourceToCanvas(source, 1200);
  const detected = detectOnCanvas(canvas);
  if (!detected) return null;
  return detected.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;
}

function detectOnCanvas(canvas: HTMLCanvasElement): Quad | null {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || width < 10 || height < 10) return null;

  const data = ctx.getImageData(0, 0, width, height).data;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  const edges = cannyEdgeMap(gray, width, height);
  const components = connectedComponents(edges, width, height);

  let best: { quad: Quad; score: number } | null = null;
  for (const comp of components) {
    if (comp.length < width * height * 0.005) continue;
    const hull = convexHull(comp);
    if (hull.length < 4) continue;
    const perimeter = hull.reduce((s, p, i) => s + distance(p, hull[(i + 1) % hull.length]), 0);
    let epsilon = perimeter * 0.02;
    let poly = approxPolyDPClosed(hull, epsilon);
    let guard = 0;
    while (poly.length > 8 && guard < 12) {
      epsilon *= 1.6;
      poly = approxPolyDPClosed(hull, epsilon);
      guard++;
    }
    const candidates: Quad[] = [];
    if (poly.length === 4) {
      const q = orderQuad(poly);
      if (q) candidates.push(q);
    } else if (poly.length > 4 && poly.length <= 12) {
      for (const combo of combinations(poly, 4)) {
        const q = orderQuad(combo);
        if (q) candidates.push(q);
      }
    }
    for (const q of candidates) {
      const score = scoreQuad(q, width, height);
      if (score > 0 && (!best || score > best.score)) {
        best = { quad: q, score };
      }
    }
  }

  if (!best) return null;
  // The "quad" covering the entire frame is not a document; the user fills the
  // frame, so there is nothing meaningful to crop.
  const q = best.quad;
  const touchesEveryEdge =
    q.every((p) => p.x < width * 0.01 || p.x > width * 0.99) &&
    q.every((p) => p.y < height * 0.01 || p.y > height * 0.99);
  if (touchesEveryEdge && best.score > 0.85) return null;
  return q;
}

function scoreQuad(q: Quad, width: number, height: number): number {
  const area = polygonArea(q);
  const areaFraction = area / (width * height);
  if (areaFraction < 0.08 || area <= 0) return -1;

  const edges = [
    distance(q[0], q[1]),
    distance(q[1], q[2]),
    distance(q[2], q[3]),
    distance(q[3], q[0]),
  ];
  if (Math.min(...edges) < 0.06 * Math.max(width, height)) return -1;

  const angleAt = (a: Point, b: Point, c: Point) => {
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const len = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
    if (len === 0) return 90;
    return (Math.acos(Math.max(-1, Math.min(1, dot / len))) * 180) / Math.PI;
  };
  const angles = [
    angleAt(q[3], q[0], q[1]),
    angleAt(q[0], q[1], q[2]),
    angleAt(q[1], q[2], q[3]),
    angleAt(q[2], q[3], q[0]),
  ];
  const avgDeviation = angles.reduce((s, a) => s + Math.abs(a - 90), 0) / 4;
  if (avgDeviation > 30) return -1;

  return areaFraction * (1 / (1 + avgDeviation * 0.1));
}

function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === k) {
      out.push(chosen.map((i) => items[i]));
      return;
    }
    for (let i = start; i <= items.length - (k - chosen.length); i++) {
      pick(i + 1, [...chosen, i]);
    }
  };
  pick(0, []);
  return out;
}

function cannyEdgeMap(gray: Float32Array, width: number, height: number): Uint8Array {
  const blurred = boxBlur(gray, width, height, 2);
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  const mag = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      gx[i] =
        -blurred[i - width - 1] -
        2 * blurred[i - 1] -
        blurred[i + width - 1] +
        blurred[i - width + 1] +
        2 * blurred[i + 1] +
        blurred[i + width + 1];
      gy[i] =
        -blurred[i - width - 1] -
        2 * blurred[i - width] -
        blurred[i - width + 1] +
        blurred[i + width - 1] +
        2 * blurred[i + width] +
        blurred[i + width + 1];
      mag[i] = Math.hypot(gx[i], gy[i]);
    }
  }

  // Non-maximum suppression along the gradient direction.
  const nms = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const angle = (Math.atan2(gy[i], gx[i]) * 180) / Math.PI;
      const a = ((angle % 180) + 180) % 180;
      let n1: number;
      let n2: number;
      if (a < 22.5 || a >= 157.5) {
        n1 = i - 1;
        n2 = i + 1;
      } else if (a < 67.5) {
        n1 = i - width - 1;
        n2 = i + width + 1;
      } else if (a < 112.5) {
        n1 = i - width;
        n2 = i + width;
      } else {
        n1 = i + width - 1;
        n2 = i - width + 1;
      }
      const m = mag[i];
      if (m >= mag[n1] && m >= mag[n2]) nms[i] = m;
    }
  }

  let maxNms = 0;
  for (let i = 0; i < nms.length; i++) if (nms[i] > maxNms) maxNms = nms[i];
  if (maxNms <= 1) return new Uint8Array(width * height);

  const hist = new Uint32Array(256);
  const scale = 255 / maxNms;
  for (let i = 0; i < nms.length; i++) {
    hist[Math.min(255, (nms[i] * scale) | 0)]++;
  }
  const otsu = otsuThreshold(hist);
  const high = Math.max((otsu * maxNms) / 255, maxNms * 0.05);
  const low = high * 0.4;

  const edges = new Uint8Array(width * height);
  const weak = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) {
      edges[i] = 1;
      stack.push(i);
    } else if (nms[i] >= low) {
      weak[i] = 1;
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (weak[ni] && !edges[ni]) {
          edges[ni] = 1;
          stack.push(ni);
        }
      }
    }
  }
  return edges;
}

function otsuThreshold(hist: Uint32Array): number {
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
    sum += i * hist[i];
  }
  if (total === 0) return 1;
  let sumB = 0;
  let wB = 0;
  let maxVariance = -1;
  let best = 1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVariance) {
      maxVariance = between;
      best = t;
    }
  }
  return best;
}

function connectedComponents(edges: Uint8Array, width: number, height: number): Point[][] {
  const visited = new Uint8Array(width * height);
  const components: Point[][] = [];
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] !== 1 || visited[i]) continue;
    const comp: Point[] = [];
    const stack = [i];
    visited[i] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx / width) | 0;
      comp.push({ x, y });
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (edges[ni] === 1 && !visited[ni]) {
            visited[ni] = 1;
            stack.push(ni);
          }
        }
      }
    }
    components.push(comp);
  }
  return components;
}

function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const horiz = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < radius; x++) sum += src[y * width + x];
    for (let x = 0; x < width; x++) {
      const x0 = x - radius;
      const x1 = x + radius;
      if (x0 >= 0) sum -= src[y * width + x0];
      if (x1 < width) sum += src[y * width + x1];
      horiz[y * width + x] = sum / (2 * radius + 1);
    }
  }
  const out = new Float32Array(src.length);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < radius; y++) sum += horiz[y * width + x];
    for (let y = 0; y < height; y++) {
      const y0 = y - radius;
      const y1 = y + radius;
      if (y0 >= 0) sum -= horiz[y0 * width + x];
      if (y1 < height) sum += horiz[y1 * width + x];
      out[y * width + x] = sum / (2 * radius + 1);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Crop / straighten / compress
// ---------------------------------------------------------------------------

export interface CropOptions {
  /** Cap on the longer output edge in pixels (default 1200, matching the server). */
  maxDim?: number;
  /** Source pixels at or below this size are not further downscaled (default 2600). */
  sourceMaxDim?: number;
}

/**
 * Warp the region inside `corners` (source-native coordinates) into a
 * straight, cropped canvas. Returns the perspective-corrected result.
 */
export function cropDocumentToCanvas(
  source: CanvasImageSource,
  corners: Quad,
  opts: CropOptions = {}
): HTMLCanvasElement {
  const maxDim = opts.maxDim ?? 1200;
  const { canvas: src, scale } = sourceToCanvas(source, opts.sourceMaxDim ?? 2600);
  const sw = src.width;
  const sh = src.height;
  const scaledCorners = corners.map((p) => ({ x: p.x * scale, y: p.y * scale })) as Quad;

  const ctx = src.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    const fallback = document.createElement("canvas");
    return fallback;
  }
  const srcData = ctx.getImageData(0, 0, sw, sh).data;

  const w1 = distance(scaledCorners[0], scaledCorners[1]);
  const w2 = distance(scaledCorners[3], scaledCorners[2]);
  const h1 = distance(scaledCorners[0], scaledCorners[3]);
  const h2 = distance(scaledCorners[1], scaledCorners[2]);
  const outW = Math.max(1, Math.min(maxDim, Math.round(Math.max(w1, w2))));
  const outH = Math.max(1, Math.min(maxDim, Math.round(Math.max(h1, h2))));

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d")!;

  const homography = getPerspectiveTransform(scaledCorners, [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ]);
  const inv = homography ? invertMatrix3x3(homography) : null;
  if (!inv) {
    octx.drawImage(src, 0, 0, sw, sh, 0, 0, outW, outH);
    return out;
  }

  const outData = octx.createImageData(outW, outH);
  const oData = outData.data;
  const clampEdge = (v: number, max: number) => Math.min(max, Math.max(0, v));

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = applyHomography(inv, x + 0.5, y + 0.5);
      if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const p00 = (y0 * sw + x0) * 4;
      const p10 = (y0 * sw + x1) * 4;
      const p01 = (y1 * sw + x0) * 4;
      const p11 = (y1 * sw + x1) * 4;
      const o = (y * outW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v =
          srcData[p00 + c] * (1 - fx) * (1 - fy) +
          srcData[p10 + c] * fx * (1 - fy) +
          srcData[p01 + c] * (1 - fx) * fy +
          srcData[p11 + c] * fx * fy;
        oData[o + c] = clampEdge(Math.round(v), 255);
      }
      oData[o + 3] = 255;
    }
  }
  octx.putImageData(outData, 0, 0);
  return out;
}

/** Compress a canvas to a JPEG File, keeping ID text readable (quality 0.85). */
export function canvasToJpegFile(
  canvas: HTMLCanvasElement,
  filename: string,
  quality = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to compress image"));
          return;
        }
        resolve(new File([blob], filename, { type: "image/jpeg", lastModified: Date.now() }));
      },
      "image/jpeg",
      quality
    );
  });
}
