"use client";

import type { ReactNode } from "react";
import Icon, { type IconName } from "./icons";

interface TopBarProps {
  fileName: string;
  onBack: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  onFitWidth: () => void;
  currentPage: number;
  pageCount: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSearch: () => void;
  onShortcuts: () => void;
  onDownload: () => void;
  downloading: boolean;
  hasEdits: boolean;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const zoomStep = (zoom: number, dir: 1 | -1) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * (dir > 0 ? 1.2 : 1 / 1.2) * 100) / 100));

function IconButton({ icon, label, onClick, disabled, active }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      <Icon name={icon} />
    </button>
  );
}

const Divider = () => <div className="mx-1 h-5 w-px bg-gray-200" />;
const Group = ({ children }: { children: ReactNode }) => <div className="flex items-center gap-0.5">{children}</div>;

export default function TopBar(props: TopBarProps) {
  const mod = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl+";
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-2">
      <Group>
        <IconButton icon="back" label="Back to upload" onClick={props.onBack} />
        <IconButton icon="sidebar" label="Toggle page thumbnails" onClick={props.onToggleSidebar} active={props.sidebarOpen} />
      </Group>
      <div className="min-w-0 max-w-64 truncate text-sm font-medium text-gray-800" title={props.fileName}>
        {props.fileName}
      </div>
      {props.hasEdits && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Unsaved</span>}

      <div className="flex flex-1 items-center justify-center">
        <Group>
          <IconButton icon="undo" label={`Undo (${mod}Z)`} onClick={props.onUndo} disabled={!props.canUndo} />
          <IconButton icon="redo" label={`Redo (${mod}Shift+Z)`} onClick={props.onRedo} disabled={!props.canRedo} />
        </Group>
        <Divider />
        <Group>
          <IconButton icon="minus" label="Zoom out" onClick={() => props.onZoom(zoomStep(props.zoom, -1))} />
          <button
            onClick={() => props.onZoom(1)}
            title="Reset to 100%"
            className="w-14 rounded-md py-1 text-center text-xs tabular-nums text-gray-700 hover:bg-gray-100"
          >
            {Math.round(props.zoom * 100)}%
          </button>
          <IconButton icon="plus" label="Zoom in" onClick={() => props.onZoom(zoomStep(props.zoom, 1))} />
          <IconButton icon="fitWidth" label="Fit width" onClick={props.onFitWidth} />
        </Group>
        <Divider />
        <span className="px-2 text-xs tabular-nums text-gray-500">
          {props.pageCount ? `${props.currentPage + 1} / ${props.pageCount}` : ""}
        </span>
      </div>

      <Group>
        <IconButton icon="search" label={`Find & replace (${mod}F)`} onClick={props.onSearch} />
        <IconButton icon="keyboard" label="Keyboard shortcuts (?)" onClick={props.onShortcuts} />
      </Group>
      <button
        onClick={props.onDownload}
        disabled={props.downloading}
        className="ml-1 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        <Icon name="download" />
        {props.downloading ? "Saving…" : "Download"}
      </button>
    </header>
  );
}
