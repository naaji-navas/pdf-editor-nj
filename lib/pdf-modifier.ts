import {
  LineCapStyle,
  PDFArray,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRef,
  PDFStream,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from "@cantoo/pdf-lib";
import fontkit from "@cantoo/fontkit";
import type { CustomFont, DocState, Rect, TextStyle } from "./types";
import { editPageText, type FallbackDraw, type InPlaceEdit } from "./pdf-text-edit";
import { safeLinkUrl } from "./links";
import { bundledFontFor, isItalicName, weightOf } from "./font-match";

function hexToTuple(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}
const hexToRgb = (hex: string) => rgb(...hexToTuple(hex));

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

const LINE_HEIGHT = 1.2;

interface ApplyOptions {
  customFonts?: CustomFont[];
  /** Only apply edits to existing text (used for the live preview). */
  textOnly?: boolean;
  /** Loads a file from public/fonts; returns null when unavailable. */
  fetchFont?: (file: string) => Promise<ArrayBuffer | null>;
}

const bundledCache = new Map<string, Promise<ArrayBuffer | null>>();
function fetchBundledFont(file: string) {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!bundledCache.has(file)) {
    const request = fetch(`/fonts/${file}`)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
    request.then((bytes) => bytes || bundledCache.delete(file));
    bundledCache.set(file, request);
  }
  return bundledCache.get(file)!;
}

