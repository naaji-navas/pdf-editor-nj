"use client";

import { useState } from "react";
import Icon from "./icons";

interface SearchBarProps {
  query: string;
  onQuery: (query: string) => void;
  count: number;
  activeIndex: number;
  scanning: boolean;
  onStep: (dir: 1 | -1) => void;
  onReplace: (replacement: string) => void;
  onReplaceAll: (replacement: string) => void;
  onClose: () => void;
}

export default function SearchBar(props: SearchBarProps) {
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const input = "h-8 w-56 rounded-md border border-gray-300 px-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const button = "h-8 rounded-md px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40";

  return (
    <div
      className="absolute right-4 top-3 z-[60] flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") props.onClose();
      }}
    >
      <div className="flex items-center gap-1">
        <button onClick={() => setShowReplace((v) => !v)} className={button} title="Toggle replace" aria-label="Toggle replace">
          <Icon name={showReplace ? "up" : "down"} />
        </button>
        <input
          autoFocus
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && props.onStep(e.shiftKey ? -1 : 1)}
          placeholder="Find in document"
          className={input}
        />
        <span className="w-20 text-center text-xs tabular-nums text-gray-500">
          {props.query ? (props.count ? `${props.activeIndex + 1} of ${props.count}` : props.scanning ? "Searching…" : "No results") : ""}
        </span>
        <button onClick={() => props.onStep(-1)} disabled={!props.count} className={button} aria-label="Previous match">
          <Icon name="up" />
        </button>
        <button onClick={() => props.onStep(1)} disabled={!props.count} className={button} aria-label="Next match">
          <Icon name="down" />
        </button>
        <button onClick={props.onClose} className={button} aria-label="Close search">
          <Icon name="close" />
        </button>
      </div>
      {showReplace && (
        <div className="flex items-center gap-1 pl-9">
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && props.onReplace(replacement)}
            placeholder="Replace with"
            className={input}
          />
          <button onClick={() => props.onReplace(replacement)} disabled={!props.count} className={button}>
            Replace
          </button>
          <button onClick={() => props.onReplaceAll(replacement)} disabled={!props.count} className={button}>
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}
