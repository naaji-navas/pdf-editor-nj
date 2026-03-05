"use client";

import { useRef, useCallback } from "react";
import type { TextItem, PageData } from "@/lib/types";
import EditableText from "./EditableText";

interface PdfPageProps {
  pageData: PageData;
  canvasDataUrl: string;
  editedItems: Map<string, TextItem>;
  newItems: TextItem[];
  selectedItemId: string | null;
  activeTool: "select" | "text";
  scale: number;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  isBold: boolean;
  isItalic: boolean;
  onSelectItem: (id: string | null) => void;
  onEditItem: (id: string, newText: string) => void;
  onDeleteItem: (id: string) => void;
  onMoveItem: (id: string, x: number, y: number) => void;
  onAddNewText: (item: TextItem) => void;
}

let newTextCounter = 0;

export default function PdfPage({
  pageData,
  canvasDataUrl,
  editedItems,
  newItems,
  selectedItemId,
  activeTool,
  scale,
  fontSize,
  fontFamily,
  fontColor,
  isBold,
  isItalic,
  onSelectItem,
  onEditItem,
  onDeleteItem,
  onMoveItem,
  onAddNewText,
}: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const getItemForDisplay = useCallback(
    (original: TextItem): TextItem => {
      return editedItems.get(original.id) ?? original;
    },
    [editedItems]
  );

  const handlePageClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === "text" && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const newItem: TextItem = {
          id: `new-${Date.now()}-${newTextCounter++}`,
          text: "New text",
          x,
          y,
          width: 100,
          height: fontSize * scale + 4,
          fontSize,
          fontFamily,
          color: fontColor,
          pageIndex: pageData.pageIndex,
          isNew: true,
          isBold,
          isItalic,
        };
        onAddNewText(newItem);
        onSelectItem(newItem.id);
      } else {
        onSelectItem(null);
      }
    },
    [activeTool, fontSize, fontFamily, fontColor, isBold, isItalic, pageData.pageIndex, scale, onAddNewText, onSelectItem]
  );

  const handleMoveItem = useCallback(
    (id: string, x: number, y: number) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        onMoveItem(id, x - rect.left, y - rect.top);
      }
    },
    [onMoveItem]
  );

  const pageNewItems = newItems.filter(
    (item) => item.pageIndex === pageData.pageIndex
  );

  return (
    <div className="mb-4 flex flex-col items-center">
      <div className="mb-1 text-xs text-gray-400">
        Page {pageData.pageIndex + 1}
      </div>
      <div
        ref={containerRef}
        className={`relative shadow-lg ${
          activeTool === "text" ? "cursor-text" : "cursor-default"
        }`}
        style={{
          width: pageData.width,
          height: pageData.height,
        }}
        onClick={handlePageClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={canvasDataUrl}
          alt={`Page ${pageData.pageIndex + 1}`}
          className="pointer-events-none absolute inset-0"
          style={{ width: pageData.width, height: pageData.height }}
          draggable={false}
        />

        {pageData.textItems.map((item) => {
          const displayItem = getItemForDisplay(item);
          return (
            <EditableText
              key={item.id}
              item={displayItem}
              isSelected={selectedItemId === item.id}
              scale={scale}
              onSelect={onSelectItem}
              onChange={onEditItem}
              onDelete={onDeleteItem}
              onDragEnd={handleMoveItem}
            />
          );
        })}

        {pageNewItems.map((item) => (
          <EditableText
            key={item.id}
            item={item}
            isSelected={selectedItemId === item.id}
            scale={scale}
            onSelect={onSelectItem}
            onChange={onEditItem}
            onDelete={onDeleteItem}
            onDragEnd={handleMoveItem}
          />
        ))}
      </div>
    </div>
  );
}
