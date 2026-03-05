/**
 * Toolbar font family options (value only). Used to validate normalized PDF font names.
 */
export const TOOLBAR_FONT_VALUES = [
  "Arial", "Arial Narrow", "Helvetica", "Helvetica Neue", "Geneva", "Verdana",
  "Tahoma", "Trebuchet MS", "Lucida Sans", "Gill Sans", "Futura", "Optima",
  "Calibri", "Segoe UI", "Ubuntu", "Roboto", "Open Sans", "Lato", "Source Sans Pro",
  "Century Gothic", "Franklin Gothic", "Impact", "Comic Sans MS", "MS Sans Serif",
  "Liberation Sans", "DejaVu Sans", "Nimbus Sans",
  "Times New Roman", "Times", "Georgia", "Palatino", "Palatino Linotype",
  "Garamond", "Bookman", "Century Schoolbook", "Cambria", "Baskerville",
  "Didot", "Bodoni", "Hoefler Text", "Lucida Bright", "MS Serif",
  "Liberation Serif", "DejaVu Serif",
  "Courier New", "Courier", "Consolas", "Monaco", "Menlo", "Andale Mono",
  "Letter Gothic", "Liberation Mono", "DejaVu Sans Mono", "Nimbus Mono",
] as const;

const DEFAULT_FONT = "Helvetica";

/**
 * Maps a PDF font name (from pdf.js getTextContent or stored in TextItem) to a toolbar
 * font family and derives bold/italic from the name. Used when selecting text so the
 * toolbar reflects the PDF's font.
 */
