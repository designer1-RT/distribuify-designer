import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the Supabase client: one `catalogs` table and a storage bucket.
const db = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), files: new Set<string>() }));
vi.mock("@/integrations/supabase/client", () => {
  const table = () => {
    let filter: [string, unknown] | null = null;
    let patch: Record<string, unknown> | null = null;
    const rows = () => [...db.rows.values()].filter((r) => !filter || r[filter[0]] === filter[1]);
    const q = {
      select: () => q,
      order: () => Promise.resolve({ data: rows(), error: null }),
      eq: (k: string, v: unknown) => { filter = [k, v]; if (patch) { rows().forEach((r) => Object.assign(r, patch)); return Promise.resolve({ error: null }); } return q; },
      single: () => Promise.resolve({ data: rows()[0], error: null }),
      insert: (r: Record<string, unknown>) => { db.rows.set(r["id"] as string, { ...r, updated_at: "2026-10-06" }); return Promise.resolve({ error: null }); },
      update: (p: Record<string, unknown>) => { patch = p; return q; },
    };
    return q;
  };
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
      from: table,
      storage: {
        from: () => ({
          upload: (path: string) => { db.files.add(path); return Promise.resolve({ error: null }); },
          createSignedUrls: (paths: string[]) => Promise.resolve({ data: paths.map((p) => ({ signedUrl: `https://signed/${p}` })), error: null }),
        }),
      },
    },
  };
});
vi.stubGlobal("fetch", () => Promise.resolve({ blob: () => Promise.resolve(new Blob(["x"])) }));

import { listCatalogs, loadCatalog, saveCatalog, updateCatalogPages } from "@/lib/cloud";
import type { CatalogPage, MappedProduct } from "@/lib/pdf";

const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 };
const product = (code: string, doubtful = false): MappedProduct => ({ id: code, code, name: "Alfajor Clássico", qty: "12x65g", codeBox: box, textBox: box, imageBox: box, doubtful });
const page = (id: string, products?: MappedProduct[]): CatalogPage => ({ id, image: "data:image/jpeg;base64,AA", width: 2000, height: 2750, products, mapped: true });

beforeEach(() => { db.rows.clear(); db.files.clear(); });

describe("catalogs in the database", () => {
  it("saves and loads mapped products unchanged, and lists their counts", async () => {
    const pages = [page("capa", []), page("p1", [product("41920"), product("41904", true)]), page("p2", [product("19615")])];
    const id = await saveCatalog("catalogo", pages);
    const loaded = await loadCatalog(id);
    expect(loaded.pages.map((p) => p.products)).toEqual(pages.map((p) => p.products));
    expect(loaded.pages.every((p) => p.mapped)).toBe(true);
    expect(await listCatalogs()).toMatchObject([{ id, count: 3, products: 3, productPages: 2, review: 1 }]);

    // editing and saving again keeps the same row and image files
    loaded.pages[1]!.products![0]!.name = "Novo nome";
    await updateCatalogPages(id, loaded.pages);
    expect((await loadCatalog(id)).pages[1]!.products![0]!.name).toBe("Novo nome");
    expect(db.files.size).toBe(3);
  });

  it("still opens catalogs saved before the mapping (old grid format)", async () => {
    db.rows.set("old", {
      id: "old", name: "antigo", updated_at: "2026-09-01",
      pages: [{ id: "a", path: "u1/old/a.jpg", width: 4800, height: 6600, grid: { cols: 2, rows: 2 }, cells: [{ code: "1", name: "", qty: "", extras: [] }, null, null, null] }],
    });
    const c = await loadCatalog("old");
    expect(c.pages).toHaveLength(1);
    expect(c.pages[0]!.image).toBe("https://signed/u1/old/a.jpg");
    expect(c.pages[0]!.products).toBeUndefined();
    expect(c.pages[0]!.mapped).toBeUndefined(); // the dashboard offers "Mapear produtos"
    expect(await listCatalogs()).toMatchObject([{ id: "old", count: 1, products: 0, productPages: 0 }]);
  });
});
