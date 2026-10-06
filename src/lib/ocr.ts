import type { Worker } from "tesseract.js";
import { detectProducts, isDoubtful, splitQty, type Detected, type Rect, type Word } from "./mapper";
import type { Box, MappedProduct } from "./pdf";

// OCR runs in the browser with tesseract.js (free). Pages are read at this width at most.
const MAX_W = 1600;
const QTY_CHARS = "0123456789xX gGkKlLmMrRuUnN.,";

export async function mapPages(images: string[], onProgress?: (done: number, total: number) => void) {
  const { createWorker } = await import("tesseract.js");
  // each worker holds its own copy of the OCR engine; two keep memory reasonable
  const workers = await Promise.all(Array.from({ length: Math.min(2, images.length) }, () => createWorker("por")));
  const out: MappedProduct[][] = images.map(() => []);
  let next = 0, done = 0;
  try {
    await Promise.all(workers.map(async (w) => {
      while (next < images.length) {
        const i = next++;
        out[i] = await mapPage(w, images[i]!).catch((e) => { console.error("map page", i + 1, e); return []; });
        onProgress?.(++done, images.length);
      }
    }));
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
  return out;
}

async function mapPage(w: Worker, src: string): Promise<MappedProduct[]> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = src; });
  const s = Math.min(1, MAX_W / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);

  const r = await w.recognize(c, {}, { blocks: true });
  const words: Word[] = (r.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.map((x) => ({ text: x.text, conf: x.confidence, ...x.bbox })))));
  const found = detectProducts(words, ctx.getImageData(0, 0, c.width, c.height));

  // Quantities ("12x400g") are often misread in the full-page pass: read those lines again, digits only.
  const missing = found.filter((p) => !p.qty);
  if (missing.length) {
    await w.setParameters({ tessedit_char_whitelist: QTY_CHARS });
    try {
      for (const p of missing) await rereadQty(w, c, p);
    } finally {
      await w.setParameters({ tessedit_char_whitelist: "" });
    }
  }
  const box = (b: Rect): Box => ({ x: b.x0 / c.width, y: b.y0 / c.height, w: (b.x1 - b.x0) / c.width, h: (b.y1 - b.y0) / c.height });
  return found.map((p) => ({
    id: crypto.randomUUID(), code: p.code, name: p.name, qty: p.qty,
    codeBox: box(p.codeBox), textBox: box(p.textBox), imageBox: p.imageBox ? box(p.imageBox) : undefined, doubtful: isDoubtful(p),
  }));
}

async function rereadQty(w: Worker, c: HTMLCanvasElement, p: Detected) {
  const lh = p.codeBox.y1 - p.codeBox.y0;
  const left = Math.max(0, Math.round(Math.min(p.textBox.x0, p.codeBox.x0) - lh));
  const top = Math.round(p.textBox.y0);
  const width = Math.min(c.width - left, Math.round(Math.max(p.textBox.x1, p.codeBox.x1) + lh) - left);
  const height = Math.min(c.height - top, Math.round(p.textBox.y1 - top + lh * 1.6));
  if (width < 4 || height < 4) return;
  const r = await w.recognize(c, { rectangle: { left, top, width, height } });
  const { qty } = splitQty(r.data.text.replace(/\n/g, " "));
  if (qty) p.qty = qty;
}
