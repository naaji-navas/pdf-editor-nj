import type { ExistingLink, PageInfo, TextRun } from "./types";

async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjsLib;
}

export async function loadPdf(data: ArrayBuffer) {
  const pdfjsLib = await getPdfjs();
  return pdfjsLib.getDocument({ data: data.slice(0) }).promise;
}

export type PdfDoc = Awaited<ReturnType<typeof loadPdf>>;

export async function getPageInfos(pdf: PdfDoc): Promise<PageInfo[]> {
  const infos: PageInfo[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const viewport = (await pdf.getPage(i + 1)).getViewport({ scale: 1 });
    infos.push({ pageIndex: i, width: viewport.width, height: viewport.height });
  }
  return infos;
}

/** Renders a page and returns an object URL; the caller must revoke it. */
export async function renderPageImage(pdf: PdfDoc, pageIndex: number, scale: number): Promise<string> {
  const page = await pdf.getPage(pageIndex + 1);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const viewport = page.getViewport({ scale: scale * dpr });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas: null, canvasContext: canvas.getContext("2d")!, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("Failed to render page");
  return URL.createObjectURL(blob);
}

function familyFromStyle(family: string | undefined) {
  const lower = (family ?? "").toLowerCase();
  if (/mono|courier/.test(lower)) return "Courier";
  if (/serif/.test(lower) && !/sans/.test(lower)) return "Times";
  return "Helvetica";
}

export async function extractPage(
  pdf: PdfDoc,
  pageIndex: number
): Promise<{ runs: TextRun[]; links: ExistingLink[] }> {
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  const runs: TextRun[] = [];
  content.items.forEach((item, i) => {
    if (!("str" in item) || !item.str.trim()) return;
    const tx = item.transform;
    const fontSize = Math.hypot(tx[0], tx[1]);
    const [vx, vy] = viewport.convertToViewportPoint(tx[4], tx[5]);
    runs.push({
      id: `p${pageIndex}r${i}`,
      pageIndex,
      text: item.str,
      x: vx,
      y: vy - fontSize,
      width: Math.max(item.width ?? 0, 4),
      height: Math.max(fontSize * 1.2, 4),
      fontSize: Math.round(fontSize * 10) / 10,
      fontFamily: familyFromStyle(content.styles[item.fontName]?.fontFamily),
      pdfX: tx[4],
      pdfY: tx[5],
    });
  });

  const links: ExistingLink[] = [];
  const annotations = await page.getAnnotations();
  for (const [i, a] of annotations.entries()) {
    if (a.subtype !== "Link" || !Array.isArray(a.rect)) continue;
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
    let target: number | undefined;
    try {
      const dest = typeof a.dest === "string" ? await pdf.getDestination(a.dest) : a.dest;
      if (Array.isArray(dest) && dest[0]) {
        target = typeof dest[0] === "number" ? dest[0] + 1 : (await pdf.getPageIndex(dest[0])) + 1;
      }
    } catch {
      /* unresolvable destination */
    }
    const url = a.url ?? a.unsafeUrl;
    if (!url && target === undefined) continue;
    links.push({
      id: `p${pageIndex}l${i}`,
      pageIndex,
      rect: { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) },
      pdfRect: a.rect as [number, number, number, number],
      url,
      page: target,
    });
  }
  return { runs, links };
}
