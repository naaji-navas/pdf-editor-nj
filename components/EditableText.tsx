"use client";

import { useState, useRef, useEffect, useCallback, startTransition } from "react";
import type { TextItem } from "@/lib/types";

interface EditableTextProps {
  item: TextItem;
  isSelected: boolean;
  scale: number;
  onSelect: (id: string) => void;
  onChange: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
}

export default function EditableText({
  item,
  isSelected,
  scale,
  onSelect,
  onChange,
  onDelete,
  onDragEnd,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const isNewItem = !!item.isNew;
  const hasBeenEdited = !!item.originalText;

  useEffect(() => {
    startTransition(() => setEditText(item.text));
  }, [item.text]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    if (editText.trim() === "" && isNewItem) {
      onDelete(item.id);
    } else if (editText !== item.text) {
      onChange(item.id, editText);
    }
  }, [editText, item.id, item.text, isNewItem, onChange, onDelete]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(item.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitEdit();
    } else if (e.key === "Escape") {
      setEditText(item.text);
      setIsEditing(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return;
    e.stopPropagation();
    onSelect(item.id);
    if (isNewItem) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - item.x,
        y: e.clientY - item.y,
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      onDragEnd(item.id, newX, newY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset, item.id, onDragEnd]);

  const fontWeight = item.isBold ? "bold" : "normal";
  const fontStyle = item.isItalic ? "italic" : "normal";
  const displayFontSize = item.fontSize * scale;

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        className="absolute border-2 border-blue-500 bg-white outline-none"
        style={{
          left: item.x,
          top: item.y,
          fontSize: displayFontSize,
          fontWeight,
          fontStyle,
          color: item.color,
          minWidth: Math.max(item.width, 60),
          height: Math.max(item.height, displayFontSize + 8),
          padding: "0 2px",
          lineHeight: `${Math.max(item.height, displayFontSize + 4)}px`,
          zIndex: 30,
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (isNewItem || hasBeenEdited) {
    return (
      <div
        className={`absolute cursor-pointer select-none whitespace-pre ${
          isSelected
            ? "ring-2 ring-blue-500 ring-offset-1"
            : "hover:ring-2 hover:ring-blue-300 hover:ring-offset-1"
        } ${isDragging ? "opacity-80" : ""}`}
        style={{
          left: item.x,
          top: item.y,
          fontSize: displayFontSize,
          fontWeight,
          fontStyle,
          color: item.color,
          backgroundColor: "white",
          minWidth: item.width,
          minHeight: item.height,
          lineHeight: `${Math.max(item.height, displayFontSize + 4)}px`,
          zIndex: isSelected ? 20 : 15,
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
      >
        {item.text}
        {isSelected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white shadow-sm hover:bg-red-600"
            title="Delete"
          >
            &times;
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`absolute cursor-pointer select-none whitespace-pre ${
        isSelected
          ? "bg-blue-100/60 ring-2 ring-blue-500 ring-offset-1"
          : "hover:bg-blue-50/40 hover:ring-2 hover:ring-blue-300 hover:ring-offset-1"
      }`}
      style={{
        left: item.x,
        top: item.y,
        color: "transparent",
        fontSize: displayFontSize,
        fontWeight,
        fontStyle,
        minWidth: item.width,
        minHeight: item.height,
        lineHeight: `${Math.max(item.height, displayFontSize + 4)}px`,
        zIndex: isSelected ? 20 : 10,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {item.text}
    </div>
  );
}
