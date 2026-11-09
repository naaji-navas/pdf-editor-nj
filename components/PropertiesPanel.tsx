"use client";

import { useRef, type ReactNode } from "react";
import type {
  CustomFont,
  DocState,
  ExistingLink,
  PageObject,
  Rect,
  Selection,
  TextRun,
  TextStyle,
  Tool,
  ToolDefaults,
} from "@/lib/types";
import { STANDARD_FAMILIES } from "@/lib/fonts";
import { safeLinkUrl } from "@/lib/links";
import Icon from "./icons";

export interface PanelActions {
  setDefaults: (fn: (d: ToolDefaults) => ToolDefaults) => void;
  runText: (run: TextRun, text: string, gesture?: string) => void;
  runStyle: (run: TextRun, patch: Partial<TextStyle>, gesture?: string) => void;
  moveRun: (run: TextRun, dx: number, dy: number, gesture?: string) => void;
  revertRun: (run: TextRun) => void;
  updateObject: (id: string, patch: object, gesture?: string) => void;
  replaceImage: (id: string) => void;
  editLink: (link: ExistingLink, patch: { url?: string; page?: number }, gesture?: string) => void;
  setCrop: (pageIndex: number, rect: Rect | null) => void;
  cropAll: (rect: Rect) => void;
  uploadFont: (file: File) => void;
  duplicate: () => void;
  remove: () => void;
}

interface PropertiesPanelProps {
  selection: Selection;
  tool: Tool;
  doc: DocState;
  run?: TextRun;
  link?: ExistingLink;
  pageCount: number;
  defaults: ToolDefaults;
  customFonts: CustomFont[];
  actions: PanelActions;
}

const inputClass =
  "h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-gray-100 px-4 py-3">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function ColorField({ value, onChange, onClear }: { value: string | null; onChange: (v: string) => void; onClear?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value ?? "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
      />
      <span className="flex-1 font-mono text-xs text-gray-600">{value ?? "None"}</span>
      {onClear && (
        <button
          onClick={onClear}
          className={`rounded px-2 py-1 text-xs ${value === null ? "bg-gray-200 text-gray-800" : "text-gray-500 hover:bg-gray-100"}`}
        >
          None
        </button>
      )}
    </div>
  );
}

function NumberField({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={Math.round(value * 100) / 100}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
      className={inputClass}
    />
  );
}

function OpacityField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Field label={`Opacity — ${Math.round(value * 100)}%`}>
      <input type="range" min={0.05} max={1} step={0.05} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-blue-600" />
    </Field>
  );
}

