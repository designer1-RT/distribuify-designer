// Finds products on a flat catalog page (a single picture) from OCR words and pixels.
// A product is anchored on its code (a number like 41920): the lines right below it are the
// name and quantity, and the picture is the busy block of pixels above it (or beside it).
// Text printed on the packaging is never read as product data.

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type Word = Rect & { text: string; conf: number };
export type Raster = { width: number; height: number; data: Uint8Array | Uint8ClampedArray }; // RGBA
export type Detected = { code: string; name: string; qty: string; codeBox: Rect; textBox: Rect; imageBox: Rect | null; conf: number };

// Products worth a second look in the review: low OCR confidence or something missing.
export const isDoubtful = (p: Detected) => p.conf < 75 || !p.name || !p.qty || !p.imageBox;

const CODE = /^\d{3,6}$/;
const QTY_G = /\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:kg|gr|g|ml|lt|l|un)?/gi;
const clean = (t: string) => t.replace(/[^\p{L}\p{N}.,/%()+-]/gu, "");
const cx = (b: Rect) => (b.x0 + b.x1) / 2;
const cy = (b: Rect) => (b.y0 + b.y1) / 2;
const union = (bs: Rect[]): Rect => ({ x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) });

// Common OCR slips in quantities: "6Xx400g", "ó x2L" (6), "12x500mI" / "12x500m|" (ml).
export const fixQty = (t: string) =>
  t.replace(/[xX]{2,}/g, "x").replace(/[óÓ](?=\s*[xX]\s*\d)/g, "6").replace(/(\d\s*[xX]\s*\d+\s*m)[I|1](?![a-z])/gi, "$1l").replace(/[|]$/, "");
const isQty = (t: string) => new RegExp(QTY_G.source, "i").test(fixQty(t));

// Splits "Doce de frutas Uva 12x400gr" into name and quantity (the last "AxB" in the text).
export function splitQty(text: string) {
  const t = fixQty(text).replace(/\s+/g, " ").trim();
  const ms = [...t.matchAll(QTY_G)];
  const m = ms[ms.length - 1];
  if (!m) return { name: t, qty: "" };
  const after = t.slice(m.index! + m[0].length).trim();
  const name = (t.slice(0, m.index) + (after.length > 3 ? " " + after : "")).replace(/\s+/g, " ").trim();
  return { name, qty: m[0].replace(/\s+/g, "") };
}

export function detectProducts(words: Word[], img: Raster): Detected[] {
  // quantities are not dictionary words, so the OCR gives them low confidence
  const good = words.map((w) => ({ ...w, text: fixQty(w.text) })).filter((w) => clean(w.text) && (w.conf >= 50 || isQty(w.text)));
  const candidates = good.filter((w) => CODE.test(clean(w.text)) && w.conf >= 60).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  let rows: Word[][] = [];
  for (const c of candidates) {
    const row = rows.find((r) => Math.abs(r[0]!.y0 - c.y0) < (c.y1 - c.y0) * 0.8);
    if (row) row.push(c); else rows.push([c]);
  }
  // a 3-digit number only counts as a code next to longer codes (e.g. Barilla "825")
  rows = rows.map((r) => r.filter((c) => clean(c.text).length > 3 || r.some((o) => clean(o.text).length > 3))).filter((r) => r.length);
  rows.forEach((r) => r.sort((a, b) => a.x0 - b.x0));
  const codes = new Set(rows.flat());
  const spacing = median(rows.flatMap((r) => r.slice(1).map((c, i) => cx(c) - cx(r[i]!)))) ?? img.width / 4;

  const out: Detected[] = [];
  const textBottom = new Map<Word, number>();
  rows.forEach((row, ri) => {
    const nextTop = rows[ri + 1]?.[0]?.y0 ?? img.height;
    row.forEach((c, ci) => {
      const h = c.y1 - c.y0;
      const L = ci > 0 ? (cx(row[ci - 1]!) + cx(c)) / 2 : Math.max(0, cx(c) - spacing / 2);
      const R = ci < row.length - 1 ? (cx(c) + cx(row[ci + 1]!)) / 2 : Math.min(img.width, cx(c) + spacing / 2);
      const below = good.filter((w) => !codes.has(w) && cx(w) > L && cx(w) < R && w.y0 > c.y1 - h * 0.2 && w.y0 < nextTop - h * 0.5);
      const lines: Word[][] = [];
      let last = c.y1;
      for (const w of below.sort((a, b) => a.y0 - b.y0)) {
        const lh = w.y1 - w.y0;
        const line = lines.find((l) => Math.abs(l[0]!.y0 - w.y0) < lh * 0.6);
        if (line) { line.push(w); continue; }
        if (w.y0 - last > Math.max(lh, h) * 1.3) break;
        lines.push([w]);
        last = w.y1;
      }
      // a lone number with no text (a year, a page number…) is not a product; a code in a row of codes is
      if (!lines.length && row.length < 2) return;
      const text = lines.map((l) => l.sort((a, b) => a.x0 - b.x0).map((w) => w.text.trim()).join(" ")).join(" ");
      const { name, qty } = splitQty(text);
      const textBox = lines.length ? union(lines.flat()) : { x0: c.x0, y0: c.y1, x1: c.x1, y1: c.y1 + h };
      textBottom.set(c, textBox.y1);
      const prevBottom = ri > 0 ? Math.max(0, ...rows[ri - 1]!.filter((p) => cx(p) > L - spacing && cx(p) < R + spacing).map((p) => textBottom.get(p) ?? p.y1)) : 0;
      const above = () => findImage(img, { x0: L, y0: prevBottom, x1: R, y1: c.y0 - h * 0.3 }, "bottom", h, cx(c));
      const beside = () => {
        const block = union([c, textBox]);
        const y0 = Math.max(prevBottom, block.y0 - spacing * 0.6), y1 = Math.min(nextTop, block.y1 + spacing * 0.4);
        return findImage(img, { x0: Math.max(0, block.x0 - spacing * 1.5), y0, x1: block.x0 - h * 0.3, y1 }, "right", h, cy(block))
          ?? findImage(img, { x0: block.x1 + h * 0.3, y0, x1: Math.min(img.width, block.x1 + spacing * 1.5), y1 }, "left", h, cy(block));
      };
      // a code alone on its row is usually set beside its picture
      const imageBox = row.length < 2 ? beside() ?? above() : above() ?? beside();
      const conf = Math.min(c.conf, ...lines.flat().filter((w) => !isQty(w.text)).map((w) => w.conf));
      out.push({ code: clean(c.text), name, qty, codeBox: rect(c), textBox, imageBox, conf });
    });
  });
  return out;
}

