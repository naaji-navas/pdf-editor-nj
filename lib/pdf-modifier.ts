import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TextItem, PageData } from "./types";

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

const SERIF_KEYWORDS = [
  "times", "georgia", "palatino", "garamond", "bookman", "century schoolbook",
  "cambria", "baskerville", "didot", "bodoni", "hoefler", "lucida bright",
  "ms serif", "liberation serif", "dejavu serif",
];
const MONO_KEYWORDS = [
  "courier", "consolas", "monaco", "menlo", "andale mono", "letter gothic",
  "liberation mono", "dejavu sans mono", "nimbus mono", "prestige",
];

function mapFontFamily(
  fontFamily: string,
  isBold?: boolean,
  isItalic?: boolean
): keyof typeof StandardFonts {
  const lower = fontFamily.toLowerCase();

  const isMono = MONO_KEYWORDS.some((k) => lower.includes(k));
  const isSerif = SERIF_KEYWORDS.some((k) => lower.includes(k));

  if (isMono) {
    if (isBold && isItalic) return "CourierBoldOblique";
    if (isBold) return "CourierBold";
    if (isItalic) return "CourierOblique";
    return "Courier";
  }
  if (isSerif) {
    if (isBold && isItalic) return "TimesRomanBoldItalic";
    if (isBold) return "TimesRomanBold";
    if (isItalic) return "TimesRomanItalic";
    return "TimesRoman";
  }

  if (isBold && isItalic) return "HelveticaBoldOblique";
  if (isBold) return "HelveticaBold";
  if (isItalic) return "HelveticaOblique";
  return "Helvetica";
}

export async function applyEdits(
  originalPdfBytes: ArrayBuffer,
  pages: PageData[],
  editedItems: Map<string, TextItem>,
  newItems: TextItem[],
  scale: number
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pdfPages = pdfDoc.getPages();

  const fontCache: Record<string, Awaited<ReturnType<typeof pdfDoc.embedFont>>> = {};

  async function getFont(family: string, bold?: boolean, italic?: boolean) {
    const key = mapFontFamily(family, bold, italic);
    if (!fontCache[key]) {
      fontCache[key] = await pdfDoc.embedFont(StandardFonts[key]);
    }
    return fontCache[key];
  }

  for (const [, item] of editedItems) {
    if (item.pageIndex >= pdfPages.length) continue;
    const page = pdfPages[item.pageIndex];
    const { height: pageHeight } = page.getSize();

    const pdfX = item.x / scale;
    const pdfY = pageHeight - item.y / scale - item.height / scale;
    const pdfWidth = item.width / scale;
    const pdfHeight = item.height / scale;

    page.drawRectangle({
      x: pdfX - 1,
      y: pdfY - 2,
      width: pdfWidth + 2,
      height: pdfHeight + 4,
      color: rgb(1, 1, 1),
    });

    const font = await getFont(item.fontFamily, item.isBold, item.isItalic);
    page.drawText(item.text, {
      x: pdfX,
      y: pdfY,
      size: item.fontSize,
      font,
      color: hexToRgb(item.color),
    });
  }

  for (const item of newItems) {
    if (item.pageIndex >= pdfPages.length) continue;
    const page = pdfPages[item.pageIndex];
    const { height: pageHeight } = page.getSize();

    const pdfX = item.x / scale;
    const pdfY = pageHeight - item.y / scale - item.fontSize;

    const font = await getFont(item.fontFamily, item.isBold, item.isItalic);
    page.drawText(item.text, {
      x: pdfX,
      y: pdfY,
      size: item.fontSize,
      font,
      color: hexToRgb(item.color),
    });
  }

  return pdfDoc.save();
}
