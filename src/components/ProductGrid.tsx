import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { BLOCK, emptyProduct, type CatalogPage, type Product } from "@/lib/pdf";

type Props = { page: CatalogPage; editable?: boolean; onChange?: (cells: (Product | null)[]) => void };

// Product blocks laid over a catalog page. The page wrapper must set `container-type: inline-size`
// so block text scales with the page (and matches the PDF export).
export function ProductGrid({ page, editable, onChange }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const { grid, cells } = page;
  if (!grid || !cells) return null;

  const set = (i: number, p: Product | null) => onChange?.(cells.map((c, j) => (j === i ? p : c)));
  const isEmpty = (p: Product) => !p.code && !p.name && !p.qty && p.extras.every((e) => !e.label && !e.value);
  const toggle = (i: number, o: boolean) => {
    if (!o && cells[i] && isEmpty(cells[i]!)) set(i, null);
    setOpen(o ? i : null);
  };

  return (
    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, 1fr)`, gridTemplateRows: `repeat(${grid.rows}, 1fr)`, fontSize: `calc(${BLOCK.font * 100}cqw / ${grid.cols})` }}>
      {cells.map((p, i) => (
        <Popover key={i} open={open === i} onOpenChange={(o) => toggle(i, o)}>
          <PopoverAnchor asChild>
            <div className={`group relative ${editable ? "outline-1 -outline-offset-1 outline-dashed outline-primary/0 hover:outline-primary/60" : ""}`}>
              {p ? (
                <div onClick={() => editable && setOpen(i)}
                  className={`absolute rounded-[0.4em] bg-white/92 p-[0.5em] leading-[1.25] text-neutral-900 shadow-sm ${editable ? "cursor-pointer hover:ring-2 hover:ring-primary" : ""}`}
                  style={{ left: `${BLOCK.inset * 100}%`, right: `${BLOCK.inset * 100}%`, bottom: `${BLOCK.inset * 100}%` }}>
                  <div className="flex justify-between gap-[0.5em] whitespace-nowrap">
                    <span className="truncate font-bold">{p.code || "—"}</span>
                    {p.qty && <span>Qtd. {p.qty}</span>}
                  </div>
                  {p.name && <div className="truncate">{p.name}</div>}
                  {p.extras.filter((e) => e.label || e.value).map((e, k) => (
                    <div key={k} className="truncate text-neutral-600">{e.label ? `${e.label}: ${e.value}` : e.value}</div>
                  ))}
                  {editable && (
                    <button title="Adicionar campo" onClick={(ev) => { ev.stopPropagation(); set(i, { ...p, extras: [...p.extras, { label: "", value: "" }] }); setOpen(i); }}
                      className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow group-hover:flex">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : editable && (
                <button onClick={() => { set(i, emptyProduct()); setOpen(i); }}
                  className="absolute inset-0 hidden items-center justify-center group-hover:flex">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow"><Plus className="h-3.5 w-3.5" /> Produto</span>
                </button>
              )}
            </div>
          </PopoverAnchor>
          {editable && p && (
            <PopoverContent className="w-72 space-y-3" onOpenAutoFocus={(e) => e.preventDefault()}>
              <ProductForm product={p} onChange={(np) => set(i, np)} onRemove={() => { set(i, null); setOpen(null); }} />
            </PopoverContent>
          )}
        </Popover>
      ))}
    </div>
  );
}

function ProductForm({ product: p, onChange, onRemove }: { product: Product; onChange: (p: Product) => void; onRemove: () => void }) {
  const setExtra = (k: number, f: Partial<Product["extras"][number]>) => onChange({ ...p, extras: p.extras.map((e, j) => (j === k ? { ...e, ...f } : e)) });
  const label = "text-xs font-medium text-muted-foreground";
  return (
    <>
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <label className="space-y-1"><span className={label}>Código</span><Input value={p.code} autoFocus onChange={(e) => onChange({ ...p, code: e.target.value })} /></label>
        <label className="space-y-1"><span className={label}>Quantidade</span><Input value={p.qty} onChange={(e) => onChange({ ...p, qty: e.target.value })} /></label>
      </div>
      <label className="block space-y-1"><span className={label}>Nome</span><Input value={p.name} onChange={(e) => onChange({ ...p, name: e.target.value })} /></label>
      {p.extras.map((e, k) => (
        <div key={k} className="flex items-center gap-2">
          <Input placeholder="Campo" value={e.label} className="w-24" onChange={(ev) => setExtra(k, { label: ev.target.value })} />
          <Input placeholder="Valor" value={e.value} onChange={(ev) => setExtra(k, { value: ev.target.value })} />
          <button title="Remover campo" onClick={() => onChange({ ...p, extras: p.extras.filter((_, j) => j !== k) })} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex justify-between pt-1">
        <button onClick={() => onChange({ ...p, extras: [...p.extras, { label: "", value: "" }] })} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><Plus className="h-4 w-4" /> Adicionar campo</button>
        <button onClick={onRemove} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /> Remover</button>
      </div>
    </>
  );
}
