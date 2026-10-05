import { describe, expect, it } from "vitest";

import { countLost, emptyProduct, resizeGrid, type CatalogPage } from "@/lib/pdf";

const prod = (code: string) => ({ ...emptyProduct(), code });
const page: CatalogPage = {
  id: "p", image: "", width: 100, height: 100,
  grid: { cols: 2, rows: 2 },
  cells: [prod("A"), prod("B"), prod("C"), null],
};

describe("resizeGrid", () => {
  it("keeps products at the same row and column when the grid grows", () => {
    const r = resizeGrid(page, { cols: 3, rows: 2 });
    expect(r.cells!.map((c) => c?.code ?? null)).toEqual(["A", "B", null, "C", null, null]);
  });

  it("drops products outside a smaller grid and counts them", () => {
    expect(countLost(page, { cols: 1, rows: 2 })).toBe(1);
    expect(resizeGrid(page, { cols: 1, rows: 2 }).cells!.map((c) => c?.code ?? null)).toEqual(["A", "C"]);
  });

  it("creates an empty grid on a page without one and removes it with undefined", () => {
    const fresh = resizeGrid({ ...page, grid: undefined, cells: undefined }, { cols: 3, rows: 4 });
    expect(fresh.cells).toHaveLength(12);
    expect(fresh.cells!.every((c) => c === null)).toBe(true);
    expect(countLost(page, undefined)).toBe(3);
    expect(resizeGrid(page, undefined).grid).toBeUndefined();
  });
});