export async function applyEdits(
  originalPdfBytes: ArrayBuffer,
  doc: DocState,
  { customFonts = [], textOnly = false, fetchFont = fetchBundledFont }: ApplyOptions = {}
): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;
  try {
    // Empty password decrypts owner-password-only PDFs (open without a password but block editing)
    pdfDoc = await PDFDocument.load(originalPdfBytes, { password: "", updateMetadata: false });
  } catch (err) {
    if (err instanceof Error && /encrypt|password/i.test(err.message)) {
      throw new Error("This PDF is password-protected, so it can't be modified. Remove the password and try again.");
    }
    throw err;
  }
  pdfDoc.registerFontkit(fontkit);
  const pdfPages = pdfDoc.getPages();
  const pageAt = (i: number) => (i < pdfPages.length ? pdfPages[i] : null);

  // Editor geometry is top-left based and relative to the visible (crop) box
  const visibleBoxes = pdfPages.map((page) => page.getCropBox());
  const toPdfPoint = (pageIndex: number, x: number, y: number) => {
    const box = visibleBoxes[pageIndex];
    return { x: box.x + x, y: box.y + box.height - y };
  };
  const toPdfRect = (pageIndex: number, r: Rect) => {
    const p = toPdfPoint(pageIndex, r.x, r.y + r.height);
    return { x: p.x, y: p.y, width: r.width, height: r.height };
  };

  // Must run before anything is drawn: drawing wraps the original content streams
  const inPlace = new Set<string>();
  const fallbacks: (FallbackDraw & { pageIndex: number })[] = [];
  const editsByPage = new Map<number, InPlaceEdit[]>();
  for (const [id, edit] of Object.entries(doc.textEdits)) {
    const { run, style = {} } = edit;
    if (!pageAt(run.pageIndex)) continue;
    const list = editsByPage.get(run.pageIndex) ?? [];
    list.push({
      id,
      pdfX: run.pdfX,
      pdfY: run.pdfY,
      originalText: run.text,
      newText: edit.text,
      size: style.fontSize,
      color: style.color ? hexToTuple(style.color) : undefined,
      forceFallback: style.fontFamily !== undefined || style.bold !== undefined || style.italic !== undefined,
      dx: edit.dx,
      dy: edit.dy !== undefined ? -edit.dy : undefined,
    });
    editsByPage.set(run.pageIndex, list);
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

  const fontCache = new Map<string, PDFFont>();
  async function getFont(family: string, bold?: boolean, italic?: boolean) {
    const custom = customFonts.find((f) => f.name === family);
    const key = custom ? `custom:${custom.name}` : mapFontFamily(family, bold, italic);
    if (!fontCache.has(key)) {
      fontCache.set(
        key,
        custom
          ? await pdfDoc.embedFont(custom.bytes, { subset: true })
          : await pdfDoc.embedFont(StandardFonts[key as keyof typeof StandardFonts])
      );
    }
    return fontCache.get(key)!;
  }

  // Redraws keep the original family and weight when we ship a full copy of that font
  async function getMatchingFont(baseFont: string, bold?: boolean, italic?: boolean) {
    const file = bundledFontFor(baseFont, { bold, italic });
    const key = `bundled:${file}`;
    if (file && !fontCache.has(key)) {
      const bytes = await fetchFont(file);
      if (bytes) fontCache.set(key, await pdfDoc.embedFont(bytes, { subset: true }));
    }
    if (file && fontCache.has(key)) return fontCache.get(key)!;
    return getFont(baseFont, bold ?? weightOf(baseFont) >= 600, italic ?? isItalicName(baseFont));
  }

  // Standard fonts only cover WinAnsi; drawText throws on anything else
  const charsetCache = new Map<PDFFont, Set<number>>();
  function toEncodable(text: string, font: PDFFont) {
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
    const style = doc.textEdits[f.id]?.style ?? {};
    const font = style.fontFamily
      ? await getFont(style.fontFamily, style.bold, style.italic)
      : await getMatchingFont(f.baseFont, style.bold, style.italic);
    const size = style.fontSize ?? f.size;
    const text = toEncodable(f.text, font);
    let { x, y } = f;
    if (f.rightEdge) {
      const width = font.widthOfTextAtSize(text, size);
      const angle = (f.rotation * Math.PI) / 180;
      x = f.rightEdge.x - width * Math.cos(angle);
      y = f.rightEdge.y - width * Math.sin(angle);
    }
    pdfPages[f.pageIndex].drawText(text, {
      x,
      y,
      size,
      font,
      color: style.color ? hexToRgb(style.color) : rgb(...f.color),
      rotate: degrees(f.rotation),
    });
  }

  // Text not found in the content stream (e.g. invisible OCR text over a scan) can only be covered
  for (const [id, edit] of Object.entries(doc.textEdits)) {
    const { run } = edit;
    const page = pageAt(run.pageIndex);
    if (!page || inPlace.has(id)) continue;
    const r = toPdfRect(run.pageIndex, run);
    page.drawRectangle({ x: r.x - 1, y: r.y - 2, width: r.width + 2, height: r.height + 4, color: rgb(1, 1, 1) });
    const style: TextStyle = {
      fontFamily: run.fontFamily, fontSize: run.fontSize, color: "#000000", bold: false, italic: false,
      ...edit.style,
    };
    const font = await getFont(style.fontFamily, style.bold, style.italic);
    const base = toPdfPoint(run.pageIndex, run.x + (edit.dx ?? 0), run.y + (edit.dy ?? 0) + run.fontSize);
    page.drawText(toEncodable(edit.text, font), {
      x: base.x, y: base.y, size: style.fontSize, font, color: hexToRgb(style.color),
    });
  }

  if (!textOnly) {
    editExistingLinks(pdfDoc, doc);
    for (const obj of doc.objects) {
      const page = pageAt(obj.pageIndex);
      if (!page) continue;
      await drawObject(page, obj);
    }
    for (const [key, rect] of Object.entries(doc.crops)) {
      const pageIndex = Number(key);
      if (!pageAt(pageIndex)) continue;
      const { x, y, width, height } = toPdfRect(pageIndex, rect);
      pdfPages[pageIndex].setMediaBox(x, y, width, height);
      pdfPages[pageIndex].setCropBox(x, y, width, height);
    }
  }

  if (!textOnly) {
    await pdfDoc.flush();
    writeAsNewDocument(pdfDoc);
  }
  return pdfDoc.save();

  async function drawObject(page: PDFPage, obj: DocState["objects"][number]) {
    const pageIndex = obj.pageIndex;
    switch (obj.kind) {
      case "colorout":
        page.drawRectangle({ ...toPdfRect(pageIndex, obj), color: hexToRgb(obj.color) });
        return;
      case "text": {
        const { style } = obj;
        const font = await getFont(style.fontFamily, style.bold, style.italic);
        const lineHeight = style.fontSize * LINE_HEIGHT;
        // Matches where the browser puts the baseline inside a line box of the same height
        const ascent = font.heightAtSize(style.fontSize, { descender: false });
        const full = font.heightAtSize(style.fontSize);
        const firstBaseline = obj.y + (lineHeight - full) / 2 + ascent;
        toEncodable(obj.text, font).split("\n").forEach((line, i) => {
          const p = toPdfPoint(pageIndex, obj.x, firstBaseline + i * lineHeight);
          page.drawText(line, { x: p.x, y: p.y, size: style.fontSize, font, color: hexToRgb(style.color) });
        });
        return;
      }
      case "image": {
        const bytes = dataUrlToBytes(obj.src);
        const image = obj.src.startsWith("data:image/png")
          ? await pdfDoc.embedPng(bytes)
          : await pdfDoc.embedJpg(bytes);
        page.drawImage(image, { ...toPdfRect(pageIndex, obj), opacity: obj.opacity });
        return;
      }
      case "rect":
      case "ellipse": {
        const r = toPdfRect(pageIndex, obj);
        const paint = {
          color: obj.fill ? hexToRgb(obj.fill) : undefined,
          borderColor: obj.stroke ? hexToRgb(obj.stroke) : undefined,
          borderWidth: obj.stroke ? obj.strokeWidth : 0,
          opacity: obj.opacity,
          borderOpacity: obj.opacity,
        };
        if (obj.kind === "rect") page.drawRectangle({ ...r, ...paint });
        else page.drawEllipse({ x: r.x + r.width / 2, y: r.y + r.height / 2, xScale: r.width / 2, yScale: r.height / 2, ...paint });
        return;
      }
      case "line":
      case "arrow": {
        const start = toPdfPoint(pageIndex, obj.x1, obj.y1);
        let end = toPdfPoint(pageIndex, obj.x2, obj.y2);
        const color = hexToRgb(obj.stroke);
        if (obj.kind === "arrow") {
          const head = Math.max(6, obj.strokeWidth * 4);
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const tip = end;
          const left = { x: tip.x - head * Math.cos(angle - 0.45), y: tip.y - head * Math.sin(angle - 0.45) };
          const right = { x: tip.x - head * Math.cos(angle + 0.45), y: tip.y - head * Math.sin(angle + 0.45) };
          // drawSvgPath flips y, so negate it to pass absolute page coordinates
          page.drawSvgPath(`M ${tip.x} ${-tip.y} L ${left.x} ${-left.y} L ${right.x} ${-right.y} Z`, {
            x: 0, y: 0, color, opacity: obj.opacity, borderWidth: 0,
          });
          end = { x: tip.x - head * 0.8 * Math.cos(angle), y: tip.y - head * 0.8 * Math.sin(angle) };
        }
        page.drawLine({ start, end, thickness: obj.strokeWidth, color, opacity: obj.opacity, lineCap: LineCapStyle.Round });
        return;
      }
      case "link": {
        const r = toPdfRect(pageIndex, obj);
        const action = linkAction(obj.url, obj.page);
        if (!action) return;
        const annot = pdfDoc.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [r.x, r.y, r.x + r.width, r.y + r.height],
          Border: [0, 0, 0],
        });
        Object.entries(action).forEach(([k, v]) => annot.set(PDFName.of(k), v));
        page.node.addAnnot(pdfDoc.context.register(annot));
        return;
      }
    }
  }

  function linkAction(url?: string, targetPage?: number): Record<string, PDFDict | PDFArray> | null {
    const safe = url ? safeLinkUrl(url) : null;
    if (safe) {
      return { A: pdfDoc.context.obj({ Type: "Action", S: "URI", URI: PDFString.of(safe) }) };
    }
    const target = targetPage !== undefined ? pageAt(targetPage - 1) : null;
    if (target) return { Dest: pdfDoc.context.obj([target.ref, PDFName.of("Fit")]) };
    return null;
  }

  function editExistingLinks(pdf: PDFDocument, state: DocState) {
    const byPage = new Map<number, DocState["linkEdits"][string][]>();
    for (const edit of Object.values(state.linkEdits)) {
      byPage.set(edit.link.pageIndex, [...(byPage.get(edit.link.pageIndex) ?? []), edit]);
    }
    for (const [pageIndex, edits] of byPage) {
      const page = pageAt(pageIndex);
      const annots = page?.node.Annots();
      if (!page || !annots) continue;
      const num = (v: unknown) => (v instanceof PDFNumber ? v.asNumber() : NaN);
      for (let i = annots.size() - 1; i >= 0; i--) {
        const annot = annots.lookup(i);
        if (!(annot instanceof PDFDict) || annot.lookup(PDFName.of("Subtype"))?.toString() !== "/Link") continue;
        const rect = annot.lookup(PDFName.of("Rect"));
        if (!(rect instanceof PDFArray)) continue;
        const values = rect.asArray().map((v) => num(pdf.context.lookup(v)));
        const edit = edits.find((e) => e.link.pdfRect.every((v, k) => Math.abs(v - values[k]) < 0.5));
        if (!edit) continue;
        if (edit.deleted) {
          annots.remove(i);
          continue;
        }
        const action = linkAction(edit.url, edit.page);
        if (!action) continue;
        annot.delete(PDFName.of("A"));
        annot.delete(PDFName.of("Dest"));
        Object.entries(action).forEach(([k, v]) => annot.set(PDFName.of(k), v));
      }
    }
  }
}

