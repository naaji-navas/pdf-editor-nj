import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFPage,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";

export interface InPlaceEdit {
  id: string;
  /** Baseline origin of the original text in PDF user space (as reported by pdf.js). */
  pdfX: number;
  pdfY: number;
  originalText: string;
  newText: string;
  /** Rendered size in points; applied in place by changing the font size. */
  size?: number;
  color?: [number, number, number];
  /** Remove the original glyphs and let the caller redraw (e.g. a different font was chosen). */
  forceFallback?: boolean;
}

/** The original glyphs were removed, but the page font can't draw the new text, so the caller must. */
export interface FallbackDraw {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  color: [number, number, number];
  baseFont: string;
  /** When set, the text should end at this point instead of starting at x/y. */
  rightEdge?: { x: number; y: number };
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

const apply = (m: Matrix, x: number, y: number) => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});

// ---------------------------------------------------------------------------
// Content stream tokenizer. Works on a latin1 string so offsets equal byte offsets.

type Operand =
  | { t: "num"; v: number }
  | { t: "name"; v: string }
  | { t: "str"; bytes: number[] }
  | { t: "arr"; items: Operand[] }
  | { t: "other" };

interface Op {
  op: string;
  args: Operand[];
  start: number;
  end: number;
}

const isWs = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = (c: number) => "()<>[]{}/%".includes(String.fromCharCode(c));

