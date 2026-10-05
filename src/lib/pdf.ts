export type CatalogPage = { id: string; image: string; width: number; height: number };

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
  const { jsPDF } = await import("jspdf");
  const first = pages[0];
  const pdf = new jsPDF({ unit: "px", format: [first.width, first.height], orientation: first.width > first.height ? "l" : "p" });
  pages.forEach((p, i) => {
    if (i > 0) pdf.addPage([p.width, p.height], p.width > p.height ? "l" : "p");
    pdf.addImage(p.image, "JPEG", 0, 0, p.width, p.height);
  });
  pdf.save(`${name}.pdf`);
}
