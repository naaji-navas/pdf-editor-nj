"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem, PageData } from "@/lib/types";
import { loadPdf, renderPage } from "@/lib/pdf-renderer";
import { applyEdits } from "@/lib/pdf-modifier";
import Toolbar from "./Toolbar";
import PdfPage from "./PdfPage";

interface PdfEditorProps {
  pdfData: ArrayBuffer;
  fileName: string;
  onBack: () => void;
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState<"select" | "text">("select");
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState("Helvetica");
  const [fontColor, setFontColor] = useState("#000000");
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
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
      if (selectedItemId === id) setSelectedItemId(null);
    },
    [selectedItemId]
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

  const handleDownload = useCallback(async () => {
    if (!pdf) return;
    try {
      setDownloading(true);
      const modifiedBytes = await applyEdits(
        pdfDataRef.current,
        renderedPages.map((p) => p.pageData),
        editedItems,
        newItems,
        scale
      );

      const blob = new Blob([new Uint8Array(modifiedBytes) as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = fileName.replace(/\.pdf$/i, "");
      a.download = `${baseName}-edited.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [pdf, renderedPages, editedItems, newItems, scale, fileName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "v" || e.key === "V") setActiveTool("select");
      if (e.key === "t" || e.key === "T") setActiveTool("text");
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedItemId) handleDeleteItem(selectedItemId);
      }
      if (e.key === "Escape") setSelectedItemId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItemId, handleDeleteItem]);

  const hasEdits = editedItems.size > 0 || newItems.length > 0;

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
              canvasDataUrl={page.canvasDataUrl}
              editedItems={editedItems}
              newItems={newItems}
              selectedItemId={selectedItemId}
              activeTool={activeTool}
              scale={scale}
              fontSize={fontSize}
              fontFamily={fontFamily}
              fontColor={fontColor}
              isBold={isBold}
              isItalic={isItalic}
              onSelectItem={handleSelectItem}
              onEditItem={handleEditItem}
              onDeleteItem={handleDeleteItem}
              onMoveItem={handleMoveItem}
              onAddNewText={handleAddNewText}
            />
          ))}
        </div>
      </div>

      <div className="flex h-8 items-center justify-center border-t border-gray-200 bg-white text-xs text-gray-400">
        Made with love by <span className="ml-1 font-medium text-gray-500">Naaji</span>
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
