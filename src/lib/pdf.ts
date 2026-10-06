// Boxes are fractions of the page (0–1), so they don't depend on the image resolution.
export type Box = { x: number; y: number; w: number; h: number };
export type MappedProduct = { id: string; code: string; name: string; qty: string; codeBox: Box; textBox: Box; imageBox?: Box | undefined; doubtful: boolean };
export type CatalogPage = { id: string; image: string; width: number; height: number; products?: MappedProduct[] | undefined; mapped?: boolean | undefined };

// Only pages where products were found count as product pages.
export function countProducts(pages: Pick<CatalogPage, "products">[]) {
  const withProducts = pages.filter((p) => p.products?.length);
  return {
    products: withProducts.reduce((n, p) => n + p.products!.length, 0),
    productPages: withProducts.length,
    review: withProducts.reduce((n, p) => n + p.products!.filter((x) => x.doubtful).length, 0),
  };
}

export async function pdfToPages(file: File, onProgress?: (n: number, total: number) => void) {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: CatalogPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    // ~2000px wide is plenty for screen, export and OCR (catalog pages are often huge in points)
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(2, 2000 / base.width) });
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
  const { jsPDF } = await import("jspdf");
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
  }
  pdf.save(`${name}.pdf`);
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