function parseContent(s: string): Op[] {
  const ops: Op[] = [];
  let i = 0;
  let args: Operand[] = [];
  let argsStart = -1;

  const skipWs = () => {
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (isWs(c)) i++;
      else if (c === 37) while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++;
      else break;
    }
  };

  const readRegular = () => {
    const from = i;
    while (i < s.length && !isWs(s.charCodeAt(i)) && !isDelim(s.charCodeAt(i))) i++;
    return s.slice(from, i);
  };

  const readLiteral = (): number[] => {
    const out: number[] = [];
    let depth = 1;
    i++;
    while (i < s.length) {
      const ch = s[i++];
      if (ch === "\\") {
        const e = s[i++];
        const simple: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
        if (e in simple) out.push(simple[e]);
        else if (e >= "0" && e <= "7") {
          let oct = e;
          while (oct.length < 3 && s[i] >= "0" && s[i] <= "7") oct += s[i++];
          out.push(parseInt(oct, 8) & 0xff);
        } else if (e === "\r") {
          if (s[i] === "\n") i++;
        } else if (e !== "\n") out.push(e.charCodeAt(0));
      } else if (ch === "(") {
        depth++;
        out.push(40);
      } else if (ch === ")") {
        if (--depth === 0) break;
        out.push(41);
      } else out.push(ch.charCodeAt(0));
    }
    return out;
  };

  const readHex = (): number[] => {
    const end = s.indexOf(">", i);
    const hex = s.slice(i + 1, end < 0 ? s.length : end).replace(/[^0-9a-fA-F]/g, "");
    i = end < 0 ? s.length : end + 1;
    const padded = hex.length % 2 ? hex + "0" : hex;
    const out: number[] = [];
    for (let k = 0; k < padded.length; k += 2) out.push(parseInt(padded.slice(k, k + 2), 16));
    return out;
  };

  // Returns null when the next token is an operator keyword
  const readValue = (): Operand | null => {
    skipWs();
    const ch = s[i];
    if (ch === "(") return { t: "str", bytes: readLiteral() };
    if (ch === "<") {
      if (s[i + 1] === "<") {
        i += 2;
        for (;;) {
          skipWs();
          if (i >= s.length) break;
          if (s[i] === ">" && s[i + 1] === ">") {
            i += 2;
            break;
          }
          if (readValue() === null) readRegular();
        }
        return { t: "other" };
      }
      return { t: "str", bytes: readHex() };
    }
    if (ch === "[") {
      i++;
      const items: Operand[] = [];
      for (;;) {
        skipWs();
        if (i >= s.length) break;
        if (s[i] === "]") {
          i++;
          break;
        }
        const v = readValue();
        if (v) items.push(v);
        else readRegular();
      }
      return { t: "arr", items };
    }
    if (ch === "/") {
      i++;
      return { t: "name", v: readRegular() };
    }
    if (ch === "]" || ch === ">" || ch === ")" || ch === "{" || ch === "}") {
      i++;
      return { t: "other" };
    }
    const save = i;
    const word = readRegular();
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { t: "num", v: parseFloat(word) };
    if (word === "true" || word === "false" || word === "null") return { t: "other" };
    i = save;
    return null;
  };

  while (i < s.length) {
    skipWs();
    if (i >= s.length) break;
    const tokenStart = i;
    const v = readValue();
    if (v) {
      if (argsStart < 0) argsStart = tokenStart;
      args.push(v);
      continue;
    }
    const op = readRegular();
    if (!op) {
      i++;
      continue;
    }
    ops.push({ op, args, start: argsStart < 0 ? tokenStart : argsStart, end: i });
    args = [];
    argsStart = -1;
    if (op === "ID") {
      // Inline image data is binary; skip to the EI that ends it
      const re = /\sEI(?=\s|$)/g;
      re.lastIndex = i + 1;
      const m = re.exec(s);
      i = m ? m.index + m[0].length : s.length;
    }
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Fonts

interface FontInfo {
  supported: boolean;
  bytesPerCode: 1 | 2;
  embedded: boolean;
  baseFont: string;
  toUnicode: Map<number, string>;
  width: (code: number) => number;
  usedCodes: Set<number>;
}

const GLYPH_NAMES: Record<string, string> = {
  space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%", ampersand: "&",
  quotesingle: "'", quoteright: "\u2019", quoteleft: "\u2018", parenleft: "(", parenright: ")",
  asterisk: "*", plus: "+", comma: ",", hyphen: "-", minus: "\u2212", period: ".", slash: "/",
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8",
  nine: "9", colon: ":", semicolon: ";", less: "<", equal: "=", greater: ">", question: "?", at: "@",
  bracketleft: "[", backslash: "\\", bracketright: "]", asciicircum: "^", underscore: "_", grave: "`",
  braceleft: "{", bar: "|", braceright: "}", asciitilde: "~", endash: "\u2013", emdash: "\u2014",
  bullet: "\u2022", ellipsis: "\u2026", quotedblleft: "\u201c", quotedblright: "\u201d", Euro: "\u20ac",
  sterling: "\u00a3", yen: "\u00a5", cent: "\u00a2", degree: "\u00b0", copyright: "\u00a9",
  registered: "\u00ae", trademark: "\u2122", nbspace: "\u00a0",
};

function glyphNameToUnicode(name: string): string {
  if (name in GLYPH_NAMES) return GLYPH_NAMES[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  const uni = /^uni([0-9A-Fa-f]{4})$/.exec(name) ?? /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (uni) return String.fromCodePoint(parseInt(uni[1], 16));
  return "";
}

function utf16HexToString(hex: string): string {
  const units: number[] = [];
  for (let k = 0; k + 4 <= hex.length; k += 4) units.push(parseInt(hex.slice(k, k + 4), 16));
  if (hex.length === 2) units.push(parseInt(hex, 16));
  return String.fromCharCode(...units);
}

function parseToUnicode(text: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(parseInt(m[1], 16), utf16HexToString(m[2]));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16);
      const hi = Math.min(parseInt(m[2], 16), lo + 0xffff);
      if (m[3].startsWith("[")) {
        const dsts = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((d) => utf16HexToString(d[1]));
        dsts.forEach((d, k) => lo + k <= hi && map.set(lo + k, d));
      } else {
        const base = m[3].slice(1, -1);
        const start = utf16HexToString(base);
        for (let c = lo; c <= hi; c++) {
          const last = start.charCodeAt(start.length - 1) + (c - lo);
          map.set(c, start.slice(0, -1) + String.fromCharCode(last));
        }
      }
    }
  }
  return map;
}

const latin1 = (bytes: Uint8Array) => {
  let out = "";
  for (let k = 0; k < bytes.length; k += 8192) {
    out += String.fromCharCode(...bytes.subarray(k, k + 8192));
  }
  return out;
};

