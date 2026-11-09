"use client";

import type { Tool } from "@/lib/types";
import Icon, { type IconName } from "./icons";

export const TOOL_GROUPS: { label: string; tools: { tool: Tool; label: string; icon: IconName; key: string }[] }[] = [
  {
    label: "Edit",
    tools: [
      { tool: "select", label: "Select & edit text", icon: "select", key: "V" },
      { tool: "text", label: "Add text", icon: "text", key: "T" },
      { tool: "image", label: "Insert image", icon: "image", key: "I" },
    ],
  },
  {
    label: "Annotate",
    tools: [
      { tool: "rect", label: "Rectangle", icon: "rect", key: "R" },
      { tool: "ellipse", label: "Ellipse", icon: "ellipse", key: "O" },
      { tool: "line", label: "Line", icon: "line", key: "L" },
      { tool: "arrow", label: "Arrow", icon: "arrow", key: "A" },
      { tool: "link", label: "Link", icon: "link", key: "K" },
    ],
  },
  {
    label: "Page",
    tools: [
      { tool: "colorout", label: "Colorout (cover an area)", icon: "colorout", key: "W" },
      { tool: "crop", label: "Crop page", icon: "crop", key: "C" },
    ],
  },
];

export const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(
  TOOL_GROUPS.flatMap((g) => g.tools.map((t) => [t.key.toLowerCase(), t.tool]))
);

export default function ToolRail({ tool, onTool }: { tool: Tool; onTool: (tool: Tool) => void }) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-gray-200 bg-white py-2">
      {TOOL_GROUPS.map((group, gi) => (
        <div key={group.label} className="flex flex-col items-center gap-1">
          {gi > 0 && <div className="my-1 h-px w-8 bg-gray-200" />}
          <span className="text-[9px] font-medium uppercase tracking-wide text-gray-400">{group.label}</span>
          {group.tools.map((t) => (
            <button
              key={t.tool}
              onClick={() => onTool(t.tool)}
              title={`${t.label} (${t.key})`}
              aria-label={t.label}
              aria-pressed={tool === t.tool}
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                tool === t.tool ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon name={t.icon} className="h-[18px] w-[18px]" />
              <span className={`absolute bottom-0.5 right-1 text-[8px] ${tool === t.tool ? "text-blue-100" : "text-gray-400"}`}>
                {t.key}
              </span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
