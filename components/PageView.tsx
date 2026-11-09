"use client";

import { useEffect, useRef, useState } from "react";
import { isLine } from "@/lib/types";
import type {
  DocState,
  ExistingLink,
  LineObject,
  PageInfo,
  PageObject,
  Rect,
  SearchHit,
  Selection,
  TextObject,
  TextRun,
  Tool,
  ToolDefaults,
} from "@/lib/types";
import ObjectBox, { clamp } from "./ObjectBox";
import { LINE_HEIGHT, cssFontFamily, measureText, textWidth } from "@/lib/fonts";
import { newId } from "@/lib/ids";

export interface PageActions {
  onVisibility: (pageIndex: number, visible: boolean) => void;
  select: (selection: Selection) => void;
  setEditing: (id: string | null) => void;
  commitRunText: (run: TextRun, text: string) => void;
  commitObjectText: (id: string, text: string) => void;
  updateObject: (id: string, patch: object, gesture?: string) => void;
  addObject: (obj: PageObject, startEditing?: boolean) => void;
  setCrop: (pageIndex: number, rect: Rect | null, gesture?: string) => void;
}

interface PageViewProps {
  info: PageInfo;
  scale: number;
  scrollRoot: HTMLElement | null;
  imageUrl?: string;
  runs?: TextRun[];
  links?: ExistingLink[];
  doc: DocState;
  tool: Tool;
  selection: Selection;
  editingId: string | null;
  hits: SearchHit[];
  activeHit: string | null;
  defaults: ToolDefaults;
  actions: PageActions;
}

const DRAW_TOOLS = new Set<Tool>(["rect", "ellipse", "line", "arrow", "link", "colorout", "crop"]);
const DEFAULT_SIZES: Partial<Record<Tool, [number, number]>> = {
  rect: [120, 80],
  ellipse: [120, 80],
  link: [140, 24],
  colorout: [140, 30],
};

type Point = { x: number; y: number };

const isSelected = (selection: Selection, type: "object" | "run" | "link", id: string) =>
  selection?.type === type && selection.id === id;