function loadFont(doc: PDFDocument, dict: PDFDict): FontInfo {
  const num = (o: unknown, d = 0) => (o instanceof PDFNumber ? o.asNumber() : d);
  const nameOf = (o: unknown) => (o instanceof PDFName ? o.decodeText() : "");
  const subtype = nameOf(dict.lookup(PDFName.of("Subtype")));
  const baseFont = nameOf(dict.lookup(PDFName.of("BaseFont"))).replace(/^[A-Z]{6}\+/, "");
  const info: FontInfo = {
    supported: subtype !== "Type3",
    bytesPerCode: 1,
    embedded: false,
    baseFont,
    toUnicode: new Map(),
    width: () => 0.5,
    usedCodes: new Set(),
  };

  const hasFontFile = (desc: unknown) =>
    desc instanceof PDFDict &&
    ["FontFile", "FontFile2", "FontFile3"].some((k) => desc.has(PDFName.of(k)));

  const tu = dict.lookup(PDFName.of("ToUnicode"));
  if (tu instanceof PDFRawStream) {
    try {
      info.toUnicode = parseToUnicode(latin1(decodePDFRawStream(tu).decode()));
    } catch {
      /* treat as no ToUnicode */
    }
  }

  if (subtype === "Type0") {
    info.bytesPerCode = 2;
    const encoding = nameOf(dict.lookup(PDFName.of("Encoding")));
    // Vertical writing and non-identity CMaps would need a CMap parser
    if (encoding !== "Identity-H") info.supported = false;
    const descendants = dict.lookup(PDFName.of("DescendantFonts"));
    const cid = descendants instanceof PDFArray ? descendants.lookup(0) : undefined;
    if (cid instanceof PDFDict) {
      info.embedded = hasFontFile(cid.lookup(PDFName.of("FontDescriptor")));
      const dw = num(cid.lookup(PDFName.of("DW")), 1000);
      const single = new Map<number, number>();
      const ranges: [number, number, number][] = [];
      const w = cid.lookup(PDFName.of("W"));
      if (w instanceof PDFArray) {
        const items = w.asArray().map((x) => doc.context.lookup(x));
        for (let k = 0; k < items.length; ) {
          const first = num(items[k]);
          const next = items[k + 1];
          if (next instanceof PDFArray) {
            next.asArray().forEach((x, j) => single.set(first + j, num(doc.context.lookup(x))));
            k += 2;
          } else {
            ranges.push([first, num(next), num(items[k + 2])]);
            k += 3;
          }
        }
      }
      info.width = (code) => {
        const s = single.get(code);
        if (s !== undefined) return s / 1000;
        const r = ranges.find(([lo, hi]) => code >= lo && code <= hi);
        return (r ? r[2] : dw) / 1000;
      };
    }
    if (!info.toUnicode.size) info.supported = false;
    return info;
  }

  const desc = dict.lookup(PDFName.of("FontDescriptor"));
  info.embedded = hasFontFile(desc);
  const widths = dict.lookup(PDFName.of("Widths"));
  if (widths instanceof PDFArray) {
    const firstChar = num(dict.lookup(PDFName.of("FirstChar")));
    const missing = desc instanceof PDFDict ? num(desc.lookup(PDFName.of("MissingWidth"))) : 0;
    const list = widths.asArray().map((x) => num(doc.context.lookup(x)));
    info.width = (code) => (list[code - firstChar] ?? missing) / 1000;
  }

  if (!info.toUnicode.size) {
    const enc = dict.lookup(PDFName.of("Encoding"));
    const baseName = enc instanceof PDFName ? enc.decodeText() : enc instanceof PDFDict ? nameOf(enc.lookup(PDFName.of("BaseEncoding"))) : "";
    const decoder = new TextDecoder(baseName === "MacRomanEncoding" ? "macintosh" : "windows-1252");
    for (let c = 32; c < 256; c++) info.toUnicode.set(c, decoder.decode(new Uint8Array([c])));
    const diffs = enc instanceof PDFDict ? enc.lookup(PDFName.of("Differences")) : undefined;
    if (diffs instanceof PDFArray) {
      let code = 0;
      for (const item of diffs.asArray().map((x) => doc.context.lookup(x))) {
        if (item instanceof PDFNumber) code = item.asNumber();
        else if (item instanceof PDFName) info.toUnicode.set(code++, glyphNameToUnicode(item.decodeText()));
      }
    }
  }
  return info;
}

// ---------------------------------------------------------------------------
// Page interpretation

