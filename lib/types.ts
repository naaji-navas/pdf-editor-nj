/** All geometry is in PDF points, relative to the top-left of the visible page. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

/** A run of existing text extracted from the PDF. */
export interface TextRun extends Rect {
  id: string;
  pageIndex: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  /** Baseline origin in PDF user space; locates the text in the content stream. */
  pdfX: number;
  pdfY: number;
}

export interface TextEdit {
  run: TextRun;
  text: string;
  /** Only the properties the user explicitly changed. */
  style?: Partial<TextStyle>;
}

export interface ExistingLink {
  id: string;
  pageIndex: number;
  rect: Rect;
  /** Annotation rectangle in PDF user space, used to find it again on export. */
  pdfRect: [number, number, number, number];
  url?: string;
  page?: number;
}

export interface LinkEdit {
  link: ExistingLink;
  url?: string;
  page?: number;
  deleted?: boolean;
}

interface Placed extends Rect {
  id: string;
  pageIndex: number;
}

export interface TextObject extends Placed {
  kind: "text";
  text: string;
  style: TextStyle;
}

export interface ImageObject extends Placed {
  kind: "image";
  /** PNG or JPEG data URL. */
  src: string;
  opacity: number;
}

export interface ShapeObject extends Placed {
  kind: "rect" | "ellipse";
  stroke: string | null;
  fill: string | null;
  strokeWidth: number;
  opacity: number;
}

export interface LineObject {
  id: string;
  pageIndex: number;
  kind: "line" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export interface LinkObject extends Placed {
  kind: "link";
  url?: string;
  /** 1-based target page inside this document. */
  page?: number;
}

export interface ColoroutObject extends Placed {
  kind: "colorout";
  color: string;
}

export type PageObject = TextObject | ImageObject | ShapeObject | LineObject | LinkObject | ColoroutObject;
export type BoxObject = Exclude<PageObject, LineObject>;

export const isLine = (obj: PageObject): obj is LineObject => obj.kind === "line" || obj.kind === "arrow";

export interface DocState {
  textEdits: Record<string, TextEdit>;
  linkEdits: Record<string, LinkEdit>;
  objects: PageObject[];
  crops: Record<number, Rect>;
}

export const EMPTY_DOC: DocState = { textEdits: {}, linkEdits: {}, objects: [], crops: {} };

export interface PageInfo {
  pageIndex: number;
  /** Visible page size in points. */
  width: number;
  height: number;
}

export interface CustomFont {
  name: string;
  bytes: ArrayBuffer;
}

export type Tool =
  | "select"
  | "text"
  | "image"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "link"
  | "colorout"
  | "crop";

export interface ToolDefaults {
  text: TextStyle;
  shape: { stroke: string | null; fill: string | null; strokeWidth: number; opacity: number };
  line: { stroke: string; strokeWidth: number; opacity: number };
  colorout: string;
}

export interface SearchHit {
  key: string;
  runId: string;
  pageIndex: number;
  start: number;
  end: number;
}

export type Selection =
  | { type: "object"; id: string }
  | { type: "run"; id: string }
  | { type: "link"; id: string }
  | { type: "crop"; pageIndex: number }
  | null;
