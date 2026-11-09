export interface TextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  pageIndex: number;
  /** Baseline origin in PDF user space; used to locate the text in the content stream. */
  pdfX?: number;
  pdfY?: number;
  originalText?: string;
  isNew?: boolean;
  isBold?: boolean;
  isItalic?: boolean;
}

export type Tool = "select" | "text" | "colorout" | "crop";

/** In PDF points, relative to the top-left of the rendered page. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColoroutBox extends Rect {
  id: string;
  pageIndex: number;
  color: string;
}

export interface PageData {
  pageIndex: number;
  width: number;
  height: number;
  viewport: { width: number; height: number; scale: number };
  textItems: TextItem[];
}

export interface EditorState {
  pages: PageData[];
  editedItems: Map<string, TextItem>;
  newItems: TextItem[];
  selectedItemId: string | null;
  activeTool: Tool;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  isBold: boolean;
  isItalic: boolean;
  scale: number;
}