interface Atom {
  kind: "glyph" | "kern";
  code: number;
  unicode: string;
  /** Horizontal advance in unscaled text space (before Tz). */
  adv: number;
  /** Glyph start and end points in user space */
  x: number;
  y: number;
  ex: number;
  ey: number;
  kern: number;
}

interface ShowOp {
  stream: number;
  op: Op;
  font: FontInfo;
  fontName: string;
  fontSize: number;
  /** Raw operators that set the current fill color, to restore it after a recolored run */
  fillOps: string;
  charSpacing: number;
  wordSpacing: number;
  invisible: boolean;
  /** Effective rendered size and angle in user space */
  size: number;
  rotation: number;
  color: [number, number, number];
  atoms: Atom[];
}

interface GState {
  ctm: Matrix;
  color: [number, number, number];
  fillOps: string;
  colorSpaceOp: string;
  font: FontInfo | null;
  fontName: string;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
  renderMode: number;
}

function interpretPage(
  doc: PDFDocument,
  page: PDFPage,
  streams: string[]
): ShowOp[] {
  const fontsDict = page.node.Resources()?.lookup(PDFName.of("Font"));
  const fontCache = new Map<string, FontInfo | null>();
  const getFont = (name: string) => {
    if (!fontCache.has(name)) {
      const dict = fontsDict instanceof PDFDict ? fontsDict.lookup(PDFName.of(name)) : undefined;
      fontCache.set(name, dict instanceof PDFDict ? loadFont(doc, dict) : null);
    }
    return fontCache.get(name)!;
  };

  const shows: ShowOp[] = [];
  let gs: GState = {
    ctm: IDENTITY, color: [0, 0, 0], fillOps: "", colorSpaceOp: "", font: null, fontName: "", fontSize: 0, charSpacing: 0,
    wordSpacing: 0, hScale: 1, leading: 0, rise: 0, renderMode: 0,
  };
  const stack: GState[] = [];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;

  const nums = (args: Operand[]) => args.map((a) => (a.t === "num" ? a.v : 0));
  const nextLine = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };

  const show = (stream: number, op: Op, parts: Operand[]) => {
    const font = gs.font;
    if (!font) return;
    const m = mul(tm, gs.ctm);
    const run: ShowOp = {
      stream, op, font,
      fontName: gs.fontName,
      fontSize: gs.fontSize,
      fillOps: gs.fillOps,
      charSpacing: gs.charSpacing,
      wordSpacing: gs.wordSpacing,
      invisible: gs.renderMode === 3 || gs.renderMode === 7,
      size: Math.abs(gs.fontSize) * Math.hypot(m[2], m[3]),
      rotation: (Math.atan2(m[1], m[0]) * 180) / Math.PI,
      color: gs.color,
      atoms: [],
    };
    for (const part of parts) {
      if (part.t === "num") {
        const adv = (-part.v / 1000) * gs.fontSize;
        run.atoms.push({ kind: "kern", code: 0, unicode: "", adv, x: 0, y: 0, ex: 0, ey: 0, kern: part.v });
        tm = mul([1, 0, 0, 1, adv * gs.hScale, 0], tm);
      } else if (part.t === "str") {
        const b = part.bytes;
        for (let k = 0; k + font.bytesPerCode <= b.length; k += font.bytesPerCode) {
          const code = font.bytesPerCode === 2 ? (b[k] << 8) | b[k + 1] : b[k];
          const origin = apply(mul(tm, gs.ctm), 0, gs.rise);
          const adv =
            font.width(code) * gs.fontSize +
            gs.charSpacing +
            (font.bytesPerCode === 1 && code === 32 ? gs.wordSpacing : 0);
          font.usedCodes.add(code);
          tm = mul([1, 0, 0, 1, adv * gs.hScale, 0], tm);
          const end = apply(mul(tm, gs.ctm), 0, gs.rise);
          run.atoms.push({
            kind: "glyph", code, unicode: font.toUnicode.get(code) ?? "", adv,
            x: origin.x, y: origin.y, ex: end.x, ey: end.y, kern: 0,
          });
        }
      }
    }
    shows.push(run);
  };

  streams.forEach((content, streamIndex) => {
    for (const op of parseContent(content)) {
      const a = op.args;
      const n = nums(a);
      const raw = () => content.slice(op.start, op.end);
      switch (op.op) {
        case "q": stack.push({ ...gs }); break;
        case "Q": if (stack.length) gs = stack.pop()!; break;
        case "cm": if (n.length === 6) gs.ctm = mul(n as Matrix, gs.ctm); break;
        case "g": gs.color = [n[0], n[0], n[0]]; gs.fillOps = raw(); break;
        case "rg": gs.color = [n[0], n[1], n[2]]; gs.fillOps = raw(); break;
        case "k": {
          const [c, mg, y, kk] = n;
          gs.color = [(1 - c) * (1 - kk), (1 - mg) * (1 - kk), (1 - y) * (1 - kk)];
          gs.fillOps = raw();
          break;
        }
        case "cs": gs.color = [0, 0, 0]; gs.colorSpaceOp = gs.fillOps = raw(); break;
        case "sc": case "scn": {
          const v = a.filter((x) => x.t === "num").map((x) => (x as { v: number }).v);
          if (v.length === 1) gs.color = [v[0], v[0], v[0]];
          else if (v.length === 3) gs.color = [v[0], v[1], v[2]];
          else if (v.length === 4) gs.color = [(1 - v[0]) * (1 - v[3]), (1 - v[1]) * (1 - v[3]), (1 - v[2]) * (1 - v[3])];
          gs.fillOps = `${gs.colorSpaceOp} ${raw()}`.trim();
          break;
        }
        case "BT": tm = tlm = IDENTITY; break;
        case "Tf":
          gs.font = a[0]?.t === "name" ? getFont(a[0].v) : null;
          gs.fontName = a[0]?.t === "name" ? a[0].v : "";
          gs.fontSize = n[1] ?? 0;
          break;
        case "Tc": gs.charSpacing = n[0]; break;
        case "Tw": gs.wordSpacing = n[0]; break;
        case "Tz": gs.hScale = n[0] / 100; break;
        case "TL": gs.leading = n[0]; break;
        case "Ts": gs.rise = n[0]; break;
        case "Tr": gs.renderMode = n[0]; break;
        case "Td": nextLine(n[0], n[1]); break;
        case "TD": gs.leading = -n[1]; nextLine(n[0], n[1]); break;
        case "Tm": if (n.length === 6) tm = tlm = n as Matrix; break;
        case "T*": nextLine(0, -gs.leading); break;
        case "Tj": show(streamIndex, op, a.slice(-1)); break;
        case "TJ": if (a[0]?.t === "arr") show(streamIndex, op, a[0].items); break;
        case "'": nextLine(0, -gs.leading); show(streamIndex, op, a.slice(-1)); break;
        case '"':
          gs.wordSpacing = n[0];
          gs.charSpacing = n[1];
          nextLine(0, -gs.leading);
          show(streamIndex, op, a.slice(-1));
          break;
      }
    }
  });
  return shows;
}

