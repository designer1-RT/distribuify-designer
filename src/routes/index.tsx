import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, PackageSearch, Files, Moon, Sun, LogIn, LogOut, HelpCircle, ZoomIn, ZoomOut, Link2, FileDown, Upload, ChevronUp, ChevronDown, Trash2, Plus, Save, RefreshCw, ScanSearch } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Tutorial } from "@/components/Tutorial";
import { ProductOverlay } from "@/components/ProductOverlay";
import { countProducts, exportPdf, imageToPage, pdfToPages, type CatalogPage } from "@/lib/pdf";
import { mapPages } from "@/lib/ocr";
import { supabase } from "@/integrations/supabase/client";
import { deleteCatalog, listCatalogs, loadCatalog, saveCatalog, shareCatalog, updateCatalogPages } from "@/lib/cloud";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pontual Catálogo — Editor de catálogo" },
      { name: "description", content: "Visualize, edite e exporte o catálogo de produtos da distribuidora." },
      { property: "og:title", content: "Pontual Catálogo — Editor de catálogo" },
      { property: "og:description", content: "Visualize, edite e exporte o catálogo de produtos da distribuidora." },
    ],
  }),
  component: App,
});

type View = "dashboard" | "editor" | "pages";
type Saved = { id: string; name: string; count: number; products: number; productPages: number; updated_at: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pageBox = { containerType: "inline-size" } as const;

function App() {
  const navigate = useNavigate();
  const [dark, setDark] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [pages, setPages] = useState<CatalogPage[]>([]);
  const [name, setName] = useState("catalogo");
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  function movePage(to: number) {
    if (dragIdx === null || dragIdx === to) { setDragIdx(null); return; }
    setPages((ps) => { const n = [...ps]; const [m] = n.splice(dragIdx, 1); n.splice(to, 0, m!); return n; });
    setDragIdx(null); setDirty(true);
  }
  function removePage(i: number) {
    if (pages.length <= 1) { toast("O catálogo precisa ter pelo menos uma página"); return; }
    if (!confirm(`Remover a página ${i + 1}?`)) return;
    setPages((ps) => ps.filter((_, j) => j !== i)); setDirty(true);
  }
  async function addPages(f?: File) {
    if (!f) return;
    setLoading("Lendo arquivo…");
    try {
      const read = f.type === "application/pdf" ? await pdfToPages(f, (n, t) => setLoading(`Página ${n} de ${t}…`)) : [await imageToPage(f)];
      const add = await withProducts(read);
      setPages((ps) => [...ps, ...add]); setDirty(true);
      toast.success(`${add.length} página(s) adicionada(s) no final`);
    } catch { toast.error("Não foi possível ler este arquivo"); }
    setLoading(null);
  }
  // Reads every page with OCR and finds its products. If the OCR can't run, the pages are kept unmapped.
  async function withProducts(ps: CatalogPage[]): Promise<CatalogPage[]> {
    try {
      const found = await mapPages(ps.map((p) => p.image), (n, t) => setLoading(`Mapeando produtos: página ${n} de ${t}…`));
      const mapped = ps.map((p, i) => ({ ...p, products: found[i], mapped: true }));
      const c = countProducts(mapped);
      toast.success(`Mapeamos ${plural(c.products, "produto", "produtos")} em ${plural(c.productPages, "página", "páginas")}`,
        c.review ? { description: `${plural(c.review, "produto precisa", "produtos precisam")} de revisão (destacados em amarelo).` } : undefined);
      return mapped;
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível mapear os produtos agora. Tente \"Mapear novamente\" depois.");
      return ps;
    }
  }
  async function remapPage(i: number) {
    if (pages[i]!.products?.length && !confirm("Mapear esta página de novo? Os produtos dela serão substituídos.")) return;
    setLoading(`Mapeando a página ${i + 1}…`);
    try {
      const [found] = await mapPages([pages[i]!.image]);
      setPages((ps) => ps.map((p, j) => (j === i ? { ...p, products: found, mapped: true } : p))); setDirty(true);
      toast.success(`Página ${i + 1}: ${plural(found!.length, "produto encontrado", "produtos encontrados")}`);
    } catch { toast.error("Não foi possível mapear esta página"); }
    setLoading(null);
  }
  async function mapCatalog() {
    setLoading("Preparando o mapeamento…");
    const mapped = await withProducts(pages);
    setPages(mapped);
    if (email && catalogId && mapped !== pages) {
      setLoading("Salvando…");
      try { await updateCatalogPages(catalogId, mapped); setDirty(false); setSaved(await listCatalogs()); }
      catch { setDirty(true); toast.error("Erro ao salvar"); }
    } else if (mapped !== pages) setDirty(true);
    setLoading(null);
  }
  async function savePages() {
    if (!email || !catalogId) { toast("Entre na sua conta e abra um catálogo salvo para salvar"); return; }
    setLoading("Salvando…");
    try { await updateCatalogPages(catalogId, pages); setDirty(false); toast.success("Alterações salvas"); setSaved(await listCatalogs()); }
    catch { toast.error("Erro ao salvar"); }
    setLoading(null);
  }

  async function share() {
    if (!email) { toast("Entre na sua conta para gerar o link"); return; }
    if (!catalogId) { toast("Aguarde o catálogo ser salvo na nuvem"); return; }
    try {
      if (dirty) { await updateCatalogPages(catalogId, pages); setDirty(false); }
      await shareCatalog(catalogId);
      const url = `${window.location.origin}/c/${catalogId}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Link copiado! Envie para seus clientes.", { description: url });
    } catch { toast.error("Não foi possível gerar o link"); }
  }
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [tour, setTour] = useState(false);
  const [showProducts, setShowProducts] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  useEffect(() => { if (!localStorage.getItem("tour-done")) setTour(true); }, []);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (email) listCatalogs().then(setSaved).catch(() => toast.error("Erro ao carregar catálogos"));
    else setSaved([]);
  }, [email]);

  const closeTour = () => { setTour(false); localStorage.setItem("tour-done", "1"); };

  async function onFile(f?: File) {
    if (!f) return;
    setLoading("Lendo PDF…");
    try {
      const p = await withProducts(await pdfToPages(f, (n, t) => setLoading(`Preparando página ${n} de ${t}…`)));
      const nm = f.name.replace(/\.pdf$/i, "");
      setPages(p); setName(nm); setCatalogId(null); setCurrent(1); setDirty(false); setView("editor");
      if (email) {
        setCatalogId(await saveCatalog(nm, p, (n, t) => setLoading(`Salvando na nuvem ${n} de ${t}…`)));
        toast.success("Catálogo salvo na nuvem");
        setSaved(await listCatalogs());
      } else toast("Entre na sua conta para salvar o catálogo na nuvem");
    } catch { toast.error("Não foi possível ler ou salvar este PDF"); }
    setLoading(null);
  }

  async function openSaved(id: string) {
    setLoading("Abrindo catálogo…");
    try {
      const c = await loadCatalog(id);
      setPages(c.pages); setName(c.name); setCatalogId(id); setCurrent(1); setDirty(false); setView("editor");
    } catch { toast.error("Não foi possível abrir"); }
    setLoading(null);
  }

  async function removeSaved(id: string) {
    if (!confirm("Excluir este catálogo?")) return;
    await deleteCatalog(id).catch(() => toast.error("Erro ao excluir"));
    setSaved(await listCatalogs());
  }

  async function onLogin() {
    if (!email) return navigate({ to: "/auth" });
    await supabase.auth.signOut();
    setPages([]); setCatalogId(null); setView("dashboard");
    toast("Você saiu da conta");
  }

  function onScroll() {
    const el = scrollRef.current; if (!el) return;
    const kids = Array.from(el.querySelectorAll("[data-page]")) as HTMLElement[];
    const mid = el.scrollTop + el.clientHeight / 2;
    const idx = kids.findIndex((k) => k.offsetTop + k.offsetHeight > mid);
    if (idx >= 0) setCurrent(idx + 1);
  }
  const goTo = (n: number) => {
    const t = scrollRef.current?.querySelectorAll("[data-page]")[n - 1] as HTMLElement | undefined;
    t?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const nav = [
    { id: "dashboard" as View, label: "Painel", icon: LayoutDashboard, tour: "nav-dashboard" },
    { id: "editor" as View, label: "Editar produtos", icon: PackageSearch, tour: "nav-editor" },
    { id: "pages" as View, label: "Organizar páginas", icon: Files, tour: "nav-pages" },
  ];
  const stats = countProducts(pages);
  const railBtn = "flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Toaster richColors position="top-center" />
      <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {/* Rail */}
      <aside className="flex w-[72px] shrink-0 flex-col items-center gap-2 border-r bg-rail py-4">
        {nav.map((n) => (
          <button key={n.id} data-tour={n.tour} title={n.label} onClick={() => setView(n.id)}
            className={`${railBtn} ${view === n.id ? "bg-accent text-accent-foreground" : ""}`}>
            <n.icon className="h-5 w-5" />
          </button>
        ))}
        <div className="flex-1" />
        <button data-tour="help" title="Ajuda / tutorial" onClick={() => setTour(true)} className={railBtn}><HelpCircle className="h-5 w-5" /></button>
        <button data-tour="nav-theme" title="Modo claro/escuro" onClick={() => setDark(!dark)} className={railBtn}>
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button data-tour="nav-login" title={email ? `Sair (${email})` : "Entrar"} onClick={onLogin} className={railBtn}>
          {email ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
        </button>
        <div className="mt-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-lg font-extrabold text-primary-foreground">P</div>
      </aside>

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {view === "dashboard" || pages.length === 0 ? (
          <div className="flex-1 overflow-auto p-6">
            <section className="bg-hero rounded-2xl p-10 text-primary-foreground">
              <h1 className="text-center text-3xl font-bold">O que você quer fazer com seu catálogo hoje?</h1>
              <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-dashed border-primary-foreground/40 bg-foreground/20 p-6">
                  <h2 className="font-semibold">Enviar catálogo em PDF</h2>
                  <p className="mt-1 text-sm opacity-80">Transformamos cada página em uma página editável.</p>
                  <button onClick={() => fileRef.current?.click()} disabled={!!loading}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary-foreground px-5 py-2 text-sm font-bold text-primary">
                    <Upload className="h-4 w-4" /> {loading ?? "Selecionar arquivo"}
                  </button>
                </div>
                <div className="rounded-xl bg-foreground/20 p-6">
                  <h2 className="font-semibold">Continuar editando</h2>
                  <p className="mt-1 text-sm opacity-80">{pages.length ? `${name} · ${plural(pages.length, "página", "páginas")}` : "Nenhum catálogo aberto ainda."}</p>
                  {pages.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <Stat value={stats.products} label="produtos" />
                      <Stat value={stats.productPages} label="páginas com produtos" />
                      <Stat value={stats.review} label="para revisar" />
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {pages.length > 0 && <button onClick={() => setView("editor")} className="rounded-full bg-primary-foreground/20 px-5 py-2 text-sm font-bold">Abrir catálogo</button>}
                    {pages.some((p) => !p.mapped) && (
                      <button onClick={mapCatalog} disabled={!!loading} className="inline-flex items-center gap-2 rounded-full bg-primary-foreground px-5 py-2 text-sm font-bold text-primary">
                        <ScanSearch className="h-4 w-4" /> {loading ?? "Mapear produtos"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
            <section className="mx-auto mt-8 max-w-4xl">
              <h2 className="text-lg font-bold">Meus catálogos na nuvem</h2>
              {!email ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  <button onClick={() => navigate({ to: "/auth" })} className="font-semibold text-primary hover:underline">Entre na sua conta</button> para salvar e ver seus catálogos.
                </p>
              ) : saved.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nenhum catálogo salvo ainda. Envie um PDF acima.</p>
              ) : (
                <ul className="mt-3 divide-y rounded-xl border">
                  {saved.map((c) => (
                    <li key={c.id} className="flex items-center justify-between p-4">
                      <button onClick={() => openSaved(c.id)} className="text-left">
                        <p className="font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {plural(c.products, "produto", "produtos")} em {plural(c.productPages, "página", "páginas")} · {plural(c.count, "página", "páginas")} no total · {new Date(c.updated_at).toLocaleDateString("pt-BR")}
                        </p>
                      </button>
                      <button title="Excluir" onClick={() => removeSaved(c.id)} className={railBtn}><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : view === "pages" ? (
          <div className="flex-1 overflow-auto bg-canvas p-8">
            <input ref={addRef} type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => { addPages(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Organizar páginas</h2>
                <p className="text-sm text-muted-foreground">Arraste as páginas para mudar a ordem.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => addRef.current?.click()} disabled={!!loading} className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-semibold">
                  <Plus className="h-4 w-4" /> {loading ?? "Adicionar páginas"}
                </button>
                <button onClick={savePages} disabled={!dirty || !!loading} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {dirty ? "Salvar alterações" : "Tudo salvo"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-6">
              {pages.map((p, i) => (
                <div key={p.id} draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => movePage(i)}
                  className={`group relative cursor-grab text-center ${dragIdx === i ? "opacity-40" : ""}`}>
                  <div className="relative" style={pageBox}>
                    <img src={p.image} alt={`Página ${i + 1}`} draggable={false} className="w-full rounded bg-page shadow-md ring-primary group-hover:ring-2" />
                  </div>
                  <button title="Remover página" onClick={() => removePage(i)}
                    className="absolute right-2 top-2 hidden h-8 w-8 items-center justify-center rounded-md bg-popover text-foreground shadow group-hover:flex hover:text-primary">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <p className="mt-2 text-sm text-muted-foreground">{i + 1}{p.products?.length ? ` · ${plural(p.products.length, "produto", "produtos")}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto bg-canvas py-8">
            <div className="mx-auto flex flex-col items-center gap-6" style={{ width: `${zoom * 720}px` }}>
              {pages.map((p, i) => (
                <div key={p.id} data-page className="w-full">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Página {i + 1}</span>
                    {p.products?.length ? <span>· {plural(p.products.length, "produto", "produtos")}</span> : p.mapped ? <span>· sem produtos</span> : null}
                    {p.products?.some((x) => x.doubtful) && <span className="text-amber-500">· {p.products.filter((x) => x.doubtful).length} para revisar</span>}
                    <div className="flex-1" />
                    <button onClick={() => remapPage(i)} disabled={!!loading} className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground disabled:opacity-50">
                      <RefreshCw className="h-3.5 w-3.5" /> Mapear novamente
                    </button>
                  </div>
                  <div className="relative bg-page shadow-xl" style={pageBox}>
                    <img src={p.image} alt={`Página ${i + 1}`} className="w-full" />
                    {showProducts && <ProductOverlay page={p} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && view !== "dashboard" && pages.length > 0 && (
          <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border bg-popover px-4 py-2 text-sm font-semibold shadow-lg">{loading}</div>
        )}

        {/* Floating toolbar */}
        {pages.length > 0 && view === "editor" && (
          <div className="absolute bottom-6 right-6 flex flex-col items-center gap-1 rounded-xl border bg-popover p-1.5 shadow-2xl">
            <div data-tour="tool-zoom" className="flex flex-col items-center gap-1">
              <button className={railBtn} title="Página anterior" onClick={() => goTo(Math.max(1, current - 1))}><ChevronUp className="h-5 w-5" /></button>
              <span className="text-xs font-semibold tabular-nums">{current}/{pages.length}</span>
              <button className={railBtn} title="Próxima página" onClick={() => goTo(Math.min(pages.length, current + 1))}><ChevronDown className="h-5 w-5" /></button>
              <div className="my-1 h-px w-8 bg-border" />
              <button className={railBtn} title="Aproximar" onClick={() => setZoom((z) => Math.min(3, z + 0.15))}><ZoomIn className="h-5 w-5" /></button>
              <span className="text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <button className={railBtn} title="Afastar" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}><ZoomOut className="h-5 w-5" /></button>
            </div>
            <div className="my-1 h-px w-8 bg-border" />
            <button className={`${railBtn} ${showProducts ? "text-primary" : ""}`} title={showProducts ? "Ocultar produtos mapeados" : "Mostrar produtos mapeados"} onClick={() => setShowProducts((v) => !v)}>
              <ScanSearch className="h-5 w-5" />
            </button>
            <button className={`${railBtn} relative`} title={dirty ? "Salvar alterações" : "Tudo salvo"} onClick={savePages} disabled={!dirty || !!loading}>
              <Save className="h-5 w-5" />
              {dirty && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />}
            </button>
            <button data-tour="tool-share" className={railBtn} title="Enviar link" onClick={share}><Link2 className="h-5 w-5" /></button>
            <button data-tour="tool-export" className={railBtn} title="Exportar PDF" onClick={() => exportPdf(pages, name)}><FileDown className="h-5 w-5" /></button>
          </div>
        )}
      </main>

      <Tutorial open={tour} onClose={closeTour} />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-foreground/20 px-2 py-3">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs opacity-80">{label}</p>
    </div>
  );
}
