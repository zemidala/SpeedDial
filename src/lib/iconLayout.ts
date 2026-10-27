// How a site icon fills a tile in the "by the logo" style: what the icon is (a shape with a one-colour edge, a shape
// with a busy background, a logo on transparency, a photo) and where its drawing is. Pure pixel analysis, tested
// on its own; SiteIcon draws by the result
import {apcaContrast} from './color';

/**
 * seamless — a shape (square, circle) with a one-colour edge and a drawing inside: the tile takes the edge colour
 * and the icon merges into it; app — a shape with a busy edge (gradient, picture): shown whole on a blurred copy;
 * logo — a drawing on transparency, or a one-colour silhouette: on a plate of its colour; photo — a picture: covers
 */
export type LayoutKind = 'seamless' | 'app' | 'logo' | 'photo';

/** A rectangle in fractions of the image's width and height */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Plate = 'light' | 'dark';

export interface IconLayout {
  kind: LayoutKind;
  /** The edge colour (#rrggbb) — the tile's colour for a seamless icon */
  edgeColor: string;
  /** The edge's colours at the top and the bottom when they differ (GitHub's dark square is lighter at the top) */
  edgeGradient: [string, string] | null;
  /** A light edge (a white background, like VK's): in the dark theme such an icon stays on a plate */
  lightEdge: boolean;
  /** The visible part of the image */
  box: Box;
  /** The drawing: for a seamless icon — what differs from the edge colour; otherwise the visible part */
  contentBox: Box;
  /** Plates for a logo: a pale and a dark shade of its colour */
  plates: Record<Plate, string>;
  /** Which plate a logo stands on in the light and in the dark theme */
  plateFor: Record<Plate, Plate>;
  /**
   * The logo has a colour of its own, so its plates are shades of it. A colourless logo (GitHub's) would only get
   * a grey plate — a square a shade off the tile; on its own theme's side it stands on the tile itself
   */
  tinted: boolean;
}

/** Visible: more opaque than this */
const VISIBLE_ALPHA = 128;
/** Counted as solid paint */
const OPAQUE_ALPHA = 200;
/** A shape fills this much of its box (a circle — π/4) … */
const SHAPE_COVERAGE = 0.7;
/** … and this much of the band along the box's edge (an inscribed circle — about 0.35, a square — all of it) */
const SHAPE_EDGE = 0.3;
/** Width of that band, as a share of the shorter side */
const EDGE_BAND = 0.07;
/** A pixel is of the edge colour if it's closer to it than this (RGB distance, 0–441) */
const EDGE_DISTANCE = 24;
/** A one-colour edge: this share of the band is of the edge colour (a drawing may touch the edge here and there) */
const EDGE_SHARE = 0.7;
/** A drawing: pixels farther than this from the edge colour … */
const DRAWING_DISTANCE = 40;
/** … making up this share of the shape */
const DRAWING_SHARE = 0.03;
/** A silhouette: the whole edge band is one colour and there's no drawing */
const SILHOUETTE_EDGE_SHARE = 0.95;
/** A photo: this many distinct colours (5 bits per channel) and no colour taking more than PHOTO_TOP_SHARE */
const PHOTO_COLORS = 900;
const PHOTO_TOP_SHARE = 0.05;
/** Lc enough for a large shape without text: the theme's own plate is kept if it reaches this */
const PLATE_LC = 30;
/** Top and bottom edge colours closer than this (RGB distance) count as one colour */
const GRADIENT_DISTANCE = 6;
/** Edge lighter than this (relative luminance) is "light": white, but also pale blue like Reddit's — a glare among dark tiles */
const LIGHT_EDGE = 0.6;

type Rgb = [number, number, number];

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix = (a: Rgb, b: Rgb, amount: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * amount)) as Rgb;
const hex = (rgb: Rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * (r / 255) ** 2.2 + 0.7152 * (g / 255) ** 2.2 + 0.0722 * (b / 255) ** 2.2;
}

