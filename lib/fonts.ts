import type { CustomFont, TextStyle } from "./types";

/** Families that export as the matching PDF standard font. */
export const STANDARD_FAMILIES = ["Helvetica", "Times", "Courier"] as const;

const CSS_STACKS: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  Times: '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
};

export function cssFontFamily(family: string) {
  return CSS_STACKS[family] ?? `"${family}", Helvetica, Arial, sans-serif`;
}

export const LINE_HEIGHT = 1.2;

let measureCtx: CanvasRenderingContext2D | null = null;

/** Width of a single line in points. */
export function textWidth(text: string, style: Pick<TextStyle, "fontFamily" | "fontSize" | "bold" | "italic">) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * style.fontSize * 0.5;
  measureCtx.font = `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}${style.fontSize}px ${cssFontFamily(style.fontFamily)}`;
  return measureCtx.measureText(text).width;
}

/** Size of a block of text in points, matching how the editor renders it. */
export function measureText(text: string, style: TextStyle) {
  const lines = text.split("\n");
  const width = Math.max(...lines.map((l) => textWidth(l || " ", style)));
  return { width: Math.ceil(width) + 2, height: lines.length * style.fontSize * LINE_HEIGHT };
}

const MAX_FONT_BYTES = 10 * 1024 * 1024;

/** Validates a TTF/OTF upload by its signature and registers it for on-screen preview. */
export async function loadCustomFont(file: File): Promise<CustomFont> {
  if (file.size > MAX_FONT_BYTES) throw new Error("Font files must be under 10 MB.");
  const bytes = await file.arrayBuffer();
  const sig = new Uint8Array(bytes.slice(0, 4));
  const tag = String.fromCharCode(...sig);
  const isTrueType = sig[0] === 0 && sig[1] === 1 && sig[2] === 0 && sig[3] === 0;
  if (!isTrueType && tag !== "OTTO" && tag !== "true") {
    throw new Error("Only TrueType (.ttf) and OpenType (.otf) fonts are supported.");
  }
  const name = file.name.replace(/\.(ttf|otf)$/i, "").replace(/[^\w -]/g, "").slice(0, 60) || "Custom font";
  const face = new FontFace(name, bytes.slice(0));
  await face.load();
  document.fonts.add(face);
  return { name, bytes };
}
