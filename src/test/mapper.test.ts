import { describe, expect, it } from "vitest";

import { detectProducts, fixQty, isDoubtful, splitQty, type Raster, type Word } from "@/lib/mapper";
import { countProducts } from "@/lib/pdf";

const W = 1200, H = 1600;
const word = (text: string, x0: number, y0: number, w: number, h = 24, conf = 95): Word => ({ text, conf, x0, y0, x1: x0 + w, y1: y0 + h });

// White page with a striped "product photo" drawn in each rect (stripes give it edges, like a real picture).
function page(photos: [number, number, number, number][]): Raster {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (const [x0, y0, x1, y1] of photos)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4, dark = Math.floor(y / 6) % 2 === 0;
        data[i] = dark ? 200 : 30; data[i + 1] = dark ? 40 : 90; data[i + 2] = dark ? 40 : 160;
      }
  return { width: W, height: H, data };
}

describe("splitQty / fixQty", () => {
  it("takes the last AxB as the quantity and the rest as the name", () => {
    expect(splitQty("Doce de frutas Uva 12x400gr")).toEqual({ name: "Doce de frutas Uva", qty: "12x400gr" });
    expect(splitQty("Lava roupas Mil flores (azul) 6x2L AE")).toEqual({ name: "Lava roupas Mil flores (azul)", qty: "6x2L" });
    expect(splitQty("Penne 24 x 500g")).toEqual({ name: "Penne", qty: "24x500g" });
    expect(splitQty("Tempero completo")).toEqual({ name: "Tempero completo", qty: "" });
  });

  it("fixes common OCR slips in quantities", () => {
    expect(fixQty("6Xx400g")).toBe("6x400g");
    expect(fixQty("12x500mI")).toBe("12x500ml");
    expect(fixQty("24x200m|")).toBe("24x200ml");
    expect(fixQty("óx2L")).toBe("6x2L");
  });
});

describe("detectProducts", () => {
  it("finds code, name, quantity and the picture above each code in a row", () => {
    const words = [
      word("41920", 150, 700, 110), word("ALFAJOR", 130, 740, 90, 20), word("CLÁSSICO", 225, 740, 90, 20), word("12X65G", 160, 765, 80, 20, 30),
      word("41904", 550, 700, 110), word("ALFAJOR", 530, 740, 90, 20), word("BRANCO", 625, 740, 80, 20), word("12X65G", 560, 765, 80, 20),
      word("Barilla", 520, 420, 120, 30, 90), // text printed on the packaging is not product data
    ];
    const found = detectProducts(words, page([[130, 350, 290, 660], [530, 350, 690, 660]]));
    expect(found.map((p) => [p.code, p.name, p.qty])).toEqual([["41920", "ALFAJOR CLÁSSICO", "12X65G"], ["41904", "ALFAJOR BRANCO", "12X65G"]]);
    for (const p of found) {
      expect(p.imageBox).not.toBeNull();
      expect(p.imageBox!.y1).toBeLessThan(700);
      expect(p.imageBox!.y1 - p.imageBox!.y0).toBeGreaterThan(200);
      expect(isDoubtful(p)).toBe(false);
    }
    expect(found[0]!.imageBox!.x1).toBeLessThan(400);
    expect(found[1]!.imageBox!.x0).toBeGreaterThan(400);
  });

  it("ignores lone numbers with no text and keeps 3-digit codes only next to longer ones", () => {
    const words = [
      word("2026", 560, 1500, 80), // year on a cover
      word("825", 150, 700, 70), word("Bucatini", 140, 740, 100, 20), word("24x500g", 145, 765, 90, 20),
      word("18902", 550, 700, 110), word("Farfalle", 540, 740, 100, 20), word("12x500g", 550, 765, 90, 20),
    ];
    const found = detectProducts(words, page([[130, 400, 290, 660], [530, 400, 690, 660]]));
    expect(found.map((p) => p.code)).toEqual(["825", "18902"]);
    expect(detectProducts([word("500", 150, 700, 70), word("Biscoito", 140, 740, 100, 20)], page([]))).toEqual([]);
  });

  it("finds the picture beside a code that stands alone on its row", () => {
    const words = [word("25526", 700, 500, 110), word("Bala", 690, 540, 60, 20), word("de", 755, 540, 30, 20), word("Banana", 790, 540, 80, 20), word("100x50g", 700, 565, 90, 20)];
    const [p] = detectProducts(words, page([[350, 380, 640, 720]]));
    expect(p!.name).toBe("Bala de Banana");
    expect(p!.imageBox!.x1).toBeLessThanOrEqual(700);
    expect(p!.imageBox!.x0).toBeLessThan(400);
  });

  it("marks products with missing data for review", () => {
    const [p] = detectProducts([word("41939", 150, 700, 110), word("41955", 550, 700, 110)], page([[130, 350, 290, 660]]));
    expect(p!.name).toBe("");
    expect(isDoubtful(p!)).toBe(true);
  });
});

describe("countProducts", () => {
  it("counts products and only the pages that have them", () => {
    const prod = (doubtful: boolean) => ({ id: "x", code: "1", name: "", qty: "", codeBox: { x: 0, y: 0, w: 0, h: 0 }, textBox: { x: 0, y: 0, w: 0, h: 0 }, doubtful });
    expect(countProducts([{ products: [prod(false), prod(true)] }, { products: [] }, {}, { products: [prod(false)] }])).toEqual({ products: 3, productPages: 2, review: 1 });
  });
});
