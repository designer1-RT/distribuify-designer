import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import { ProductGrid } from "@/components/ProductGrid";
import { loadCatalog } from "@/lib/cloud";
import { exportPdf, type CatalogPage } from "@/lib/pdf";

export const Route = createFileRoute("/c/$id")({
  head: () => ({
    meta: [
      { title: "Catálogo Pontual" },
      { name: "description", content: "Confira o catálogo de produtos da distribuidora Pontual." },
      { property: "og:title", content: "Catálogo Pontual" },
      { property: "og:description", content: "Confira o catálogo de produtos da distribuidora Pontual." },
    ],
  }),
  component: Viewer,
});

function Viewer() {
  const { id } = Route.useParams();
  const [data, setData] = useState<{ name: string; pages: CatalogPage[] } | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    loadCatalog(id).then(setData).catch(() => setErr(true));
  }, [id]);

  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-rail px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-extrabold text-primary-foreground">P</div>
          <span className="font-bold">{data?.name ?? "Catálogo Pontual"}</span>
        </div>
        {data && (
          <button onClick={() => exportPdf(data.pages, data.name)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <FileDown className="h-4 w-4" /> Baixar PDF
          </button>
        )}
      </header>
      {err ? (
        <p className="p-10 text-center text-muted-foreground">Catálogo não encontrado ou não compartilhado.</p>
      ) : !data ? (
        <p className="p-10 text-center text-muted-foreground">Carregando catálogo…</p>
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
          {data.pages.map((p, i) => (
            <div key={p.id} className="relative bg-page shadow-xl" style={{ containerType: "inline-size" }}>
              <img src={p.image} alt={`Página ${i + 1}`} className="w-full" />
              <ProductGrid page={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
