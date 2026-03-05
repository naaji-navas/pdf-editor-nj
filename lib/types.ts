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
  originalText?: string;
  isNew?: boolean;
  isBold?: boolean;
  isItalic?: boolean;
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
  activeTool: "select" | "text";
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  isBold: boolean;
  isItalic: boolean;
  scale: number;
}