export default function PageView({
  info,
  scale,
  scrollRoot,
  imageUrl,
  runs,
  links,
  doc,
  tool,
  selection,
  editingId,
  hits,
  activeHit,
  defaults,
  actions,
}: PageViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [draft, setDraft] = useState<{ start: Point; end: Point } | null>(null);
  const { pageIndex } = info;
  const bounds = { width: info.width, height: info.height };
  const interactive = tool === "select";
  const { onVisibility } = actions;

  useEffect(() => {
    const el = ref.current;
    if (!el || !scrollRoot) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNear(entry.isIntersecting);
        onVisibility(pageIndex, entry.isIntersecting);
      },
      { root: scrollRoot, rootMargin: "800px 0px" }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      onVisibility(pageIndex, false);
    };
  }, [pageIndex, scrollRoot, onVisibility]);

  const toPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) / scale, 0, info.width),
      y: clamp((e.clientY - r.top) / scale, 0, info.height),
    };
  };

  const handlePageClick = (e: React.MouseEvent) => {
    if (tool === "text") {
      const p = toPoint(e);
      const style = defaults.text;
      const obj: TextObject = {
        id: newId("text"),
        kind: "text",
        pageIndex,
        x: clamp(p.x, 0, info.width - 20),
        y: clamp(p.y - (style.fontSize * LINE_HEIGHT) / 2, 0, info.height - style.fontSize),
        width: 0,
        height: 0,
        text: "",
        style,
      };
      actions.addObject(obj, true);
      return;
    }
    actions.select(null);
    actions.setEditing(null);
  };

  const finishDraw = (start: Point, end: Point) => {
    const dragged = Math.hypot(end.x - start.x, end.y - start.y) > 3;
    if (tool === "line" || tool === "arrow") {
      const to = dragged ? end : { x: clamp(start.x + 100, 0, info.width), y: start.y };
      const line: LineObject = {
        id: newId(tool),
        kind: tool,
        pageIndex,
        x1: start.x,
        y1: start.y,
        x2: to.x,
        y2: to.y,
        ...defaults.line,
      };
      actions.addObject(line);
      return;
    }
    let rect: Rect;
    if (dragged) {
      rect = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
    } else {
      const size = DEFAULT_SIZES[tool];
      if (!size) return;
      const [w, h] = size;
      rect = {
        x: clamp(start.x - w / 2, 0, info.width - w),
        y: clamp(start.y - h / 2, 0, info.height - h),
        width: w,
        height: h,
      };
    }
    if (tool === "crop") {
      actions.setCrop(pageIndex, rect);
      actions.select({ type: "crop", pageIndex });
      return;
    }
    const base = { id: newId(tool), pageIndex, ...rect };
    if (tool === "rect" || tool === "ellipse") actions.addObject({ ...base, kind: tool, ...defaults.shape });
    else if (tool === "colorout") actions.addObject({ ...base, kind: "colorout", color: defaults.colorout });
    else if (tool === "link") actions.addObject({ ...base, kind: "link", url: "" });
  };

  const pageObjects = doc.objects.filter((o) => o.pageIndex === pageIndex);
  const lines = pageObjects.filter(isLine);
  const crop = doc.crops[pageIndex];
  const runById = new Map(runs?.map((r) => [r.id, r]));

  return (
    <div
      ref={ref}
      data-page-index={pageIndex}
      className={`relative mx-auto bg-white ring-1 ring-black/5 ${
        tool === "text" ? "cursor-text" : DRAW_TOOLS.has(tool) ? "cursor-crosshair" : "cursor-default"
      }`}
      style={{ width: info.width * scale, height: info.height * scale }}
      onClick={handlePageClick}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={`Page ${pageIndex + 1}`}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-300">Loading page…</div>
      )}

      {near &&
        runs?.map((run) =>
          editingId === run.id ? (
            <RunEditor key={run.id} run={run} value={doc.textEdits[run.id]?.text ?? run.text} scale={scale} actions={actions} />
          ) : (
            <div
              key={run.id}
              className={`absolute rounded-[2px] ${interactive ? "cursor-text" : "pointer-events-none"} ${
                isSelected(selection, "run", run.id)
                  ? "bg-blue-500/10 outline outline-2 outline-blue-500"
                  : interactive
                    ? "hover:bg-blue-500/5 hover:outline hover:outline-1 hover:outline-blue-300"
                    : ""
              }`}
              style={{ left: run.x * scale, top: run.y * scale, width: run.width * scale, height: run.height * scale, zIndex: 10 }}
              title="Double-click to edit"
              onClick={(e) => {
                e.stopPropagation();
                actions.select({ type: "run", id: run.id });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                actions.select({ type: "run", id: run.id });
                actions.setEditing(run.id);
              }}
            />
          )
        )}

      {hits.map((hit) => {
        const run = runById.get(hit.runId);
        if (!run) return null;
        const text = doc.textEdits[run.id]?.text ?? run.text;
        const style = { fontFamily: run.fontFamily, fontSize: run.fontSize, bold: false, italic: false };
        const ratio = run.width / Math.max(1, textWidth(text, style));
        const start = textWidth(text.slice(0, hit.start), style) * ratio;
        const end = textWidth(text.slice(0, hit.end), style) * ratio;
        return (
          <div
            key={hit.key}
            className={`pointer-events-none absolute rounded-[2px] ${hit.key === activeHit ? "bg-orange-400/50" : "bg-yellow-300/50"}`}
            style={{
              left: (run.x + start) * scale,
              top: run.y * scale,
              width: Math.max(2, end - start) * scale,
              height: run.height * scale,
              zIndex: 15,
            }}
          />
        );
      })}

      {near &&
        links
          ?.filter((link) => !doc.linkEdits[link.id]?.deleted)
          .map((link) => (
            <ObjectBox
              key={link.id}
              rect={link.rect}
              scale={scale}
              bounds={bounds}
              selected={isSelected(selection, "link", link.id)}
              interactive={interactive}
              resizable={false}
              zIndex={22}
              onSelect={() => actions.select({ type: "link", id: link.id })}
              onChange={() => {}}
              onDoubleClick={() => {
                const cx = link.rect.x + link.rect.width / 2;
                const cy = link.rect.y + link.rect.height / 2;
                const run = runs?.find((r) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height);
                if (!run) return;
                actions.select({ type: "run", id: run.id });
                actions.setEditing(run.id);
              }}
            >
              <div className="pointer-events-none absolute inset-0 border-b-2 border-blue-400/40" />
            </ObjectBox>
          ))}

      {pageObjects.map((obj) => {
        if (isLine(obj)) return null;
        const selected = isSelected(selection, "object", obj.id);
        const select = () => actions.select({ type: "object", id: obj.id });
        const move = (r: Rect, gesture: string) => actions.updateObject(obj.id, r, gesture);

        if (obj.kind === "text") {
          return editingId === obj.id ? (
            <TextObjectEditor key={obj.id} obj={obj} scale={scale} actions={actions} />
          ) : (
            <ObjectBox
              key={obj.id}
              rect={{ x: obj.x, y: obj.y, ...measureText(obj.text, obj.style) }}
              scale={scale}
              bounds={bounds}
              selected={selected}
              interactive={interactive}
              resizable={false}
              onSelect={select}
              onChange={(r, g) => actions.updateObject(obj.id, { x: r.x, y: r.y }, g)}
              onDoubleClick={() => actions.setEditing(obj.id)}
            >
              <div
                className="pointer-events-none select-none whitespace-pre"
                style={{
                  fontFamily: cssFontFamily(obj.style.fontFamily),
                  fontSize: obj.style.fontSize * scale,
                  lineHeight: LINE_HEIGHT,
                  color: obj.style.color,
                  fontWeight: obj.style.bold ? "bold" : "normal",
                  fontStyle: obj.style.italic ? "italic" : "normal",
                }}
              >
                {obj.text}
              </div>
            </ObjectBox>
          );
        }

        const common = { rect: obj, scale, bounds, selected, interactive, onSelect: select, onChange: move };
        if (obj.kind === "image") {
          return (
            <ObjectBox key={obj.id} {...common} keepAspect>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={obj.src} alt="" draggable={false} className="pointer-events-none h-full w-full select-none" style={{ opacity: obj.opacity }} />
            </ObjectBox>
          );
        }
        if (obj.kind === "rect" || obj.kind === "ellipse") {
          const sw = obj.stroke ? obj.strokeWidth * scale : 0;
          const paint = {
            fill: obj.fill ?? "none",
            stroke: obj.stroke ?? "none",
            strokeWidth: sw,
          };
          return (
            <ObjectBox key={obj.id} {...common}>
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ opacity: obj.opacity }}>
                {obj.kind === "rect" ? (
                  <rect x={0} y={0} width="100%" height="100%" {...paint} />
                ) : (
                  <ellipse cx="50%" cy="50%" rx="50%" ry="50%" {...paint} />
                )}
              </svg>
            </ObjectBox>
          );
        }
        if (obj.kind === "colorout") {
          return (
            <ObjectBox key={obj.id} {...common} zIndex={18}>
              <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: obj.color }} />
            </ObjectBox>
          );
        }
        if (obj.kind !== "link") return null;
        return (
          <ObjectBox key={obj.id} {...common} zIndex={22}>
            <div className="pointer-events-none absolute inset-0 border border-dashed border-blue-500 bg-blue-500/10">
              <span className="absolute left-0 top-full mt-0.5 max-w-60 truncate rounded bg-blue-600 px-1 text-[10px] text-white">
                {obj.url || (obj.page ? `Page ${obj.page}` : "Set link target")}
              </span>
            </div>
          </ObjectBox>
        );
      })}

      {lines.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: 25 }}>
          {lines.map((line) => (
            <LineView
              key={line.id}
              line={line}
              scale={scale}
              bounds={bounds}
              selected={isSelected(selection, "object", line.id)}
              interactive={interactive}
              actions={actions}
            />
          ))}
        </svg>
      )}

      {crop && <CropShade rect={crop} scale={scale} bounds={bounds} />}
      {crop && (
        <ObjectBox
          rect={crop}
          scale={scale}
          bounds={bounds}
          selected={selection?.type === "crop" && selection.pageIndex === pageIndex}
          interactive={interactive}
          passThrough
          outline="none"
          zIndex={35}
          onSelect={() => actions.select({ type: "crop", pageIndex })}
          onChange={(r, g) => actions.setCrop(pageIndex, r, g)}
        >
          <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-blue-500" />
        </ObjectBox>
      )}

      {DRAW_TOOLS.has(tool) && (
        <div
          className="absolute inset-0 touch-none"
          style={{ zIndex: 50 }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = toPoint(e);
            setDraft({ start: p, end: p });
          }}
          onPointerMove={(e) => draft && setDraft({ ...draft, end: toPoint(e) })}
          onPointerUp={() => {
            if (draft) finishDraw(draft.start, draft.end);
            setDraft(null);
          }}
          onPointerCancel={() => setDraft(null)}
          onClick={(e) => e.stopPropagation()}
        >
          {draft && <DraftPreview tool={tool} start={draft.start} end={draft.end} scale={scale} defaults={defaults} />}
        </div>
      )}
    </div>
  );
}