// ---------------------------------------------------------------------------
// Rewriting

interface Mod {
  from: number;
  to: number;
  insert: number[];
  alignRight: boolean;
  /** New font size (Tf operand) and/or fill color for the inserted text */
  restyle?: { fontSize?: number; color?: [number, number, number] };
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

function rebuildShowOp(show: ShowOp, mods: Mod[]): string {
  const { font, fontSize, atoms } = show;
  const hex = (codes: number[]) =>
    "<" + codes.map((c) => c.toString(16).padStart(font.bytesPerCode * 2, "0")).join("") + ">";
  const advanceOf = (codes: number[], size: number) =>
    codes.reduce(
      (sum, c) =>
        sum + font.width(c) * size + show.charSpacing +
        (font.bytesPerCode === 1 && c === 32 ? show.wordSpacing : 0),
      0
    );

  // Restyled runs need their own TJ wrapped in Tf / color operators, so the op is
  // emitted as consecutive TJ segments (equivalent, since each continues where the last ended)
  const segments: string[] = [];
  let elems: string[] = [];
  let chunk: number[] = [];
  const flush = () => {
    if (chunk.length) elems.push(hex(chunk));
    chunk = [];
  };
  const endSegment = (pre = "", post = "") => {
    flush();
    if (elems.length) segments.push(`${pre}[${elems.join(" ")}] TJ${post}`);
    elems = [];
  };

  for (let a = 0; a < atoms.length; a++) {
    const mod = mods.find((m) => m.from === a);
    if (mod) {
      let removed = 0;
      for (let k = mod.from; k <= mod.to; k++) removed += atoms[k].adv;
      const size = mod.restyle?.fontSize ?? fontSize;
      // Pads before (right-aligned) or after the new text so the run keeps its original
      // extent and anything drawn after it stays where it was
      const kern = size ? ((advanceOf(mod.insert, size) - removed) * 1000) / size : 0;
      const pad = Math.abs(kern) > 0.01;
      if (mod.restyle) endSegment();
      if (mod.alignRight && pad) {
        flush();
        elems.push(fmt(kern));
      }
      chunk.push(...mod.insert);
      if (!mod.alignRight && pad) {
        flush();
        elems.push(fmt(kern));
      }
      if (mod.restyle) {
        const pre: string[] = [];
        const post: string[] = [];
        if (mod.restyle.fontSize !== undefined) {
          pre.push(`/${show.fontName} ${fmt(size)} Tf`);
          post.push(`/${show.fontName} ${fmt(fontSize)} Tf`);
        }
        if (mod.restyle.color) {
          pre.push(`${mod.restyle.color.map(fmt).join(" ")} rg`);
          post.push(show.fillOps || "0 g");
        }
        endSegment(pre.join(" ") + " ", " " + post.join(" "));
      }
      a = mod.to;
      continue;
    }
    const atom = atoms[a];
    if (atom.kind === "kern") {
      flush();
      elems.push(fmt(atom.kern));
    } else chunk.push(atom.code);
  }
  endSegment();

  const body = segments.join(" ") || "[] TJ";
  if (show.op.op === "'") return `T* ${body}`;
  if (show.op.op === '"') return `${fmt(show.wordSpacing)} Tw ${fmt(show.charSpacing)} Tc T* ${body}`;
  return body;
}

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

function contentRefs(doc: PDFDocument, page: PDFPage): PDFRef[] {
  const contents = page.node.get(PDFName.of("Contents"));
  const resolved = contents instanceof PDFRef ? doc.context.lookup(contents) : contents;
  if (resolved instanceof PDFArray) {
    return resolved.asArray().filter((r): r is PDFRef => r instanceof PDFRef);
  }
  return contents instanceof PDFRef ? [contents] : [];
}

/**
 * Rewrites edited text directly in the page content stream using the page's own font.
 * Returns the ids it handled; text whose characters the font can't draw has its original
 * glyphs removed and is returned in `fallbacks` for the caller to draw.
 */
export function editPageText(
  doc: PDFDocument,
  page: PDFPage,
  edits: InPlaceEdit[]
): { handled: Set<string>; fallbacks: FallbackDraw[] } {
  const handled = new Set<string>();
  const fallbacks: FallbackDraw[] = [];

  const refs = contentRefs(doc, page);
  const streams: string[] = [];
  for (const ref of refs) {
    const stream = doc.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) return { handled, fallbacks };
    try {
      streams.push(latin1(decodePDFRawStream(stream).decode()));
    } catch {
      return { handled, fallbacks };
    }
  }

