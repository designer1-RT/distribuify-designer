import { supabase } from "@/integrations/supabase/client";
import type { CatalogPage } from "./pdf";

const BUCKET = "catalog-pages";
type StoredPage = { id: string; path: string; width: number; height: number };

export async function saveCatalog(name: string, pages: CatalogPage[], onProgress?: (n: number, t: number) => void) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("not signed in");
  const catalogId = crypto.randomUUID();
  const stored: StoredPage[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    const blob = await (await fetch(p.image)).blob();
    const path = `${u.user.id}/${catalogId}/${p.id}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw error;
    stored.push({ id: p.id, path, width: p.width, height: p.height });
    onProgress?.(i + 1, pages.length);
  }
  const { error } = await supabase.from("catalogs").insert({ id: catalogId, name, pages: stored });
  if (error) throw error;
  return catalogId;
}

export async function listCatalogs() {
  const { data, error } = await supabase.from("catalogs").select("id, name, pages, updated_at").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, count: (c.pages as unknown as StoredPage[]).length, updated_at: c.updated_at }));
}

export async function loadCatalog(id: string) {
  const { data, error } = await supabase.from("catalogs").select("name, pages").eq("id", id).single();
  if (error) throw error;
  const stored = data.pages as unknown as StoredPage[];
  if (!stored.length) return { name: data.name, pages: [] as CatalogPage[] };
  const { data: urls, error: e2 } = await supabase.storage.from(BUCKET).createSignedUrls(stored.map((s) => s.path), 60 * 60 * 24);
  if (e2) throw e2;
  const pages: CatalogPage[] = stored.map((s, i) => ({ id: s.id, image: urls![i]!.signedUrl ?? "", width: s.width, height: s.height }));
  return { name: data.name, pages };
}

export async function deleteCatalog(id: string) {
  const { data } = await supabase.from("catalogs").select("pages").eq("id", id).single();
  const paths = ((data?.pages ?? []) as unknown as StoredPage[]).map((s) => s.path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from("catalogs").delete().eq("id", id);
  if (error) throw error;
}

export async function shareCatalog(id: string) {
  const { error } = await supabase.from("catalogs").update({ shared: true }).eq("id", id);
  if (error) throw error;
}

export async function updateCatalogPages(id: string, pages: CatalogPage[]) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("not signed in");
  const stored: StoredPage[] = [];
  for (const p of pages) {
    const path = `${u.user.id}/${id}/${p.id}.jpg`;
    if (p.image.startsWith("data:")) {
      const blob = await (await fetch(p.image)).blob();
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
    }
    stored.push({ id: p.id, path, width: p.width, height: p.height });
  }
  const { error } = await supabase.from("catalogs").update({ pages: stored, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