function RunEditor({ run, value, scale, actions }: { run: TextRun; value: string; scale: number; actions: PageActions }) {
  const [text, setText] = useState(value);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) actions.commitRunText(run, text);
    actions.setEditing(null);
  };
  return (
    <input
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onClick={(e) => e.stopPropagation()}
      className="absolute rounded-[2px] bg-white px-0.5 text-black outline outline-2 outline-blue-500"
      style={{
        left: run.x * scale - 2,
        top: run.y * scale,
        minWidth: Math.max(run.width * scale + 8, 60),
        width: `${Math.max(text.length, 4) + 2}ch`,
        height: run.height * scale,
        fontSize: run.fontSize * scale,
        fontFamily: cssFontFamily(run.fontFamily),
        zIndex: 40,
      }}
    />
  );
}

function TextObjectEditor({ obj, scale, actions }: { obj: TextObject; scale: number; actions: PageActions }) {
  const [text, setText] = useState(obj.text);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    actions.commitObjectText(obj.id, commit ? text : obj.text);
    actions.setEditing(null);
  };
  const size = measureText(text || "Type here", obj.style);
  return (
    <textarea
      autoFocus
      value={text}
      placeholder="Type here"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") finish(false);
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) finish(true);
      }}
      onClick={(e) => e.stopPropagation()}
      className="absolute resize-none overflow-hidden bg-white/70 p-0 outline outline-2 outline-blue-500"
      style={{
        left: obj.x * scale,
        top: obj.y * scale,
        width: (size.width + obj.style.fontSize) * scale,
        height: size.height * scale,
        fontFamily: cssFontFamily(obj.style.fontFamily),
        fontSize: obj.style.fontSize * scale,
        lineHeight: LINE_HEIGHT,
        color: obj.style.color,
        fontWeight: obj.style.bold ? "bold" : "normal",
        fontStyle: obj.style.italic ? "italic" : "normal",
        zIndex: 40,
      }}
    />
  );
}