  const shows = interpretPage(doc, page, streams);
  const glyphs: { show: ShowOp; atom: number }[] = [];
  for (const show of shows) {
    show.atoms.forEach((atom, i) => atom.kind === "glyph" && glyphs.push({ show, atom: i }));
  }
  const used = new Array<boolean>(glyphs.length).fill(false);

  // Values in receipts/invoices are often right-aligned; detect it by other text ending at the same x
  const extents = shows.flatMap((show) => {
    const visible = show.atoms.filter((a) => a.kind === "glyph" && a.unicode.trim());
    return show.invisible || !visible.length
      ? []
      : [{ show, left: visible[0].x, right: visible[visible.length - 1].ex }];
  });
  const isRightAligned = (show: ShowOp, left: number, right: number) =>
    Math.abs(show.rotation) < 1 &&
    extents.some((e) => e.show !== show && Math.abs(e.right - right) < 0.5 && Math.abs(e.left - left) > 1);
  const modsByShow = new Map<ShowOp, Mod[]>();
  const addMod = (show: ShowOp, mod: Mod) => {
    const list = modsByShow.get(show) ?? [];
    list.push(mod);
    modsByShow.set(show, list);
  };

  for (const edit of edits) {
    const target = norm(edit.originalText);
    if (!target) continue;

    let best: { start: number; end: number; dist: number } | null = null;
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const first = norm(g.show.atoms[g.atom].unicode);
      if (used[i] || !first || g.show.invisible || !target.startsWith(first)) continue;
      const atom = g.show.atoms[g.atom];
      const dist = Math.hypot(atom.x - edit.pdfX, atom.y - edit.pdfY);
      if (dist > Math.max(3, g.show.size) || (best && dist >= best.dist)) continue;

      let acc = "";
      let j = i;
      for (; j < glyphs.length && acc.length < target.length; j++) {
        if (used[j]) break;
        acc += norm(glyphs[j].show.atoms[glyphs[j].atom].unicode);
      }
      if (acc === target) best = { start: i, end: j - 1, dist };
    }
    if (!best) continue;