const HISTORY_KEYS = ["Metadata", "PieceInfo", "LastModified"].map((k) => PDFName.of(k));

// Output carries no trace of the source file's metadata or of this editor: fresh Info and file ID, no XMP, no orphans
function writeAsNewDocument(pdfDoc: PDFDocument) {
  const { context } = pdfDoc;
  const now = PDFString.fromDate(new Date());
  context.trailerInfo.Info = context.register(context.obj({ CreationDate: now, ModDate: now }));

  const id = crypto.getRandomValues(new Uint8Array(16));
  const hex = PDFHexString.of(Array.from(id, (b) => b.toString(16).padStart(2, "0")).join(""));
  context.trailerInfo.ID = context.obj([hex, hex]);

  dropUnreachable(context);
}

function dropUnreachable(context: PDFContext) {
  const { Root, Info, Encrypt } = context.trailerInfo;
  const seen = new Set<PDFRef>();
  const stack: PDFObject[] = [Root, Info, Encrypt].filter((o): o is PDFObject => !!o);
  while (stack.length) {
    const obj = stack.pop()!;
    if (obj instanceof PDFRef) {
      if (seen.has(obj)) continue;
      seen.add(obj);
      const target = context.lookup(obj);
      if (target) stack.push(target);
    } else if (obj instanceof PDFDict) {
      HISTORY_KEYS.forEach((k) => obj.delete(k));
      for (const [, value] of obj.entries()) stack.push(value);
    } else if (obj instanceof PDFArray) {
      stack.push(...obj.asArray());
    } else if (obj instanceof PDFStream) {
      stack.push(obj.dict);
    }
  }
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!seen.has(ref)) context.delete(ref);
  }
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