function Toggle({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`h-8 w-8 rounded-md border text-sm ${active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
    >
      {children}
    </button>
  );
}

function Button({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium ${
        danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function FontPicker({
  value,
  customFonts,
  allowOriginal,
  onChange,
  onUpload,
}: {
  value: string | undefined;
  customFonts: CustomFont[];
  allowOriginal?: boolean;
  onChange: (family: string | undefined) => void;
  onUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Field label="Font">
      <div className="flex gap-1">
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className={inputClass}>
          {allowOriginal && <option value="">Original</option>}
          {STANDARD_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          {customFonts.length > 0 && (
            <optgroup label="Uploaded">
              {customFonts.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          onClick={() => fileRef.current?.click()}
          title="Upload a .ttf or .otf font"
          aria-label="Upload font"
          className="flex h-8 w-9 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          <Icon name="upload" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,font/ttf,font/otf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
      </div>
    </Field>
  );
}

function TextStyleFields({
  style,
  customFonts,
  allowOriginal,
  onChange,
  onUpload,
}: {
  style: Partial<TextStyle> & { fontSize: number };
  customFonts: CustomFont[];
  allowOriginal?: boolean;
  onChange: (patch: Partial<TextStyle>, field: string) => void;
  onUpload: (file: File) => void;
}) {
  return (
    <>
      <FontPicker
        value={style.fontFamily}
        customFonts={customFonts}
        allowOriginal={allowOriginal}
        onChange={(fontFamily) => onChange({ fontFamily }, "family")}
        onUpload={onUpload}
      />
      <div className="flex items-end gap-2">
        <div className="w-20">
          <Field label="Size">
            <NumberField value={style.fontSize} min={1} max={400} step={0.5} onChange={(fontSize) => onChange({ fontSize }, "size")} />
          </Field>
        </div>
        <Toggle active={!!style.bold} onClick={() => onChange({ bold: !style.bold }, "bold")} label="Bold">
          <b>B</b>
        </Toggle>
        <Toggle active={!!style.italic} onClick={() => onChange({ italic: !style.italic }, "italic")} label="Italic">
          <i className="font-serif">I</i>
        </Toggle>
      </div>
      <Field label="Color">
        <ColorField value={style.color ?? "#000000"} onChange={(color) => onChange({ color }, "color")} />
      </Field>
    </>
  );
}

function LinkTargetFields({
  url,
  page,
  pageCount,
  onChange,
}: {
  url?: string;
  page?: number;
  pageCount: number;
  onChange: (patch: { url?: string; page?: number }, field: string) => void;
}) {
  const mode = page !== undefined && !url ? "page" : "url";
  const invalid = !!url && !safeLinkUrl(url);
  return (
    <>
      <div className="flex rounded-md border border-gray-300 p-0.5 text-xs">
        {(["url", "page"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onChange(m === "url" ? { url: url ?? "", page: undefined } : { url: undefined, page: page ?? 1 }, "mode")}
            className={`flex-1 rounded py-1 ${mode === m ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            {m === "url" ? "Web / email" : "Page in this PDF"}
          </button>
        ))}
      </div>
      {mode === "url" ? (
        <Field label="Address">
          <input
            value={url ?? ""}
            onChange={(e) => onChange({ url: e.target.value, page: undefined }, "url")}
            placeholder="https://example.com or mailto:…"
            className={`${inputClass} ${invalid ? "border-red-400" : ""}`}
          />
          {invalid && <p className="mt-1 text-xs text-red-600">Only http(s), mailto and tel links are allowed.</p>}
        </Field>
      ) : (
        <Field label={`Page (1–${pageCount})`}>
          <NumberField value={page ?? 1} min={1} max={pageCount} onChange={(p) => onChange({ page: Math.round(p), url: undefined }, "page")} />
        </Field>
      )}
    </>
  );
}

