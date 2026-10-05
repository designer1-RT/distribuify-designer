export type ProductField = { label: string; value: string };
export type Product = { code: string; name: string; qty: string; extras: ProductField[] };
export type Grid = { cols: number; rows: number };
export type CatalogPage = { id: string; image: string; width: number; height: number; grid?: Grid | undefined; cells?: (Product | null)[] | undefined };

export const emptyProduct = (): Product => ({ code: "", name: "", qty: "", extras: [] });

// Keeps each product in the same row/column when the grid changes size.
export function resizeGrid(page: CatalogPage, grid: Grid | undefined): CatalogPage {
  const old = page.grid;
  if (!grid) return { ...page, grid: undefined, cells: undefined };
  const cells: (Product | null)[] = [];
  for (let r = 0; r < grid.rows; r++)
    for (let c = 0; c < grid.cols; c++)
      cells.push(old && r < old.rows && c < old.cols ? page.cells?.[r * old.cols + c] ?? null : null);
  return { ...page, grid, cells };
}

export function countLost(page: CatalogPage, grid: Grid | undefined) {
  const kept = grid ? resizeGrid(page, grid).cells!.filter(Boolean).length : 0;
  return (page.cells?.filter(Boolean).length ?? 0) - kept;
}

// Block geometry shared by the on-screen overlay and the PDF export, as fractions of the cell.
export const BLOCK = { inset: 0.04, font: 0.06 };

export async function pdfToPages(file: File, onProgress?: (n: number, total: number) => void) {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: CatalogPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    pages.push({ id: crypto.randomUUID(), image: canvas.toDataURL("image/jpeg", 0.85), width: vp.width, height: vp.height });
    onProgress?.(i, doc.numPages);
  }
  return pages;
}

export async function exportPdf(pages: CatalogPage[], name: string) {
  const { jsPDF, GState } = await import("jspdf");
  const first = pages[0]!;
  const pdf = new jsPDF({ unit: "px", format: [first.width, first.height], orientation: first.width > first.height ? "l" : "p" });
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    if (i > 0) pdf.addPage([p.width, p.height], p.width > p.height ? "l" : "p");
    let img = p.image;
    if (!img.startsWith("data:")) {
      const blob = await (await fetch(img)).blob();
      img = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
    }
    pdf.addImage(img, "JPEG", 0, 0, p.width, p.height);
    drawProducts(pdf, p, new GState({ opacity: 0.92 }));
  }
  pdf.save(`${name}.pdf`);
}

type Pdf = InstanceType<typeof import("jspdf").jsPDF>;
type PdfGState = InstanceType<typeof import("jspdf").GState>;

function drawProducts(pdf: Pdf, p: CatalogPage, translucent: PdfGState) {
  if (!p.grid || !p.cells) return;
  const cw = p.width / p.grid.cols, ch = p.height / p.grid.rows;
  const fs = cw * BLOCK.font, pad = fs * 0.5, lh = fs * 1.25;
  p.cells.forEach((prod, i) => {
    if (!prod) return;
    const extras = prod.extras.filter((e) => e.label || e.value);
    const lines = 1 + (prod.name ? 1 : 0) + extras.length;
    const w = cw * (1 - 2 * BLOCK.inset), h = lines * lh + pad * 2;
    const x = (i % p.grid!.cols) * cw + cw * BLOCK.inset;
    const y = Math.floor(i / p.grid!.cols) * ch + ch * (1 - BLOCK.inset) - h;
    const fit = (t: string, max: number) => (pdf.splitTextToSize(t, max) as string[])[0] ?? "";
    pdf.saveGraphicsState();
    pdf.setGState(translucent);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(x, y, w, h, fs * 0.4, fs * 0.4, "F");
    pdf.restoreGraphicsState();
    let ty = y + pad + fs * 0.85;
    pdf.setFontSize(fs);
    pdf.setTextColor(20, 20, 20);
    const qty = prod.qty ? `Qtd. ${prod.qty}` : "";
    pdf.setFont("helvetica", "normal");
    const qw = qty ? pdf.getTextWidth(qty) : 0;
    if (qty) pdf.text(qty, x + w - pad, ty, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.text(fit(prod.code || "—", w - pad * 3 - qw), x + pad, ty);
    pdf.setFont("helvetica", "normal");
    if (prod.name) { ty += lh; pdf.text(fit(prod.name, w - pad * 2), x + pad, ty); }
    pdf.setTextColor(90, 90, 90);
    for (const e of extras) { ty += lh; pdf.text(fit(e.label ? `${e.label}: ${e.value}` : e.value, w - pad * 2), x + pad, ty); }
  });
}

export async function imageToPage(file: File): Promise<CatalogPage> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  return { id: crypto.randomUUID(), image: c.toDataURL("image/jpeg", 0.85), width: c.width, height: c.height };
}
