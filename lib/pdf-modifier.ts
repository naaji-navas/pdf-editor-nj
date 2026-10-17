import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import type { TextItem, PageData, Rect, ColoroutBox } from "./types";

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

const CHAR_FALLBACKS: Record<string, string> = {
  "₹": "Rs.", "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "≠": "!=", "✓": "v", "✔": "v",
  "\u00a0": " ", "\u2002": " ", "\u2003": " ", "\u2009": " ", "\t": " ",
};

export async function applyEdits(
  originalPdfBytes: ArrayBuffer,
  pages: PageData[],
  editedItems: Map<string, TextItem>,
  newItems: TextItem[],
  scale: number,
  colorouts: ColoroutBox[] = [],
  crops: Map<number, Rect> = new Map()
): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;
  try {
    // Empty password decrypts owner-password-only PDFs (open without a password but block editing)
    pdfDoc = await PDFDocument.load(originalPdfBytes, { password: "" });
  } catch (err) {
    if (err instanceof Error && /encrypt|password/i.test(err.message)) {
      throw new Error("This PDF is password-protected, so it can't be modified. Remove the password and try again.");
    }
    throw err;
  }
  const pdfPages = pdfDoc.getPages();

  // Editor rects are top-left based and relative to the visible (crop) box
  const visibleBoxes = pdfPages.map((page) => page.getCropBox());
  const toPdfRect = (pageIndex: number, r: Rect) => {
    const box = visibleBoxes[pageIndex];
    return { x: box.x + r.x, y: box.y + box.height - r.y - r.height, width: r.width, height: r.height };
  };

  for (const box of colorouts) {
    if (box.pageIndex >= pdfPages.length) continue;
    pdfPages[box.pageIndex].drawRectangle({
      ...toPdfRect(box.pageIndex, box),
      color: hexToRgb(box.color ?? "#ffffff"),
    });
  }

  type EmbeddedFont = Awaited<ReturnType<typeof pdfDoc.embedFont>>;
  const fontCache: Record<string, EmbeddedFont> = {};

  async function getFont(family: string, bold?: boolean, italic?: boolean) {
    const key = mapFontFamily(family, bold, italic);
    if (!fontCache[key]) {
      fontCache[key] = await pdfDoc.embedFont(StandardFonts[key]);
    }
    return fontCache[key];
  }

  // Standard fonts only cover WinAnsi; drawText throws on anything else
  const charsetCache = new Map<EmbeddedFont, Set<number>>();
  function toEncodable(text: string, font: EmbeddedFont) {
    let charset = charsetCache.get(font);
    if (!charset) {
      charset = new Set(font.getCharacterSet());
      charsetCache.set(font, charset);
    }
    let out = "";
    for (const ch of text) {
      if (ch === "\n" || charset.has(ch.codePointAt(0)!)) out += ch;
      else out += CHAR_FALLBACKS[ch] ?? "?";
    }
    return out;
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
    page.drawText(toEncodable(item.text, font), {
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
    page.drawText(toEncodable(item.text, font), {
      x: pdfX,
      y: pdfY,
      size: item.fontSize,
      font,
      color: hexToRgb(item.color),
    });
  }

  for (const [pageIndex, rect] of crops) {
    if (pageIndex >= pdfPages.length) continue;
    const { x, y, width, height } = toPdfRect(pageIndex, rect);
    pdfPages[pageIndex].setMediaBox(x, y, width, height);
    pdfPages[pageIndex].setCropBox(x, y, width, height);
  }

  return pdfDoc.save();
}