const rect = (r: Rect): Rect => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });

function median(xs: number[]) {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Looks for the block of "busy" pixels (edges) in `area` closest to the side touching the code:
// "bottom" when the code is under the area, "right"/"left" when it is on that side of it.
// Flat fills are ignored and long straight lines (frames, separators) are erased first.
function findImage(img: Raster, area: Rect, anchor: "bottom" | "left" | "right", codeH: number, centre: number): Rect | null {
  const k = Math.max(1, Math.round(img.width / 600));
  const ox = Math.floor(Math.max(0, area.x0) / k), oy = Math.floor(Math.max(0, area.y0) / k);
  const w = Math.floor(Math.min(img.width, area.x1) / k) - ox, h = Math.floor(Math.min(img.height, area.y1) / k) - oy;
  const ch = codeH / k;
  if (w < ch || h < ch) return null;
  const at = (x: number, y: number) => (((oy + y) * k) * img.width + (ox + x) * k) * 4;
  const d = img.data;
  const edge = new Uint8Array(w * h);
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w - 1; x++) {
      const a = at(x, y), b = at(x + 1, y), c = at(x, y + 1);
      const dx = Math.abs(d[a]! - d[b]!) + Math.abs(d[a + 1]! - d[b + 1]!) + Math.abs(d[a + 2]! - d[b + 2]!);
      const dy = Math.abs(d[a]! - d[c]!) + Math.abs(d[a + 1]! - d[c + 1]!) + Math.abs(d[a + 2]! - d[c + 2]!);
      if (Math.max(dx, dy) > 45) edge[y * w + x] = 1;
    }
  eraseLines(edge, w, h);

  // primary axis runs away from the code, the other one is searched for the cluster nearest to it
  const vertical = anchor === "bottom";
  const P = vertical ? h : w, O = vertical ? w : h;
  const ink = (p: number, o: number) => edge[vertical ? p * w + o : o * w + p]!;
  const order = Array.from({ length: P }, (_, i) => (anchor === "left" ? i : P - 1 - i));
  let pa = -1, pb = -1, gap = 0;
  for (const p of order) {
    let n = 0;
    for (let o = 0; o < O; o++) n += ink(p, o);
    const busy = n >= 2;
    if (pa < 0) { if (busy) pa = pb = p; else if (Math.abs(p - order[0]!) > ch * 6) return null; continue; }
    if (busy) { pb = p; gap = 0; } else if (++gap > ch * 1.5) break;
  }
  if (pa < 0) return null;
  const [p0, p1] = [Math.min(pa, pb), Math.max(pa, pb)];
  if (p1 - p0 < ch) return null;
  const busyO = Array.from({ length: O }, (_, o) => { let n = 0; for (let p = p0; p <= p1; p++) n += ink(p, o); return n >= 2; });
  const clusters: [number, number][] = [];
  let start = -1, g = 0;
  for (let o = 0; o <= O; o++) {
    if (o < O && busyO[o]) { if (start < 0) start = o; g = 0; continue; }
    if (start >= 0 && (++g > ch || o === O)) { clusters.push([start, o - g]); start = -1; g = 0; }
  }
  const mid = centre / k - (vertical ? ox : oy);
  const best = clusters.filter((c) => c[1] - c[0] >= ch).sort((a, b) => Math.abs((a[0] + a[1]) / 2 - mid) - Math.abs((b[0] + b[1]) / 2 - mid))[0];
  if (!best) return null;
  const [xa, xb, ya, yb] = vertical ? [best[0], best[1], p0, p1] : [p0, p1, best[0], best[1]];
  return { x0: (ox + xa) * k, y0: (oy + ya) * k, x1: (ox + xb + 1) * k, y1: (oy + yb + 1) * k };
}

function eraseLines(edge: Uint8Array, w: number, h: number) {
  for (let y = 0; y < h; y++)
    for (let x = 0, run = 0; x <= w; x++) {
      if (x < w && edge[y * w + x]) { run++; continue; }
      if (run > w * 0.8) for (let j = x - run; j < x; j++) edge[y * w + j] = 0;
      run = 0;
    }
  for (let x = 0; x < w; x++)
    for (let y = 0, run = 0; y <= h; y++) {
      if (y < h && edge[y * w + x]) { run++; continue; }
      if (run > h * 0.7) for (let j = y - run; j < y; j++) edge[j * w + x] = 0;
      run = 0;
    }
}
