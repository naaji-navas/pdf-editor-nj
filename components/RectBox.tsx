"use client";

import type { ReactNode } from "react";
import type { Rect } from "@/lib/types";

type Handle = "move" | "nw" | "ne" | "sw" | "se";

const MIN_SIZE = 8;
const CORNERS: { handle: Handle; className: string }[] = [
  { handle: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
  { handle: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
  { handle: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
  { handle: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
];

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function transform(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  bounds: { width: number; height: number }
): Rect {
  if (handle === "move") {
    return {
      ...start,
      x: clamp(start.x + dx, 0, bounds.width - start.width),
      y: clamp(start.y + dy, 0, bounds.height - start.height),
    };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - MIN_SIZE);
  if (handle.includes("e")) right = clamp(right + dx, left + MIN_SIZE, bounds.width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - MIN_SIZE);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + MIN_SIZE, bounds.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

interface RectBoxProps {
  /** In screen pixels. */
  rect: Rect;
  bounds: { width: number; height: number };
  variant: "colorout" | "crop";
  color?: string;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (rect: Rect) => void;
  onDelete: () => void;
  actions?: ReactNode;
}

export default function RectBox({
  rect,
  bounds,
  variant,
  color = "#ffffff",
  isSelected,
  onSelect,
  onChange,
  onDelete,
  actions,
}: RectBoxProps) {
  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const originX = e.clientX;
    const originY = e.clientY;
    const startRect = rect;

    const handleMove = (ev: PointerEvent) =>
      onChange(transform(startRect, handle, ev.clientX - originX, ev.clientY - originY, bounds));
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const isCrop = variant === "crop";

  return (
    <div
      className={`absolute ${
        isCrop
          ? `pointer-events-none border-2 border-dashed ${isSelected ? "border-blue-500" : "border-white"}`
          : `cursor-move ${
              isSelected ? "ring-2 ring-blue-500" : "outline outline-1 outline-dashed outline-gray-300 hover:outline-blue-300"
            }`
      }`}
      style={{
        backgroundColor: isCrop ? undefined : color,
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: isCrop ? (isSelected ? 35 : 30) : isSelected ? 25 : 12,
      }}
      onPointerDown={isCrop ? undefined : startDrag("move")}
      onClick={(e) => e.stopPropagation()}
    >
      {isCrop &&
        ["inset-x-0 -top-1 h-2", "inset-x-0 -bottom-1 h-2", "inset-y-0 -left-1 w-2", "inset-y-0 -right-1 w-2"].map(
          (edge) => (
            <div
              key={edge}
              className={`pointer-events-auto absolute cursor-move ${edge}`}
              onPointerDown={startDrag("move")}
            />
          )
        )}

      {(isSelected || isCrop) &&
        CORNERS.map(({ handle, className }) => (
          <div
            key={handle}
            className={`pointer-events-auto absolute h-3 w-3 rounded-sm border border-blue-500 bg-white shadow-sm ${className}`}
            onPointerDown={startDrag(handle)}
          />
        ))}

      {isSelected && (
        <div
          className={`pointer-events-auto absolute right-0 flex items-center gap-1 ${
            rect.y < 36 ? "top-2 right-2" : "-top-9"
          }`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {actions}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-6 items-center rounded-md bg-red-500 px-2 text-xs font-medium text-white shadow-sm hover:bg-red-600"
            title="Delete (Del)"
          >
            {isCrop ? "Remove crop" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}
