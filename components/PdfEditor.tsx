"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem, PageData, Rect, Tool, ColoroutBox } from "@/lib/types";
import { loadPdf, renderPage, renderPageImage } from "@/lib/pdf-renderer";
import { applyEdits } from "@/lib/pdf-modifier";
import { normalizePdfFontToToolbar, clampToToolbarFont } from "@/lib/font-utils";
import Toolbar from "./Toolbar";
import PdfPage, { cropId } from "./PdfPage";

interface PdfEditorProps {
  pdfData: ArrayBuffer;
  fileName: string;
  onBack: () => void;
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
};

const DOWNLOAD_FRAME = "pdf-download-frame";

// A real HTTP attachment download; blob-URL downloads stall as "Unconfirmed" in some browsers
function submitDownloadForm(blob: Blob, fileName: string) {
  let frame = document.querySelector<HTMLIFrameElement>(`iframe[name="${DOWNLOAD_FRAME}"]`);
  if (!frame) {
    frame = document.createElement("iframe");
    frame.name = DOWNLOAD_FRAME;
    frame.hidden = true;
    document.body.appendChild(frame);
  }

  const files = new DataTransfer();
  files.items.add(new File([blob], fileName, { type: "application/pdf" }));
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.name = "file";
  fileInput.files = files.files;

  const nameInput = document.createElement("input");
  nameInput.type = "hidden";
  nameInput.name = "name";
  nameInput.value = fileName;

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/download";
  form.enctype = "multipart/form-data";
  form.target = DOWNLOAD_FRAME;
  form.hidden = true;
  form.append(fileInput, nameInput);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

interface RenderedPage {
  pageData: PageData;
  canvasDataUrl: string;
}

export default function PdfEditor({ pdfData, fileName, onBack }: PdfEditorProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editedItems, setEditedItems] = useState<Map<string, TextItem>>(new Map());
  const [newItems, setNewItems] = useState<TextItem[]>([]);
  const [colorouts, setColorouts] = useState<ColoroutBox[]>([]);
  const [crops, setCrops] = useState<Map<number, Rect>>(new Map());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState("Helvetica");
  const [fontColor, setFontColor] = useState("#000000");
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [coloroutColor, setColoroutColor] = useState("#ffffff");
  const [scale, setScale] = useState(1.5);
  const [downloading, setDownloading] = useState(false);

  const pdfDataRef = useRef(pdfData);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);
        const doc = await loadPdf(pdfData);
        if (cancelled) return;
        setPdf(doc);

        const pages: RenderedPage[] = [];
        for (let i = 0; i < doc.numPages; i++) {
          const { canvas, pageData } = await renderPage(doc, i, scale);
          if (cancelled) return;
          pages.push({
            pageData,
            canvasDataUrl: canvas.toDataURL(),
          });
        }
        setRenderedPages(pages);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [pdfData, scale]);

  // Re-render edited pages from the actual output so the preview matches the download
  const [editPreviews, setEditPreviews] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    if (editedItems.size === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const bytes = await applyEdits(pdfDataRef.current, [], editedItems, [], scale);
        const doc = await loadPdf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        const next = new Map<number, string>();
        for (const pageIndex of new Set([...editedItems.values()].map((item) => item.pageIndex))) {
          next.set(pageIndex, await renderPageImage(doc, pageIndex, scale));
        }
        await doc.destroy();
        if (!cancelled) setEditPreviews(next);
      } catch (err) {
        console.error("Failed to render edit preview:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [editedItems, scale]);

  const handleEditItem = useCallback(
    (id: string, newText: string) => {
      const existingNew = newItems.find((item) => item.id === id);
      if (existingNew) {
        setNewItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, text: newText } : item))
        );
        return;
      }

      setEditedItems((prev) => {
        const next = new Map(prev);
        const existing = next.get(id);
        if (existing) {
          next.set(id, { ...existing, text: newText });
        } else {
          for (const page of renderedPages) {
            const original = page.pageData.textItems.find((item) => item.id === id);
            if (original) {
              next.set(id, {
                ...original,
                text: newText,
                originalText: original.text,
                fontFamily,
                color: fontColor,
                isBold,
                isItalic,
              });
              break;
            }
          }
        }
        return next;
      });
    },
    [newItems, renderedPages, fontFamily, fontColor, isBold, isItalic]
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      setNewItems((prev) => prev.filter((item) => item.id !== id));
      setEditedItems((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setColorouts((prev) => prev.filter((box) => box.id !== id));
      setCrops((prev) => {
        const pageIndex = [...prev.keys()].find((i) => cropId(i) === id);
        if (pageIndex === undefined) return prev;
        const next = new Map(prev);
        next.delete(pageIndex);
        return next;
      });
      if (selectedItemId === id) setSelectedItemId(null);
    },
    [selectedItemId]
  );

  const handleAddColorout = useCallback((box: ColoroutBox) => {
    setColorouts((prev) => [...prev, box]);
  }, []);

  const handleUpdateColorout = useCallback((id: string, rect: Rect) => {
    setColorouts((prev) => prev.map((box) => (box.id === id ? { ...box, ...rect } : box)));
  }, []);

  const handleColoroutColorChange = useCallback(
    (color: string) => {
      setColoroutColor(color);
      setColorouts((prev) =>
        prev.map((box) => (box.id === selectedItemId ? { ...box, color } : box))
      );
    },
    [selectedItemId]
  );

  const handleSetCrop = useCallback((pageIndex: number, rect: Rect | null) => {
    setCrops((prev) => {
      const next = new Map(prev);
      if (rect) next.set(pageIndex, rect);
      else next.delete(pageIndex);
      return next;
    });
  }, []);

  const handleApplyCropToAll = useCallback(
    (rect: Rect) => {
      const next = new Map<number, Rect>();
      for (const { pageData } of renderedPages) {
        const pageWidth = pageData.width / scale;
        const pageHeight = pageData.height / scale;
        const x = Math.min(rect.x, pageWidth - 1);
        const y = Math.min(rect.y, pageHeight - 1);
        next.set(pageData.pageIndex, {
          x,
          y,
          width: Math.min(rect.width, pageWidth - x),
          height: Math.min(rect.height, pageHeight - y),
        });
      }
      setCrops(next);
    },
    [renderedPages, scale]
  );

  const handleMoveItem = useCallback((id: string, x: number, y: number) => {
    setNewItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, x, y } : item))
    );
  }, []);

  const handleAddNewText = useCallback((item: TextItem) => {
    setNewItems((prev) => [...prev, item]);
  }, []);

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
    if (id) setActiveTool("select");
  }, []);

  // When selection changes, sync toolbar to the selected item's font/size/color
  const getSelectedItem = useCallback(
    (): TextItem | null => {
      if (!selectedItemId) return null;
      const fromNew = newItems.find((i) => i.id === selectedItemId);
      if (fromNew) return fromNew;
      const fromEdited = editedItems.get(selectedItemId);
      if (fromEdited) return fromEdited;
      for (const { pageData } of renderedPages) {
        const fromPage = pageData.textItems.find((i) => i.id === selectedItemId);
        if (fromPage) return fromPage;
      }
      return null;
    },
    [selectedItemId, newItems, editedItems, renderedPages]
  );

  useEffect(() => {
    const box = colorouts.find((b) => b.id === selectedItemId);
    if (box) setColoroutColor(box.color);
    // Only sync on selection change, not on every colorout move/resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId]);

  useEffect(() => {
    const item = getSelectedItem();
    if (!item) return;
    const { fontFamily: normalized, isBold: bold, isItalic: italic } =
      normalizePdfFontToToolbar(item.fontFamily);
    setFontSize(item.fontSize);
    setFontFamily(clampToToolbarFont(normalized));
    setFontColor(item.color);
    setIsBold(item.isBold ?? bold);
    setIsItalic(item.isItalic ?? italic);
  }, [selectedItemId, getSelectedItem]);

  const handleDownload = useCallback(async () => {
    if (!pdf || downloading) return;
    const downloadName = `${fileName.replace(/\.pdf$/i, "")}-edited.pdf`;

    // Must be opened before any await so it still counts as part of the click
    let fileHandle: FileSystemFileHandle | null = null;
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    if (picker) {
      try {
        fileHandle = await picker({
          suggestedName: downloadName,
          types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }],
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        fileHandle = null;
      }
    }

    try {
      setDownloading(true);
      const modifiedBytes = await applyEdits(
        pdfDataRef.current,
        renderedPages.map((p) => p.pageData),
        editedItems,
        newItems,
        scale,
        colorouts,
        crops
      );
      const blob = new Blob([new Uint8Array(modifiedBytes) as BlobPart], { type: "application/pdf" });

      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      }

      submitDownloadForm(blob, downloadName);
    } catch (err) {
      console.error("Download failed:", err);
      const reason = err instanceof Error ? err.message : String(err);
      alert(`Failed to generate the PDF.\n\n${reason}`);
    } finally {
      setDownloading(false);
    }
  }, [pdf, downloading, renderedPages, editedItems, newItems, scale, colorouts, crops, fileName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "v") setActiveTool("select");
      if (key === "t") setActiveTool("text");
      if (key === "w") setActiveTool("colorout");
      if (key === "c") setActiveTool("crop");
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedItemId) handleDeleteItem(selectedItemId);
      }
      if (e.key === "Escape") setSelectedItemId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItemId, handleDeleteItem]);

  const hasEdits =
    editedItems.size > 0 || newItems.length > 0 || colorouts.length > 0 || crops.size > 0;

  if (loading) {
    return (
      <div className="flex h-screen flex-col">
        <div className="flex h-14 items-center border-b border-gray-200 bg-white px-4">
          <span className="text-sm text-gray-500">Loading PDF...</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-gray-500">Rendering pages...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="mb-2 text-lg font-medium text-red-700">
            Failed to load PDF
          </p>
          <p className="mb-4 text-sm text-red-500">{error}</p>
          <button
            onClick={onBack}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Toolbar
        fileName={fileName}
        activeTool={activeTool}
        onToolChange={setActiveTool}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        fontFamily={fontFamily}
        onFontFamilyChange={setFontFamily}
        fontColor={fontColor}
        onFontColorChange={setFontColor}
        isBold={isBold}
        onBoldChange={setIsBold}
        isItalic={isItalic}
        onItalicChange={setIsItalic}
        coloroutColor={coloroutColor}
        onColoroutColorChange={handleColoroutColorChange}
        scale={scale}
        onScaleChange={setScale}
        onDownload={handleDownload}
        onBack={onBack}
        hasEdits={hasEdits}
      />

      <div className="flex-1 overflow-auto bg-gray-100 p-6">
        <div className="mx-auto flex flex-col items-center">
          {renderedPages.map((page) => (
            <PdfPage
              key={page.pageData.pageIndex}
              pageData={page.pageData}
              canvasDataUrl={
                (editedItems.size > 0 && editPreviews.get(page.pageData.pageIndex)) || page.canvasDataUrl
              }
              editedItems={editedItems}
              newItems={newItems}
              colorouts={colorouts.filter((box) => box.pageIndex === page.pageData.pageIndex)}
              crop={crops.get(page.pageData.pageIndex) ?? null}
              selectedItemId={selectedItemId}
              activeTool={activeTool}
              scale={scale}
              fontSize={fontSize}
              fontFamily={fontFamily}
              fontColor={fontColor}
              isBold={isBold}
              isItalic={isItalic}
              coloroutColor={coloroutColor}
              onSelectItem={handleSelectItem}
              onEditItem={handleEditItem}
              onDeleteItem={handleDeleteItem}
              onMoveItem={handleMoveItem}
              onAddNewText={handleAddNewText}
              onAddColorout={handleAddColorout}
              onUpdateColorout={handleUpdateColorout}
              onSetCrop={handleSetCrop}
              onApplyCropToAll={handleApplyCropToAll}
            />
          ))}
        </div>
      </div>

      <div className="flex h-10 items-center justify-center gap-3 border-t border-gray-200 bg-white text-xs text-gray-400">
        <span>Made with love by <span className="font-medium text-gray-500">Naaji</span></span>
        <span className="text-gray-200">|</span>
        <a
          href="https://www.linkedin.com/in/naaji-navas/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0A66C2] transition-colors hover:text-[#004182]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          LinkedIn
        </a>
        <span className="text-gray-200">|</span>
        <a
          href="https://buymeacoffee.com/naaji"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-[#FFDD00] px-2 py-0.5 text-[11px] font-semibold text-gray-900 transition-colors hover:bg-[#FFCC00]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 884 1279" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M791.1 178.9H479.3l47.2-178.9h312.3l-47.7 178.9z" fill="#0D0C22"/>
            <path d="m883.5 481.7-47.7 178.9H523.5l47.7-178.9h312.3z" fill="#0D0C22"/>
            <path d="m328 1278.5-47.2-178.9h312.3l47.2 178.9H328z" fill="#0D0C22"/>
            <path d="M640.3 1099.6H328l-47.2-178.9h312.3l47.2 178.9z" fill="#0D0C22"/>
            <path d="M593.1 920.7H280.8L233.1 741h312.3l47.7 179.7z" fill="#0D0C22"/>
            <path d="M545.4 741H233.1L186 562.1h312.3L545.4 741z" fill="#0D0C22"/>
            <path d="M498.2 562.1H186L138.3 383.2h312.2l47.7 178.9z" fill="#0D0C22"/>
            <path d="M450.5 383.2H138.3L91.1 204.3h312.2l47.2 178.9z" fill="#0D0C22"/>
            <path d="M403.3 204.3H91.1L43.4 25.4h312.2l47.7 178.9z" fill="#0D0C22"/>
          </svg>
          Buy me a coffee
        </a>
      </div>

      {downloading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="flex items-center gap-3 rounded-xl bg-white px-6 py-4 shadow-xl">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm font-medium text-gray-700">
              Generating PDF...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