function arrowGeometry(x1: number, y1: number, x2: number, y2: number, head: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const left = [x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45)];
  const right = [x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45)];
  const end = [x2 - head * 0.8 * Math.cos(angle), y2 - head * 0.8 * Math.sin(angle)];
  return { points: `${x2},${y2} ${left.join(",")} ${right.join(",")}`, end };
}

function LineShape({ line, scale }: { line: Pick<LineObject, "kind" | "x1" | "y1" | "x2" | "y2" | "stroke" | "strokeWidth" | "opacity">; scale: number }) {
  const [x1, y1, x2, y2] = [line.x1, line.y1, line.x2, line.y2].map((v) => v * scale);
  const head = Math.max(6, line.strokeWidth * 4) * scale;
  const arrow = line.kind === "arrow" ? arrowGeometry(x1, y1, x2, y2, head) : null;
  return (
    <g opacity={line.opacity}>
      <line
        x1={x1}
        y1={y1}
        x2={arrow ? arrow.end[0] : x2}
        y2={arrow ? arrow.end[1] : y2}
        stroke={line.stroke}
        strokeWidth={line.strokeWidth * scale}
        strokeLinecap="round"
      />
      {arrow && <polygon points={arrow.points} fill={line.stroke} />}
    </g>
  );
}

function LineView({
  line,
  scale,
  bounds,
  selected,
  interactive,
  actions,
}: {
  line: LineObject;
  scale: number;
  bounds: { width: number; height: number };
  selected: boolean;
  interactive: boolean;
  actions: PageActions;
}) {
  const startDrag = (mode: "move" | "p1" | "p2") => (e: React.PointerEvent) => {
    if (e.button !== 0 || !interactive) return;
    e.stopPropagation();
    e.preventDefault();
    actions.select({ type: "object", id: line.id });
    const ox = e.clientX;
    const oy = e.clientY;
    const start = line;
    const gesture = `line-${mode}-${ox}-${oy}-${e.timeStamp}`;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - ox) / scale;
      const dy = (ev.clientY - oy) / scale;
      const fit = (x: number, y: number) => ({ x: clamp(x, 0, bounds.width), y: clamp(y, 0, bounds.height) });
      if (mode === "p1") {
        const p = fit(start.x1 + dx, start.y1 + dy);
        actions.updateObject(line.id, { x1: p.x, y1: p.y }, gesture);
      } else if (mode === "p2") {
        const p = fit(start.x2 + dx, start.y2 + dy);
        actions.updateObject(line.id, { x2: p.x, y2: p.y }, gesture);
      } else {
        const minX = Math.min(start.x1, start.x2);
        const maxX = Math.max(start.x1, start.x2);
        const minY = Math.min(start.y1, start.y2);
        const maxY = Math.max(start.y1, start.y2);
        const cdx = clamp(dx, -minX, bounds.width - maxX);
        const cdy = clamp(dy, -minY, bounds.height - maxY);
        actions.updateObject(
          line.id,
          { x1: start.x1 + cdx, y1: start.y1 + cdy, x2: start.x2 + cdx, y2: start.y2 + cdy },
          gesture
        );
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const [x1, y1, x2, y2] = [line.x1, line.y1, line.x2, line.y2].map((v) => v * scale);
  const handle = (cx: number, cy: number, mode: "p1" | "p2") => (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="white"
      stroke="#3b82f6"
      strokeWidth={1.5}
      style={{ pointerEvents: "all", cursor: "crosshair" }}
      onPointerDown={startDrag(mode)}
    />
  );
  return (
    <g>
      {selected && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3b82f6" strokeWidth={line.strokeWidth * scale + 4} strokeOpacity={0.25} strokeLinecap="round" />}
      <LineShape line={line} scale={scale} />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="transparent"
        strokeWidth={Math.max(line.strokeWidth * scale, 12)}
        style={{ pointerEvents: interactive ? "stroke" : "none", cursor: "move" }}
        onPointerDown={startDrag("move")}
        onClick={(e) => e.stopPropagation()}
      />
      {selected && interactive && handle(x1, y1, "p1")}
      {selected && interactive && handle(x2, y2, "p2")}
    </g>
  );
}

function DraftPreview({ tool, start, end, scale, defaults }: { tool: Tool; start: Point; end: Point; scale: number; defaults: ToolDefaults }) {
  if (tool === "line" || tool === "arrow") {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <LineShape line={{ kind: tool, x1: start.x, y1: start.y, x2: end.x, y2: end.y, ...defaults.line }} scale={scale} />
      </svg>
    );
  }
  const style: React.CSSProperties = {
    left: Math.min(start.x, end.x) * scale,
    top: Math.min(start.y, end.y) * scale,
    width: Math.abs(end.x - start.x) * scale,
    height: Math.abs(end.y - start.y) * scale,
  };
  if (tool === "colorout") style.backgroundColor = defaults.colorout;
  if (tool === "ellipse") style.borderRadius = "50%";
  return (
    <div
      className={`pointer-events-none absolute border-dashed ${
        tool === "crop" ? "border-2 border-blue-500 bg-blue-500/10" : tool === "link" ? "border border-blue-500 bg-blue-500/10" : "border border-gray-500"
      }`}
      style={style}
    />
  );
}

function CropShade({ rect, scale, bounds }: { rect: Rect; scale: number; bounds: { width: number; height: number } }) {
  const r = { x: rect.x * scale, y: rect.y * scale, w: rect.width * scale, h: rect.height * scale };
  const W = bounds.width * scale;
  const H = bounds.height * scale;
  const regions = [
    { left: 0, top: 0, width: W, height: r.y },
    { left: 0, top: r.y + r.h, width: W, height: H - r.y - r.h },
    { left: 0, top: r.y, width: r.x, height: r.h },
    { left: r.x + r.w, top: r.y, width: W - r.x - r.w, height: r.h },
  ];
  return (
    <>
      {regions.map((style, i) => (
        <div key={i} className="pointer-events-none absolute bg-gray-900/50" style={{ ...style, zIndex: 28 }} />
      ))}
    </>
  );
}