function ObjectFields({ obj, pageCount, customFonts, actions }: { obj: PageObject; pageCount: number; customFonts: CustomFont[]; actions: PanelActions }) {
  const set = (patch: object, field: string) => actions.updateObject(obj.id, patch, `panel-${obj.id}-${field}`);
  switch (obj.kind) {
    case "text":
      return (
        <Section title="Text box">
          <Field label="Text">
            <textarea
              value={obj.text}
              onChange={(e) => set({ text: e.target.value }, "text")}
              rows={3}
              className={`${inputClass} h-auto py-1.5`}
            />
          </Field>
          <TextStyleFields
            style={obj.style}
            customFonts={customFonts}
            onUpload={actions.uploadFont}
            onChange={(patch, field) => {
              const style = { ...obj.style, ...patch, fontFamily: patch.fontFamily ?? obj.style.fontFamily };
              set({ style }, field);
              actions.setDefaults((d) => ({ ...d, text: style }));
            }}
          />
        </Section>
      );
    case "image":
      return (
        <Section title="Image">
          <OpacityField value={obj.opacity} onChange={(opacity) => set({ opacity }, "opacity")} />
          <Button onClick={() => actions.replaceImage(obj.id)}>
            <Icon name="image" /> Replace image
          </Button>
        </Section>
      );
    case "rect":
    case "ellipse":
      return (
        <Section title={obj.kind === "rect" ? "Rectangle" : "Ellipse"}>
          <Field label="Fill">
            <ColorField value={obj.fill} onChange={(fill) => set({ fill }, "fill")} onClear={() => set({ fill: null }, "fill")} />
          </Field>
          <Field label="Border">
            <ColorField value={obj.stroke} onChange={(stroke) => set({ stroke }, "stroke")} onClear={() => set({ stroke: null }, "stroke")} />
          </Field>
          <Field label="Border width">
            <NumberField value={obj.strokeWidth} min={0.25} max={40} step={0.5} onChange={(strokeWidth) => set({ strokeWidth }, "width")} />
          </Field>
          <OpacityField value={obj.opacity} onChange={(opacity) => set({ opacity }, "opacity")} />
        </Section>
      );
    case "line":
    case "arrow":
      return (
        <Section title={obj.kind === "line" ? "Line" : "Arrow"}>
          <div className="flex rounded-md border border-gray-300 p-0.5 text-xs">
            {(["line", "arrow"] as const).map((k) => (
              <button
                key={k}
                onClick={() => set({ kind: k }, "kind")}
                className={`flex-1 rounded py-1 capitalize ${obj.kind === k ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {k}
              </button>
            ))}
          </div>
          <Field label="Color">
            <ColorField value={obj.stroke} onChange={(stroke) => set({ stroke }, "stroke")} />
          </Field>
          <Field label="Width">
            <NumberField value={obj.strokeWidth} min={0.25} max={40} step={0.5} onChange={(strokeWidth) => set({ strokeWidth }, "width")} />
          </Field>
          <OpacityField value={obj.opacity} onChange={(opacity) => set({ opacity }, "opacity")} />
        </Section>
      );
    case "link":
      return (
        <Section title="Link">
          <LinkTargetFields url={obj.url} page={obj.page} pageCount={pageCount} onChange={set} />
          {!obj.url && obj.page === undefined && <p className="text-xs text-amber-600">Links without a target are skipped on download.</p>}
        </Section>
      );
    case "colorout":
      return (
        <Section title="Colorout">
          <Field label="Color">
            <ColorField value={obj.color} onChange={(color) => set({ color }, "color")} />
          </Field>
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            This only covers the area. Text underneath stays in the file, so don&apos;t use it to hide sensitive data.
          </p>
        </Section>
      );
  }
}

function Defaults({ tool, defaults, customFonts, actions }: { tool: Tool; defaults: ToolDefaults; customFonts: CustomFont[]; actions: PanelActions }) {
  const { setDefaults } = actions;
  if (tool === "text") {
    return (
      <Section title="New text">
        <TextStyleFields
          style={defaults.text}
          customFonts={customFonts}
          onUpload={actions.uploadFont}
          onChange={(patch) =>
            setDefaults((d) => ({ ...d, text: { ...d.text, ...patch, fontFamily: patch.fontFamily ?? d.text.fontFamily } }))
          }
        />
      </Section>
    );
  }
  if (tool === "rect" || tool === "ellipse") {
    const s = defaults.shape;
    const set = (patch: Partial<ToolDefaults["shape"]>) => setDefaults((d) => ({ ...d, shape: { ...d.shape, ...patch } }));
    return (
      <Section title="New shapes">
        <Field label="Fill">
          <ColorField value={s.fill} onChange={(fill) => set({ fill })} onClear={() => set({ fill: null })} />
        </Field>
        <Field label="Border">
          <ColorField value={s.stroke} onChange={(stroke) => set({ stroke })} onClear={() => set({ stroke: null })} />
        </Field>
        <Field label="Border width">
          <NumberField value={s.strokeWidth} min={0.25} max={40} step={0.5} onChange={(strokeWidth) => set({ strokeWidth })} />
        </Field>
        <OpacityField value={s.opacity} onChange={(opacity) => set({ opacity })} />
      </Section>
    );
  }
  if (tool === "line" || tool === "arrow") {
    const s = defaults.line;
    const set = (patch: Partial<ToolDefaults["line"]>) => setDefaults((d) => ({ ...d, line: { ...d.line, ...patch } }));
    return (
      <Section title={tool === "line" ? "New lines" : "New arrows"}>
        <Field label="Color">
          <ColorField value={s.stroke} onChange={(stroke) => set({ stroke })} />
        </Field>
        <Field label="Width">
          <NumberField value={s.strokeWidth} min={0.25} max={40} step={0.5} onChange={(strokeWidth) => set({ strokeWidth })} />
        </Field>
        <OpacityField value={s.opacity} onChange={(opacity) => set({ opacity })} />
      </Section>
    );
  }
  if (tool === "colorout") {
    return (
      <Section title="New colorout">
        <Field label="Color">
          <ColorField value={defaults.colorout} onChange={(colorout) => setDefaults((d) => ({ ...d, colorout }))} />
        </Field>
      </Section>
    );
  }
  const tips: Record<string, string> = {
    select: "Click any text in the PDF to select it, double-click to edit it in place. Drag added objects to move them.",
    image: "Choose an image to place it on the current page. You can also paste an image.",
    link: "Drag over an area to make it clickable, then set a web address or a page.",
    crop: "Drag over the area of the page you want to keep.",
  };
  return (
    <Section title="Tips">
      <p className="text-xs leading-relaxed text-gray-500">{tips[tool] ?? tips.select}</p>
    </Section>
  );
}

export default function PropertiesPanel({ selection, tool, doc, run, link, pageCount, defaults, customFonts, actions }: PropertiesPanelProps) {
  let body: ReactNode = <Defaults tool={tool} defaults={defaults} customFonts={customFonts} actions={actions} />;
  let objectActions = false;

  if (selection?.type === "run" && run) {
    const edit = doc.textEdits[run.id];
    const style = edit?.style ?? {};
    const dx = edit?.dx ?? 0;
    const dy = edit?.dy ?? 0;
    const redraws = style.fontFamily !== undefined || style.bold !== undefined || style.italic !== undefined;
    body = (
      <Section title="PDF text">
        <Field label="Text">
          <input
            value={edit?.text ?? run.text}
            onChange={(e) => actions.runText(run, e.target.value, `panel-${run.id}-text`)}
            className={inputClass}
          />
        </Field>
        <TextStyleFields
          style={{ ...style, fontSize: style.fontSize ?? run.fontSize }}
          customFonts={customFonts}
          allowOriginal
          onUpload={actions.uploadFont}
          onChange={(patch, field) => actions.runStyle(run, patch, `panel-${run.id}-${field}`)}
        />
        <p className="text-xs leading-relaxed text-gray-500">
          {redraws
            ? "Font, bold or italic changes redraw this text with the chosen font."
            : "Text, size and color are changed inside the PDF itself, keeping the original font."}
        </p>
        <div className="flex items-end gap-2">
          <Field label="X (pt)">
            <NumberField value={run.x + dx} min={0} max={10000} onChange={(v) => actions.moveRun(run, v - run.x, dy, `panel-${run.id}-x`)} />
          </Field>
          <Field label="Y (pt)">
            <NumberField value={run.y + dy} min={0} max={10000} onChange={(v) => actions.moveRun(run, dx, v - run.y, `panel-${run.id}-y`)} />
          </Field>
          {(dx !== 0 || dy !== 0) && (
            <button
              onClick={() => actions.moveRun(run, 0, 0)}
              title="Move back to the original position"
              className="h-8 shrink-0 rounded-md border border-gray-300 px-2 text-xs text-gray-600 hover:bg-gray-50"
            >
              Reset
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">Drag the text on the page or use the arrow keys to move it.</p>
        <div className="flex gap-2">
          <Button onClick={() => actions.revertRun(run)}>
            <Icon name="revert" /> Revert
          </Button>
          <Button onClick={actions.remove} danger>
            <Icon name="trash" /> Delete text
          </Button>
        </div>
      </Section>
    );
  } else if (selection?.type === "link" && link) {
    const edit = doc.linkEdits[link.id];
    body = (
      <Section title="Existing link">
        <LinkTargetFields
          url={edit ? edit.url : link.url}
          page={edit ? edit.page : link.page}
          pageCount={pageCount}
          onChange={(patch, field) => actions.editLink(link, patch, `panel-${link.id}-${field}`)}
        />
        <Button onClick={actions.remove} danger>
          <Icon name="trash" /> Remove link
        </Button>
      </Section>
    );
  } else if (selection?.type === "crop") {
    const rect = doc.crops[selection.pageIndex];
    if (rect) {
      body = (
        <Section title={`Crop — page ${selection.pageIndex + 1}`}>
          <p className="text-xs text-gray-500">
            {Math.round(rect.width)} × {Math.round(rect.height)} pt. Everything outside the frame is removed on download.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => actions.cropAll(rect)}>Apply to all pages</Button>
            <Button onClick={() => actions.setCrop(selection.pageIndex, null)} danger>
              Remove
            </Button>
          </div>
        </Section>
      );
    }
  } else if (selection?.type === "object") {
    const obj = doc.objects.find((o) => o.id === selection.id);
    if (obj) {
      body = <ObjectFields obj={obj} pageCount={pageCount} customFonts={customFonts} actions={actions} />;
      objectActions = true;
    }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white">
      {body}
      {objectActions && (
        <div className="flex gap-2 px-4 py-3">
          <Button onClick={actions.duplicate}>
            <Icon name="copy" /> Duplicate
          </Button>
          <Button onClick={actions.remove} danger>
            <Icon name="trash" /> Delete
          </Button>
        </div>
      )}
    </aside>
  );
}