export function normalizePdfFontToToolbar(pdfFontName: string): {
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
} {
  if (!pdfFontName || typeof pdfFontName !== "string") {
    return { fontFamily: DEFAULT_FONT, isBold: false, isItalic: false };
  }

  const lower = pdfFontName.toLowerCase();

  // PDF internal/generated names (e.g. g_d0_f1) – no readable font
  if (/^g_d\d+_f\d+$/i.test(pdfFontName.trim())) {
    return { fontFamily: DEFAULT_FONT, isBold: false, isItalic: false };
  }

  const isBold = lower.includes("bold");
  const isItalic = lower.includes("italic") || lower.includes("oblique");

  // Monospace / Courier family
  if (
    lower.includes("courier") ||
    lower.includes("consolas") ||
    lower.includes("monaco") ||
    lower.includes("menlo") ||
    lower.includes("andale mono") ||
    lower.includes("letter gothic") ||
    lower.includes("liberation mono") ||
    lower.includes("dejavu sans mono") ||
    lower.includes("nimbus mono")
  ) {
    if (lower.includes("courier new")) return { fontFamily: "Courier New", isBold, isItalic };
    if (lower.includes("consolas")) return { fontFamily: "Consolas", isBold, isItalic };
    if (lower.includes("monaco")) return { fontFamily: "Monaco", isBold, isItalic };
    if (lower.includes("menlo")) return { fontFamily: "Menlo", isBold, isItalic };
    if (lower.includes("liberation mono")) return { fontFamily: "Liberation Mono", isBold, isItalic };
    if (lower.includes("dejavu")) return { fontFamily: "DejaVu Sans Mono", isBold, isItalic };
    if (lower.includes("nimbus mono")) return { fontFamily: "Nimbus Mono", isBold, isItalic };
    return { fontFamily: "Courier", isBold, isItalic };
  }

  // Serif / Times family
  if (
    lower.includes("times") ||
    lower.includes("georgia") ||
    lower.includes("palatino") ||
    lower.includes("garamond") ||
    lower.includes("bookman") ||
    lower.includes("century schoolbook") ||
    lower.includes("cambria") ||
    lower.includes("baskerville") ||
    lower.includes("didot") ||
    lower.includes("bodoni") ||
    lower.includes("hoefler") ||
    lower.includes("lucida bright") ||
    lower.includes("ms serif") ||
    lower.includes("liberation serif") ||
    lower.includes("dejavu serif")
  ) {
    if (lower.includes("times new roman") || lower.includes("timesnewroman")) {
      return { fontFamily: "Times New Roman", isBold, isItalic };
    }
    if (lower.includes("georgia")) return { fontFamily: "Georgia", isBold, isItalic };
    if (lower.includes("palatino linotype")) return { fontFamily: "Palatino Linotype", isBold, isItalic };
    if (lower.includes("palatino")) return { fontFamily: "Palatino", isBold, isItalic };
    if (lower.includes("garamond")) return { fontFamily: "Garamond", isBold, isItalic };
    if (lower.includes("bookman")) return { fontFamily: "Bookman", isBold, isItalic };
    if (lower.includes("century schoolbook")) return { fontFamily: "Century Schoolbook", isBold, isItalic };
    if (lower.includes("cambria")) return { fontFamily: "Cambria", isBold, isItalic };
    if (lower.includes("baskerville")) return { fontFamily: "Baskerville", isBold, isItalic };
    if (lower.includes("didot")) return { fontFamily: "Didot", isBold, isItalic };
    if (lower.includes("bodoni")) return { fontFamily: "Bodoni", isBold, isItalic };
    if (lower.includes("hoefler")) return { fontFamily: "Hoefler Text", isBold, isItalic };
    if (lower.includes("lucida bright")) return { fontFamily: "Lucida Bright", isBold, isItalic };
    if (lower.includes("liberation serif")) return { fontFamily: "Liberation Serif", isBold, isItalic };
    if (lower.includes("dejavu serif")) return { fontFamily: "DejaVu Serif", isBold, isItalic };
    if (lower.includes("ms serif")) return { fontFamily: "MS Serif", isBold, isItalic };
    return { fontFamily: "Times New Roman", isBold, isItalic };
  }

  // Sans-serif / Helvetica family – match specific names then fallback to Helvetica
  if (lower.includes("arial narrow")) return { fontFamily: "Arial Narrow", isBold, isItalic };
  if (lower.includes("arial")) return { fontFamily: "Arial", isBold, isItalic };
  if (lower.includes("helvetica neue")) return { fontFamily: "Helvetica Neue", isBold, isItalic };
  if (lower.includes("helvetica")) return { fontFamily: "Helvetica", isBold, isItalic };
  if (lower.includes("verdana")) return { fontFamily: "Verdana", isBold, isItalic };
  if (lower.includes("tahoma")) return { fontFamily: "Tahoma", isBold, isItalic };
  if (lower.includes("trebuchet")) return { fontFamily: "Trebuchet MS", isBold, isItalic };
  if (lower.includes("lucida sans")) return { fontFamily: "Lucida Sans", isBold, isItalic };
  if (lower.includes("gill sans")) return { fontFamily: "Gill Sans", isBold, isItalic };
  if (lower.includes("calibri")) return { fontFamily: "Calibri", isBold, isItalic };
  if (lower.includes("segoe")) return { fontFamily: "Segoe UI", isBold, isItalic };
  if (lower.includes("ubuntu")) return { fontFamily: "Ubuntu", isBold, isItalic };
  if (lower.includes("roboto")) return { fontFamily: "Roboto", isBold, isItalic };
  if (lower.includes("open sans")) return { fontFamily: "Open Sans", isBold, isItalic };
  if (lower.includes("lato")) return { fontFamily: "Lato", isBold, isItalic };
  if (lower.includes("source sans")) return { fontFamily: "Source Sans Pro", isBold, isItalic };
  if (lower.includes("century gothic")) return { fontFamily: "Century Gothic", isBold, isItalic };
  if (lower.includes("franklin gothic")) return { fontFamily: "Franklin Gothic", isBold, isItalic };
  if (lower.includes("impact")) return { fontFamily: "Impact", isBold, isItalic };
  if (lower.includes("comic sans")) return { fontFamily: "Comic Sans MS", isBold, isItalic };
  if (lower.includes("liberation sans")) return { fontFamily: "Liberation Sans", isBold, isItalic };
  if (lower.includes("dejavu sans") && !lower.includes("mono")) return { fontFamily: "DejaVu Sans", isBold, isItalic };
  if (lower.includes("nimbus sans")) return { fontFamily: "Nimbus Sans", isBold, isItalic };
  if (lower.includes("geneva")) return { fontFamily: "Geneva", isBold, isItalic };
  if (lower.includes("futura")) return { fontFamily: "Futura", isBold, isItalic };
  if (lower.includes("optima")) return { fontFamily: "Optima", isBold, isItalic };
  if (lower.includes("ms sans serif")) return { fontFamily: "MS Sans Serif", isBold, isItalic };

  return { fontFamily: DEFAULT_FONT, isBold, isItalic };
}

/**
 * Ensures the value is one of the toolbar font options (e.g. after normalization
 * we might return a value that's not in the dropdown in rare cases).
 */
export function clampToToolbarFont(fontFamily: string): string {
  const found = TOOLBAR_FONT_VALUES.find(
    (v) => v.toLowerCase() === fontFamily.toLowerCase()
  );
  return found ?? DEFAULT_FONT;
}