/** RGBA pixels of a size×size copy of the icon (drawn whole and centred). null — nothing visible */
export function analyzeLayout(data: Uint8ClampedArray, size: number): IconLayout | null {
  const at = (x: number, y: number): [number, number, number, number] => {
    const i = (y * size + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  // The visible part; a soft shadow around a shape (Google's circle) isn't part of it
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (at(x, y)[3] <= VISIBLE_ALPHA) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;
  const boxWidth = x1 - x0 + 1;
  const boxHeight = y1 - y0 + 1;
  const band = Math.max(2, Math.round(Math.min(boxWidth, boxHeight) * EDGE_BAND));

  // Paint in the box and along its edge; colours for the photo check; logo pixels for the plate
  let opaque = 0;
  let bandTotal = 0;
  const edge: Rgb[] = [];
  const edgeTop: Rgb[] = [];
  const edgeBottom: Rgb[] = [];
  const counts = new Map<number, number>();
  const logo: Rgb[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [r, g, b, a] = at(x, y);
      const inBand = x - x0 < band || x1 - x < band || y - y0 < band || y1 - y < band;
      if (inBand) bandTotal++;
      if (a <= OPAQUE_ALPHA) continue;
      opaque++;
      if (inBand) edge.push([r, g, b]);
      if (y - y0 < band) edgeTop.push([r, g, b]);
      if (y1 - y < band) edgeBottom.push([r, g, b]);
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      logo.push([r, g, b]);
    }
  }
  const shape = opaque / (boxWidth * boxHeight) >= SHAPE_COVERAGE && edge.length / bandTotal >= SHAPE_EDGE;

  const medianRgb = (pixels: Rgb[]): Rgb => [0, 1, 2].map((i) => median(pixels.map((p) => p[i]))) as Rgb;
  const edgeRgb: Rgb = edge.length > 0 ? medianRgb(edge) : [255, 255, 255];
  const topRgb = medianRgb(edgeTop);
  const bottomRgb = medianRgb(edgeBottom);
  const gradient = edgeTop.length > 0 && edgeBottom.length > 0 && distance(topRgb, bottomRgb) > GRADIENT_DISTANCE;
  const edgeShare = edge.length > 0 ? edge.filter((p) => distance(p, edgeRgb) <= EDGE_DISTANCE).length / edge.length : 0;

  // The drawing: paint unlike the edge colour
  let cx0 = size, cy0 = size, cx1 = -1, cy1 = -1, drawing = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const pixel = at(x, y);
      if (pixel[3] <= OPAQUE_ALPHA || distance(pixel, edgeRgb) <= DRAWING_DISTANCE) continue;
      drawing++;
      cx0 = Math.min(cx0, x);
      cy0 = Math.min(cy0, y);
      cx1 = Math.max(cx1, x);
      cy1 = Math.max(cy1, y);
    }
  }
  const hasDrawing = opaque > 0 && drawing / opaque >= DRAWING_SHARE;

  const full = opaque >= size * size * 0.95;
  const topShare = Math.max(...counts.values()) / opaque;
  const photo = full && counts.size >= PHOTO_COLORS && topShare < PHOTO_TOP_SHARE;

  let kind: LayoutKind;
  if (photo) kind = 'photo';
  else if (shape && edgeShare >= EDGE_SHARE && hasDrawing) kind = 'seamless';
  else if (shape && !(edgeShare >= SILHOUETTE_EDGE_SHARE && !hasDrawing)) kind = 'app';
  else kind = 'logo';

  // A logo's plate: a shade of its saturated colour (grey if it has none), pale or dark — whichever its pixels
  // stand out on more; the theme's own plate wins once it's enough
  const saturated = logo.filter(([r, g, b]) => {
    const max = Math.max(r, g, b);
    return max > 40 && (max - Math.min(r, g, b)) / max > 0.25;
  });
  const tinted = saturated.length > logo.length * 0.15;
  const hue: Rgb = tinted
    ? [0, 1, 2].map((i) => Math.round(saturated.reduce((sum, p) => sum + p[i], 0) / saturated.length)) as Rgb
    : [128, 128, 128];
  const plates: Record<Plate, Rgb> = {light: mix(hue, [255, 255, 255], 0.88), dark: mix(hue, [18, 20, 24], 0.86)};
  const sample = logo.filter((_, i) => i % 3 === 0);
  const score = (plate: Rgb) => median(sample.map((p) => Math.abs(apcaContrast(p, plate))));
  const scores = {light: score(plates.light), dark: score(plates.dark)};
  const choose = (own: Plate): Plate => {
    const other: Plate = own === 'light' ? 'dark' : 'light';
    return scores[own] >= PLATE_LC || scores[own] >= scores[other] ? own : other;
  };

  const box = (left: number, top: number, right: number, bottom: number): Box =>
    ({x: left / size, y: top / size, w: (right - left + 1) / size, h: (bottom - top + 1) / size});
  const visible = box(x0, y0, x1, y1);
  return {
    kind,
    edgeColor: hex(edgeRgb),
    edgeGradient: kind === 'seamless' && gradient ? [hex(topRgb), hex(bottomRgb)] : null,
    lightEdge: relativeLuminance(edgeRgb) > LIGHT_EDGE,
    box: visible,
    contentBox: kind === 'seamless' && cx1 >= 0 ? box(cx0, cy0, cx1, cy1) : visible,
    plates: {light: hex(plates.light), dark: hex(plates.dark)},
    plateFor: {light: choose('light'), dark: choose('dark')},
    tinted,
  };
}