    const startShow = glyphs[best.start].show;
    const { font } = startShow;
    const codes: number[] = [];
    const available = new Map<string, number>();
    for (const [code, uni] of font.toUnicode) {
      if (!available.has(uni) && (!font.embedded || font.usedCodes.has(code))) available.set(uni, code);
    }
    let encodable = font.supported && !edit.forceFallback;
    for (const ch of edit.newText) {
      const code = available.get(ch) ?? (ch === "\u00a0" ? available.get(" ") : undefined);
      if (code === undefined) {
        encodable = false;
        break;
      }
      codes.push(code);
    }

    const startAtom = startShow.atoms[glyphs[best.start].atom];
    const endAtom = glyphs[best.end].show.atoms[glyphs[best.end].atom];
    const alignRight =
      glyphs[best.end].show === startShow && isRightAligned(startShow, startAtom.x, endAtom.ex);

    const wantsSize = edit.size !== undefined && startShow.size > 0 && Math.abs(edit.size - startShow.size) > 0.05;
    const restyle =
      encodable && (wantsSize || edit.color)
        ? {
            fontSize: wantsSize ? (startShow.fontSize * edit.size!) / startShow.size : undefined,
            color: edit.color,
          }
        : undefined;

    for (let k = best.start; k <= best.end; k++) used[k] = true;
    let k = best.start;
    while (k <= best.end) {
      const { show } = glyphs[k];
      let last = k;
      while (last + 1 <= best.end && glyphs[last + 1].show === show) last++;
      const first = k === best.start;
      addMod(show, {
        from: first ? glyphs[k].atom : 0,
        to: glyphs[last].atom,
        insert: first && encodable ? codes : [],
        alignRight,
        restyle: first ? restyle : undefined,
      });
      k = last + 1;
    }

    handled.add(edit.id);
    if (!encodable) {
      fallbacks.push({
        id: edit.id,
        text: edit.newText,
        x: startAtom.x,
        y: startAtom.y,
        size: startShow.size,
        rotation: startShow.rotation,
        color: startShow.color,
        baseFont: font.baseFont,
        rightEdge: alignRight ? { x: endAtom.ex, y: endAtom.ey } : undefined,
      });
    }
  }

  if (!modsByShow.size) return { handled, fallbacks };

  const replacements = streams.map(() => [] as { start: number; end: number; text: string }[]);
  for (const [show, mods] of modsByShow) {
    replacements[show.stream].push({ start: show.op.start, end: show.op.end, text: rebuildShowOp(show, mods) });
  }
  replacements.forEach((list, i) => {
    if (!list.length) return;
    let content = streams[i];
    for (const r of list.sort((x, y) => y.start - x.start)) {
      content = content.slice(0, r.start) + r.text + content.slice(r.end);
    }
    const bytes = Uint8Array.from(content, (c) => c.charCodeAt(0));
    const original = doc.context.lookup(refs[i]) as PDFStream;
    const next = doc.context.flateStream(bytes);
    for (const [key, value] of original.dict.entries()) {
      const name = key.decodeText();
      if (!["Length", "Filter", "DecodeParms", "DL"].includes(name)) next.dict.set(key, value);
    }
    doc.context.assign(refs[i], next);
  });

  return { handled, fallbacks };
}
