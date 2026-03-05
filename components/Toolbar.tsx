"use client";

interface ToolbarProps {
  fileName: string;
  activeTool: "select" | "text";
  onToolChange: (tool: "select" | "text") => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  fontFamily: string;
  onFontFamilyChange: (family: string) => void;
  fontColor: string;
  onFontColorChange: (color: string) => void;
  isBold: boolean;
  onBoldChange: (bold: boolean) => void;
  isItalic: boolean;
  onItalicChange: (italic: boolean) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  onDownload: () => void;
  onBack: () => void;
  hasEdits: boolean;
}

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial" },
  { label: "Arial Narrow", value: "Arial Narrow" },
  { label: "Helvetica", value: "Helvetica" },
  { label: "Helvetica Neue", value: "Helvetica Neue" },
  { label: "Geneva", value: "Geneva" },
  { label: "Verdana", value: "Verdana" },
  { label: "Tahoma", value: "Tahoma" },
  { label: "Trebuchet MS", value: "Trebuchet MS" },
  { label: "Lucida Sans", value: "Lucida Sans" },
  { label: "Gill Sans", value: "Gill Sans" },
  { label: "Futura", value: "Futura" },
  { label: "Optima", value: "Optima" },
  { label: "Calibri", value: "Calibri" },
  { label: "Segoe UI", value: "Segoe UI" },
  { label: "Ubuntu", value: "Ubuntu" },
  { label: "Roboto", value: "Roboto" },
  { label: "Open Sans", value: "Open Sans" },
  { label: "Lato", value: "Lato" },
  { label: "Source Sans Pro", value: "Source Sans Pro" },
  { label: "Century Gothic", value: "Century Gothic" },
  { label: "Franklin Gothic", value: "Franklin Gothic" },
  { label: "Impact", value: "Impact" },
  { label: "Comic Sans MS", value: "Comic Sans MS" },
  { label: "MS Sans Serif", value: "MS Sans Serif" },
  { label: "Liberation Sans", value: "Liberation Sans" },
  { label: "DejaVu Sans", value: "DejaVu Sans" },
  { label: "Nimbus Sans", value: "Nimbus Sans" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Times", value: "Times" },
  { label: "Georgia", value: "Georgia" },
  { label: "Palatino", value: "Palatino" },
  { label: "Palatino Linotype", value: "Palatino Linotype" },
  { label: "Garamond", value: "Garamond" },
  { label: "Bookman", value: "Bookman" },
  { label: "Century Schoolbook", value: "Century Schoolbook" },
  { label: "Cambria", value: "Cambria" },
  { label: "Baskerville", value: "Baskerville" },
  { label: "Didot", value: "Didot" },
  { label: "Bodoni", value: "Bodoni" },
  { label: "Hoefler Text", value: "Hoefler Text" },
  { label: "Lucida Bright", value: "Lucida Bright" },
  { label: "MS Serif", value: "MS Serif" },
  { label: "Liberation Serif", value: "Liberation Serif" },
  { label: "DejaVu Serif", value: "DejaVu Serif" },
  { label: "Courier New", value: "Courier New" },
  { label: "Courier", value: "Courier" },
  { label: "Consolas", value: "Consolas" },
  { label: "Monaco", value: "Monaco" },
  { label: "Menlo", value: "Menlo" },
  { label: "Andale Mono", value: "Andale Mono" },
  { label: "Letter Gothic", value: "Letter Gothic" },
  { label: "Liberation Mono", value: "Liberation Mono" },
  { label: "DejaVu Sans Mono", value: "DejaVu Sans Mono" },
  { label: "Nimbus Mono", value: "Nimbus Mono" },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];

export default function Toolbar({
  fileName,
  activeTool,
  onToolChange,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontFamilyChange,
  fontColor,
  onFontColorChange,
  isBold,
  onBoldChange,
  isItalic,
  onItalicChange,
  scale,
  onScaleChange,
  onDownload,
  onBack,
  hasEdits,
}: ToolbarProps) {
  return (
    <div className="flex h-14 items-center gap-1 border-b border-gray-200 bg-white px-3 shadow-sm">
      <button
        onClick={onBack}
        className="mr-2 flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        title="Back"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
      </button>

      <span className="mr-3 max-w-[140px] truncate text-sm font-medium text-gray-700" title={fileName}>
        {fileName}
      </span>

      <div className="mx-2 h-6 w-px bg-gray-200" />

      <button
        onClick={() => onToolChange("select")}
        className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
          activeTool === "select"
            ? "bg-blue-100 text-blue-700"
            : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Select & Edit (V)"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59" />
        </svg>
        Select
      </button>

      <button
        onClick={() => onToolChange("text")}
        className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
          activeTool === "text"
            ? "bg-blue-100 text-blue-700"
            : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Add Text (T)"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 4v3h5.5v12h3V7H19V4H5z" />
        </svg>
        Text
      </button>

      <div className="mx-2 h-6 w-px bg-gray-200" />

      <select
        value={fontFamily}
        onChange={(e) => onFontFamilyChange(e.target.value)}
        className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-blue-400"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        value={fontSize}
        onChange={(e) => onFontSizeChange(Number(e.target.value))}
        className="h-8 w-16 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-blue-400"
      >
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <button
        onClick={() => onBoldChange(!isBold)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
          isBold ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Bold"
      >
        B
      </button>

      <button
        onClick={() => onItalicChange(!isItalic)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm italic transition-colors ${
          isItalic ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Italic"
      >
        I
      </button>

      <div className="relative">
        <input
          type="color"
          value={fontColor}
          onChange={(e) => onFontColorChange(e.target.value)}
          className="absolute inset-0 h-8 w-8 cursor-pointer opacity-0"
          title="Text Color"
        />
        <div className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100">
          <div className="text-sm font-bold" style={{ color: fontColor }}>
            A
          </div>
          <div
            className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded-full"
            style={{ backgroundColor: fontColor }}
          />
        </div>
      </div>

      <div className="mx-2 h-6 w-px bg-gray-200" />

      <button
        onClick={() => onScaleChange(Math.max(0.5, scale - 0.25))}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
        title="Zoom Out"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      </button>

      <span className="w-12 text-center text-xs text-gray-500">
        {Math.round(scale * 100)}%
      </span>

      <button
        onClick={() => onScaleChange(Math.min(3, scale + 0.25))}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
        title="Zoom In"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <div className="flex-1" />

      <button
        onClick={onDownload}
        disabled={!hasEdits}
        className={`flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
          hasEdits
            ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
            : "cursor-not-allowed bg-gray-100 text-gray-400"
        }`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Download PDF
      </button>
    </div>
  );
}
