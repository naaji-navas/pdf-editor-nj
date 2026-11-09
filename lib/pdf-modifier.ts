import { PDFDocument, StandardFonts, degrees, rgb } from "@cantoo/pdf-lib";
import type { TextItem, PageData, Rect, ColoroutBox } from "./types";
import { editPageText, type FallbackDraw, type InPlaceEdit } from "./pdf-text-edit";

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
  // PDF base font names drop spaces ("LiberationSerif"), so compare without them
  const compact = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  const lower = compact(fontFamily);

  const isMono = MONO_KEYWORDS.some((k) => lower.includes(compact(k)));
  const isSerif = SERIF_KEYWORDS.some((k) => lower.includes(compact(k)));

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

  // Must run before anything is drawn: drawing wraps the original content streams
  const inPlace = new Set<string>();
  const fallbacks: (FallbackDraw & { pageIndex: number })[] = [];
  const editsByPage = new Map<number, InPlaceEdit[]>();
  for (const [id, item] of editedItems) {
    if (item.pageIndex >= pdfPages.length || item.pdfX === undefined || item.pdfY === undefined) continue;
    const list = editsByPage.get(item.pageIndex) ?? [];
    list.push({ id, pdfX: item.pdfX, pdfY: item.pdfY, originalText: item.originalText ?? "", newText: item.text });
    editsByPage.set(item.pageIndex, list);
  }
  for (const [pageIndex, edits] of editsByPage) {
    try {
      const { handled, fallbacks: pageFallbacks } = editPageText(pdfDoc, pdfPages[pageIndex], edits);
      handled.forEach((id) => inPlace.add(id));
      fallbacks.push(...pageFallbacks.map((f) => ({ ...f, pageIndex })));
    } catch (err) {
      console.warn("In-place text edit failed; using overlay instead", err);
    }
  }

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

  for (const f of fallbacks) {
    const font = await getFont(f.baseFont, /bold|black|heavy|semibold/i.test(f.baseFont), /italic|oblique/i.test(f.baseFont));
    const text = toEncodable(f.text, font);
    let { x, y } = f;
    if (f.rightEdge) {
      const width = font.widthOfTextAtSize(text, f.size);
      const angle = (f.rotation * Math.PI) / 180;
      x = f.rightEdge.x - width * Math.cos(angle);
      y = f.rightEdge.y - width * Math.sin(angle);
    }
    pdfPages[f.pageIndex].drawText(text, {
      x,
      y,
      size: f.size,
      font,
      color: rgb(...f.color),
      rotate: degrees(f.rotation),
    });
  }

  // Text not found in the content stream (e.g. invisible OCR text over a scan) can only be covered
  for (const [id, item] of editedItems) {
    if (item.pageIndex >= pdfPages.length || inPlace.has(id)) continue;
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
