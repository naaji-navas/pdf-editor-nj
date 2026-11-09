import type { TextItem, PageData } from "./types";

let idCounter = 0;
function generateId(): string {
  return `text-${Date.now()}-${idCounter++}`;
}

async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjsLib;
}

export async function loadPdf(data: ArrayBuffer) {
  const pdfjsLib = await getPdfjs();
  const copy = data.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: copy });
  return loadingTask.promise;
}

type PdfDoc = Awaited<ReturnType<typeof loadPdf>>;
type PdfPageProxy = Awaited<ReturnType<PdfDoc["getPage"]>>;

async function drawToCanvas(page: PdfPageProxy, scale: number) {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const viewport = page.getViewport({ scale: scale * dpr });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvas: null, canvasContext: ctx, viewport }).promise;
  return canvas;
}

export async function renderPageImage(pdf: PdfDoc, pageIndex: number, scale: number) {
  const canvas = await drawToCanvas(await pdf.getPage(pageIndex + 1), scale);
  return canvas.toDataURL();
}

export async function renderPage(
  pdf: PdfDoc,
  pageIndex: number,
  scale: number
): Promise<{ canvas: HTMLCanvasElement; pageData: PageData }> {
  const page = await pdf.getPage(pageIndex + 1);
  const cssViewport = page.getViewport({ scale });
  const canvas = await drawToCanvas(page, scale);

  const textContent = await page.getTextContent();
  const textItems: TextItem[] = [];

  for (const item of textContent.items) {
    if (!("str" in item) || !item.str.trim()) continue;

    const tx = item.transform;
    const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
    const x = tx[4] * scale;
    const y = cssViewport.height - tx[5] * scale - fontSize * scale;
    const width = (item.width ?? 0) * scale;
    const height = fontSize * scale;

    textItems.push({
      id: generateId(),
      text: item.str,
      x,
      y,
      width: Math.max(width, 10),
      height: Math.max(height, 10),
      fontSize: Math.round(fontSize),
      fontFamily: item.fontName ?? "Helvetica",
      color: "#000000",
      pageIndex,
      pdfX: tx[4],
      pdfY: tx[5],
    });
  }

  return {
    canvas,
    pageData: {
      pageIndex,
      width: cssViewport.width,
      height: cssViewport.height,
      viewport: {
        width: cssViewport.width,
        height: cssViewport.height,
        scale,
      },
      textItems,
    },
  };
}
