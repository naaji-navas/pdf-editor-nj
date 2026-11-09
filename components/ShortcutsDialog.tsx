"use client";

import { TOOL_GROUPS } from "./ToolRail";
import Icon from "./icons";

function Key({ k }: { k: string }) {
  return <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-700">{k}</kbd>;
}

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const mod = /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl";
  const general: [string, string][] = [
    [`${mod} Z`, "Undo"],
    [`${mod} Shift Z`, "Redo"],
    [`${mod} F`, "Find & replace"],
    [`${mod} C / ${mod} V`, "Copy / paste object"],
    [`${mod} D`, "Duplicate object"],
    ["Delete", "Delete selection"],
    ["Arrows", "Nudge 1pt (Shift: 10pt)"],
    ["Shift + drag", "Keep aspect ratio"],
    ["Double-click", "Edit text"],
    [`${mod} Enter`, "Finish multi-line text"],
    [`${mod} + / ${mod} −`, "Zoom"],
    ["Esc", "Deselect / cancel"],
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="w-[560px] max-w-[92vw] rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Keyboard shortcuts</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Tools</h3>
            <ul className="space-y-1.5">
              {TOOL_GROUPS.flatMap((g) => g.tools).map((t) => (
                <li key={t.tool} className="flex items-center justify-between gap-3">
                  <span className="text-gray-700">{t.label}</span>
                  <Key k={t.key} />
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">General</h3>
            <ul className="space-y-1.5">
              {general.map(([k, label]) => (
                <li key={label} className="flex items-center justify-between gap-3">
                  <span className="text-gray-700">{label}</span>
                  <Key k={k} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
