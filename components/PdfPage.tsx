"use client";

import { useRef, useCallback, useState } from "react";
import type { TextItem, PageData, Rect, Tool, ColoroutBox } from "@/lib/types";
import EditableText from "./EditableText";
import RectBox, { clamp } from "./RectBox";

interface PdfPageProps {
  pageData: PageData;
  canvasDataUrl: string;
  editedItems: Map<string, TextItem>;
  newItems: TextItem[];
  colorouts: ColoroutBox[];
  crop: Rect | null;
  selectedItemId: string | null;
  activeTool: Tool;
  scale: number;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  isBold: boolean;
  isItalic: boolean;
  coloroutColor: string;
  onSelectItem: (id: string | null) => void;
  onEditItem: (id: string, newText: string) => void;
  onDeleteItem: (id: string) => void;
  onMoveItem: (id: string, x: number, y: number) => void;
  onAddNewText: (item: TextItem) => void;
  onAddColorout: (box: ColoroutBox) => void;
  onUpdateColorout: (id: string, rect: Rect) => void;
  onSetCrop: (pageIndex: number, rect: Rect | null) => void;
  onApplyCropToAll: (rect: Rect) => void;
}

let newTextCounter = 0;
let coloroutCounter = 0;
const MIN_DRAW_SIZE = 4;

export const cropId = (pageIndex: number) => `crop-${pageIndex}`;

const scaleRect = (r: Rect, factor: number): Rect => ({
  x: r.x * factor,
  y: r.y * factor,
  width: r.width * factor,
  height: r.height * factor,
});

export default function PdfPage({
  pageData,
  canvasDataUrl,
  editedItems,
  newItems,
  colorouts,
  crop,
  selectedItemId,
  activeTool,
  scale,
  fontSize,
  fontFamily,
  fontColor,
  isBold,
  isItalic,
  coloroutColor,
  onSelectItem,
  onEditItem,
  onDeleteItem,
  onMoveItem,
  onAddNewText,
  onAddColorout,
  onUpdateColorout,
  onSetCrop,
  onApplyCropToAll,
}: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ startX: number; startY: number; rect: Rect } | null>(null);
  // The click that follows a finished drag must not deselect the new box
  const lastDrawAtRef = useRef(0);
  const isDrawingTool = activeTool === "colorout" || activeTool === "crop";
  const bounds = { width: pageData.width, height: pageData.height };

  const getLocalPoint = (e: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: clamp(e.clientX - rect.left, 0, pageData.width),
      y: clamp(e.clientY - rect.top, 0, pageData.height),
    };
  };

  const handleDrawStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = getLocalPoint(e);
    setDraft({ startX: x, startY: y, rect: { x, y, width: 0, height: 0 } });
  };

  const handleDrawMove = (e: React.PointerEvent) => {
    if (!draft) return;
    const { x, y } = getLocalPoint(e);
    setDraft({
      ...draft,
      rect: {
        x: Math.min(x, draft.startX),
        y: Math.min(y, draft.startY),
        width: Math.abs(x - draft.startX),
        height: Math.abs(y - draft.startY),
      },
    });
  };

  const handleDrawEnd = () => {
    if (!draft) return;
    setDraft(null);
    const { rect } = draft;
    if (rect.width < MIN_DRAW_SIZE || rect.height < MIN_DRAW_SIZE) return;
    lastDrawAtRef.current = Date.now();
    const pointsRect = scaleRect(rect, 1 / scale);
    if (activeTool === "crop") {
      onSetCrop(pageData.pageIndex, pointsRect);
      onSelectItem(cropId(pageData.pageIndex));
    } else {
      const box: ColoroutBox = {
        ...pointsRect,
        id: `colorout-${Date.now()}-${coloroutCounter++}`,
        pageIndex: pageData.pageIndex,
        color: coloroutColor,
      };
      onAddColorout(box);
      onSelectItem(box.id);
    }
  };

  const getItemForDisplay = useCallback(
    (original: TextItem): TextItem => {
      return editedItems.get(original.id) ?? original;
    },
    [editedItems]
  );

  const handlePageClick = useCallback(
    (e: React.MouseEvent) => {
      if (Date.now() - lastDrawAtRef.current < 300) return;
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
          activeTool === "text" ? "cursor-text" : isDrawingTool ? "cursor-crosshair" : "cursor-default"
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

        {colorouts.map((box) => (
          <RectBox
            key={box.id}
            rect={scaleRect(box, scale)}
            bounds={bounds}
            variant="colorout"
            color={box.color}
            isSelected={selectedItemId === box.id}
            onSelect={() => onSelectItem(box.id)}
            onChange={(r) => onUpdateColorout(box.id, scaleRect(r, 1 / scale))}
            onDelete={() => onDeleteItem(box.id)}
          />
        ))}

        {crop && <CropShade rect={scaleRect(crop, scale)} bounds={bounds} />}
        {crop && (
          <RectBox
            rect={scaleRect(crop, scale)}
            bounds={bounds}
            variant="crop"
            isSelected={selectedItemId === cropId(pageData.pageIndex)}
            onSelect={() => onSelectItem(cropId(pageData.pageIndex))}
            onChange={(r) => onSetCrop(pageData.pageIndex, scaleRect(r, 1 / scale))}
            onDelete={() => onDeleteItem(cropId(pageData.pageIndex))}
            actions={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onApplyCropToAll(crop);
                }}
                className="flex h-6 items-center whitespace-nowrap rounded-md bg-blue-600 px-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Apply to all pages
              </button>
            }
          />
        )}

        {isDrawingTool && (
          <div
            className="absolute inset-0 touch-none"
            style={{ zIndex: 50 }}
            onPointerDown={handleDrawStart}
            onPointerMove={handleDrawMove}
            onPointerUp={handleDrawEnd}
            onPointerCancel={() => setDraft(null)}
            onClick={(e) => e.stopPropagation()}
          >
            {draft && (
              <div
                className={`pointer-events-none absolute ${
                  activeTool === "crop"
                    ? "border-2 border-dashed border-blue-500 bg-blue-500/10"
                    : "border border-dashed border-gray-400"
                }`}
                style={{
                  backgroundColor: activeTool === "crop" ? undefined : coloroutColor,
                  left: draft.rect.x,
                  top: draft.rect.y,
                  width: draft.rect.width,
                  height: draft.rect.height,
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CropShade({ rect, bounds }: { rect: Rect; bounds: { width: number; height: number } }) {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const regions = [
    { left: 0, top: 0, width: bounds.width, height: rect.y },
    { left: 0, top: bottom, width: bounds.width, height: bounds.height - bottom },
    { left: 0, top: rect.y, width: rect.x, height: rect.height },
    { left: right, top: rect.y, width: bounds.width - right, height: rect.height },
  ];
  return (
    <>
      {regions.map((style, i) => (
        <div
          key={i}
          className="pointer-events-none absolute bg-gray-900/50"
          style={{ ...style, zIndex: 28 }}
        />
      ))}
    </>
  );
}
