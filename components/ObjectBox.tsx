"use client";

import type { ReactNode } from "react";
import type { Rect } from "@/lib/types";

type Handle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const MIN_SIZE = 4;
const HANDLES: { handle: Exclude<Handle, "move">; className: string }[] = [
  { handle: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
  { handle: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
  { handle: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
  { handle: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
  { handle: "n", className: "left-1/2 -top-1.5 -ml-1.5 cursor-ns-resize" },
  { handle: "s", className: "left-1/2 -bottom-1.5 -ml-1.5 cursor-ns-resize" },
  { handle: "w", className: "top-1/2 -left-1.5 -mt-1.5 cursor-ew-resize" },
  { handle: "e", className: "top-1/2 -right-1.5 -mt-1.5 cursor-ew-resize" },
];

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function transform(start: Rect, handle: Handle, dx: number, dy: number, bounds: Size, keepAspect: boolean): Rect {
  if (handle === "move") {
    return {
      ...start,
      x: clamp(start.x + dx, 0, Math.max(0, bounds.width - start.width)),
      y: clamp(start.y + dy, 0, Math.max(0, bounds.height - start.height)),
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

  if (keepAspect && handle.length === 2) {
    const ratio = start.width / start.height;
    const width = right - left;
    const height = width / ratio;
    if (handle.includes("n")) top = bottom - height;
    else bottom = top + height;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

interface Size {
  width: number;
  height: number;
}

interface ObjectBoxProps {
  /** In PDF points. */
  rect: Rect;
  scale: number;
  bounds: Size;
  selected: boolean;
  interactive: boolean;
  keepAspect?: boolean;
  resizable?: boolean;
  outline?: "dashed" | "none";
  /** Only the edges grab the pointer, so content inside stays clickable (crop frame). */
  passThrough?: boolean;
  zIndex?: number;
  onSelect: () => void;
  /** `gesture` is unique per drag, so a whole drag becomes one undo step. */
  onChange: (rect: Rect, gesture: string) => void;
  onDoubleClick?: () => void;
  children?: ReactNode;
}

export default function ObjectBox({
  rect,
  scale,
  bounds,
  selected,
  interactive,
  keepAspect = false,
  resizable = true,
  outline = "dashed",
  passThrough = false,
  zIndex = 20,
  onSelect,
  onChange,
  onDoubleClick,
  children,
}: ObjectBoxProps) {
  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    if (e.button !== 0 || !interactive) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const originX = e.clientX;
    const originY = e.clientY;
    const startRect = rect;
    const gesture = `drag-${handle}-${originX}-${originY}-${e.timeStamp}`;
    let moved = false;

    const handleMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - originX) / scale;
      const dy = (ev.clientY - originY) / scale;
      if (!moved && Math.hypot(dx, dy) * scale < 2) return;
      moved = true;
      onChange(transform(startRect, handle, dx, dy, bounds, keepAspect || ev.shiftKey), gesture);
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <div
      className={`absolute ${!interactive || passThrough ? "pointer-events-none" : "cursor-move"} ${
        selected
          ? "outline outline-2 outline-blue-500"
          : outline === "dashed"
            ? "outline-dashed outline-1 outline-transparent hover:outline-blue-300"
            : ""
      }`}
      style={{
        left: rect.x * scale,
        top: rect.y * scale,
        width: rect.width * scale,
        height: rect.height * scale,
        zIndex: selected ? zIndex + 10 : zIndex,
      }}
      onPointerDown={passThrough ? undefined : startDrag("move")}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
    >
      {children}
      {passThrough &&
        interactive &&
        ["inset-x-0 -top-1 h-2", "inset-x-0 -bottom-1 h-2", "inset-y-0 -left-1 w-2", "inset-y-0 -right-1 w-2"].map((edge) => (
          <div key={edge} className={`pointer-events-auto absolute cursor-move ${edge}`} onPointerDown={startDrag("move")} />
        ))}
      {selected &&
        resizable &&
        interactive &&
        HANDLES.filter((h) => !keepAspect || h.handle.length === 2).map(({ handle, className }) => (
          <div
            key={handle}
            className={`pointer-events-auto absolute h-3 w-3 rounded-sm border border-blue-500 bg-white ${className}`}
            onPointerDown={startDrag(handle)}
          />
        ))}
    </div>
  );
}
