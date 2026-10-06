import type { Box, CatalogPage } from "@/lib/pdf";

const pos = (b: Box) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });

// Shows what the automatic mapping found on a page: the product picture and its code/name/quantity.
// Products that need a second look are highlighted in amber.
export function ProductOverlay({ page }: { page: CatalogPage }) {
  if (!page.products?.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {page.products.map((p) => {
        const tone = p.doubtful ? "border-amber-400 bg-amber-400/10" : "border-primary bg-primary/5";
        const label = [p.code, p.name, p.qty].filter(Boolean).join(" · ") + (p.doubtful ? " (revisar)" : "");
        return (
          <div key={p.id} title={label} className="contents">
            {p.imageBox && <div className={`pointer-events-auto absolute rounded-sm border-2 border-dashed ${tone}`} style={pos(p.imageBox)} />}
            <div className={`pointer-events-auto absolute rounded-sm border ${tone}`} style={pos(p.codeBox)} />
            <div className={`pointer-events-auto absolute rounded-sm border ${tone}`} style={pos(p.textBox)} />
          </div>
        );
      })}
    </div>
  );
}
