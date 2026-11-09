"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_DOC,
  isLine,
  type CustomFont,
  type DocState,
  type ExistingLink,
  type ImageObject,
  type PageInfo,
  type PageObject,
  type Rect,
  type SearchHit,
  type Selection,
  type TextEdit,
  type TextObject,
  type TextRun,
  type TextStyle,
  type Tool,
  type ToolDefaults,
} from "@/lib/types";
import { extractPage, getPageInfos, loadPdf, renderPageImage, type PdfDoc } from "@/lib/pdf-renderer";
import { applyEdits } from "@/lib/pdf-modifier";
import { useHistory } from "@/lib/use-history";
import { createRenderQueue } from "@/lib/render-queue";
import { loadCustomFont, registerFont } from "@/lib/fonts";
import { countEdits, deleteSession, fingerprint, loadSession, saveSession } from "@/lib/autosave";
import { loadImageFile } from "@/lib/images";
import { newId } from "@/lib/ids";
import PageView, { type PageActions } from "./PageView";
import TopBar, { ZOOM_MAX, ZOOM_MIN, zoomStep, type SaveStatus } from "./TopBar";
import ToolRail, { TOOL_KEYS } from "./ToolRail";
import ThumbnailSidebar from "./ThumbnailSidebar";
import PropertiesPanel, { type PanelActions } from "./PropertiesPanel";
import SearchBar from "./SearchBar";
import ShortcutsDialog from "./ShortcutsDialog";

interface PdfEditorProps {
  pdfData: ArrayBuffer;
  fileName: string;
  onBack: () => void;
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
};

interface PageImage {
  url: string;
  key: string;
  seq: number;
}

interface Preview {
  pdf: PdfDoc;
  version: number;
  pages: Set<number>;
}

type PageData = { runs: TextRun[]; links: ExistingLink[] };

const IMAGE_CACHE = 12;
const PAGE_PADDING = 24;

const DEFAULTS: ToolDefaults = {
  text: { fontFamily: "Helvetica", fontSize: 14, color: "#000000", bold: false, italic: false },
  shape: { stroke: "#e11d48", fill: null, strokeWidth: 2, opacity: 1 },
  line: { stroke: "#e11d48", strokeWidth: 2, opacity: 1 },
  colorout: "#ffffff",
};

const DOWNLOAD_FRAME = "pdf-download-frame";

// A real HTTP attachment download; blob-URL downloads stall as "Unconfirmed" in some browsers
function submitDownloadForm(blob: Blob, fileName: string) {
  let frame = document.querySelector<HTMLIFrameElement>(`iframe[name="${DOWNLOAD_FRAME}"]`);
  if (!frame) {
    frame = document.createElement("iframe");
    frame.name = DOWNLOAD_FRAME;
    frame.hidden = true;
    document.body.appendChild(frame);
  }

  const files = new DataTransfer();
  files.items.add(new File([blob], fileName, { type: "application/pdf" }));
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.name = "file";
  fileInput.files = files.files;

  const nameInput = document.createElement("input");
  nameInput.type = "hidden";
  nameInput.name = "name";
  nameInput.value = fileName;

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/download";
  form.enctype = "multipart/form-data";
  form.target = DOWNLOAD_FRAME;
  form.hidden = true;
  form.append(fileInput, nameInput);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

const NON_TEXT_INPUTS = new Set(["color", "range", "checkbox", "radio", "button", "submit", "file"]);
const isTypingTarget = (el: EventTarget | null) =>
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(el.type)) ||
  (el instanceof HTMLElement && el.isContentEditable);

const NO_FONTS: CustomFont[] = [];

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
const desiredKey = (pageIndex: number, preview: Preview | null, zoom: number) =>
  `${preview?.pages.has(pageIndex) ? preview.version : 0}@${zoom}`;

type RunPatch = { text?: string; style?: Partial<TextStyle>; dx?: number; dy?: number };

function setRunEdit(d: DocState, run: TextRun, patch: RunPatch): DocState {
  const existing = d.textEdits[run.id];
  const text = patch.text ?? existing?.text ?? run.text;
  const style = "style" in patch ? patch.style : existing?.style;
  const hasStyle = !!style && Object.keys(style).length > 0;
  const dx = Math.round((patch.dx ?? existing?.dx ?? 0) * 100) / 100;
  const dy = Math.round((patch.dy ?? existing?.dy ?? 0) * 100) / 100;
  const moved = dx !== 0 || dy !== 0;
  const next = { ...d.textEdits };
  if (text === run.text && !hasStyle && !moved) {
    if (!existing) return d;
    delete next[run.id];
  } else {
    const edit: TextEdit = { run, text, style: hasStyle ? style : undefined, ...(moved ? { dx, dy } : {}) };
    if (
      existing &&
      existing.text === edit.text &&
      (existing.dx ?? 0) === dx &&
      (existing.dy ?? 0) === dy &&
      JSON.stringify(existing.style) === JSON.stringify(edit.style)
    )
      return d;
    next[run.id] = edit;
  }
  return { ...d, textEdits: next };
}

function moveObject(obj: PageObject, dx: number, dy: number, page: PageInfo): PageObject {
  if (isLine(obj)) {
    const cdx = Math.min(Math.max(dx, -Math.min(obj.x1, obj.x2)), page.width - Math.max(obj.x1, obj.x2));
    const cdy = Math.min(Math.max(dy, -Math.min(obj.y1, obj.y2)), page.height - Math.max(obj.y1, obj.y2));
    return { ...obj, x1: obj.x1 + cdx, y1: obj.y1 + cdy, x2: obj.x2 + cdx, y2: obj.y2 + cdy };
  }
  return {
    ...obj,
    x: Math.min(Math.max(obj.x + dx, 0), Math.max(0, page.width - obj.width)),
    y: Math.min(Math.max(obj.y + dy, 0), Math.max(0, page.height - obj.height)),
  };
}

export default function PdfEditor({ pdfData, fileName, onBack }: PdfEditorProps) {
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [infos, setInfos] = useState<PageInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const history = useHistory<DocState>(EMPTY_DOC);
  const { present: doc, update, undo, redo, reset } = history;

  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<Selection>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState<TextObject | null>(null);
  const [defaults, setDefaults] = useState(DEFAULTS);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>(NO_FONTS);

  const [zoom, setZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [visible, setVisible] = useState<number[]>([]);
  const [images, setImages] = useState<Record<number, PageImage>>({});
  const [pageData, setPageData] = useState<Record<number, PageData>>({});
  const [preview, setPreview] = useState<Preview | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hitIndex, setHitIndex] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ doc: DocState; fonts: CustomFont[] } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const [pageQueue] = useState(() => createRenderQueue(2));
  const [dataQueue] = useState(() => createRenderQueue(2));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<Record<number, PageImage>>({});
  const previewRef = useRef<Preview | null>(null);
  const previewVersion = useRef(0);
  const live = useRef({ zoom, visible, preview });
  const inflight = useRef(new Set<string>());
  const requestedData = useRef(new Set<number>());
  const renderSeq = useRef(0);
  const pendingScroll = useRef<number | null>(null);
  const scrollFrame = useRef(0);
  const clipboard = useRef<PageObject | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  const pasteHandler = useRef<(e: ClipboardEvent) => void>(() => {});

  useEffect(() => {
    scrollRef.current = scrollEl;
  }, [scrollEl]);
  useEffect(() => {
    live.current = { zoom, visible, preview };
  });

  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDoc | null = null;
    (async () => {
      try {
        const opened = await loadPdf(pdfData);
        loaded = opened;
        if (cancelled) return;
        const pageInfos = await getPageInfos(opened);
        if (cancelled) return;
        const available = (scrollRef.current?.clientWidth ?? 900) - PAGE_PADDING * 2;
        const widest = Math.max(...pageInfos.map((p) => p.width), 1);
        setZoom(clampZoom(Math.min(1.5, available / widest)));
        setInfos(pageInfos);
        setPdf(opened);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load PDF");
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, [pdfData]);

  useEffect(
    () => () => {
      Object.values(imagesRef.current).forEach((img) => URL.revokeObjectURL(img.url));
      imagesRef.current = {};
      previewRef.current?.pdf.destroy();
      previewRef.current = null;
    },
    []
  );

  const storeImage = useCallback((pageIndex: number, entry: PageImage) => {
    const prev = imagesRef.current;
    const old = prev[pageIndex];
    if (old && old.seq > entry.seq) {
      URL.revokeObjectURL(entry.url);
      return;
    }
    if (old) URL.revokeObjectURL(old.url);
    const next = { ...prev, [pageIndex]: entry };
    const onScreen = new Set(live.current.visible);
    const evictable = Object.entries(next)
      .filter(([i]) => !onScreen.has(Number(i)) && Number(i) !== pageIndex)
      .sort((a, b) => a[1].seq - b[1].seq);
    while (Object.keys(next).length > IMAGE_CACHE && evictable.length) {
      const [i, img] = evictable.shift()!;
      URL.revokeObjectURL(img.url);
      delete next[Number(i)];
    }
    imagesRef.current = next;
    setImages(next);
  }, []);

  // Render visible pages; edited pages come from the live preview so they match the download
  useEffect(() => {
    if (!pdf) return;
    for (const pageIndex of visible) {
      const key = desiredKey(pageIndex, preview, zoom);
      const job = `${pageIndex}:${key}`;
      if (imagesRef.current[pageIndex]?.key === key || inflight.current.has(job)) continue;
      inflight.current.add(job);
      const source = preview?.pages.has(pageIndex) ? preview.pdf : pdf;
      const seq = ++renderSeq.current;
      pageQueue(async () => {
        const now = live.current;
        if (!now.visible.includes(pageIndex) || desiredKey(pageIndex, now.preview, now.zoom) !== key) return null;
        return renderPageImage(source, pageIndex, zoom);
      })
        .then((url) => url && storeImage(pageIndex, { url, key, seq }))
        .catch(() => {})
        .finally(() => inflight.current.delete(job));
    }
  }, [pdf, visible, zoom, preview, pageQueue, storeImage]);

  const ensureData = useCallback(
    (pages: number[]) => {
      if (!pdf) return;
      for (const pageIndex of pages) {
        if (requestedData.current.has(pageIndex)) continue;
        requestedData.current.add(pageIndex);
        dataQueue(() => extractPage(pdf, pageIndex))
          .then((data) => setPageData((prev) => ({ ...prev, [pageIndex]: data })))
          .catch(() => requestedData.current.delete(pageIndex));
      }
    },
    [pdf, dataQueue]
  );

  useEffect(() => ensureData(visible), [visible, ensureData]);
  useEffect(() => {
    if (searchOpen && query) ensureData(infos.map((p) => p.pageIndex));
  }, [searchOpen, query, infos, ensureData]);

  // Debounced re-render of edited text through the real export path
  useEffect(() => {
    const edits = doc.textEdits;
    const pages = new Set(Object.values(edits).map((e) => e.run.pageIndex));
    let cancelled = false;
    const timer = setTimeout(async () => {
      let next: Preview | null = null;
      if (pages.size) {
        try {
          const bytes = await applyEdits(pdfData, { ...EMPTY_DOC, textEdits: edits }, { customFonts, textOnly: true });
          if (cancelled) return;
          const out = await loadPdf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
          if (cancelled) {
            out.destroy();
            return;
          }
          next = { pdf: out, version: ++previewVersion.current, pages };
        } catch (err) {
          if (!cancelled) setNotice(err instanceof Error ? err.message : "Couldn't preview the edit.");
          return;
        }
      }
      const old = previewRef.current;
      previewRef.current = next;
      setPreview(next);
      old?.pdf.destroy();
    }, pages.size ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc.textEdits, customFonts, pdfData]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const hasEdits = countEdits(doc) > 0;

  // ---- Autosave (IndexedDB, keyed by the PDF's hash) ----

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await fingerprint(pdfData);
        const session = await loadSession(id);
        if (cancelled) return;
        if (session) {
          const fonts = await Promise.all(session.fonts.map((f) => registerFont(f).catch(() => f)));
          if (cancelled) return;
          reset(session.doc);
          setCustomFonts(fonts);
          setSaved({ doc: session.doc, fonts });
          setNotice(`Restored your edits from ${new Date(session.updatedAt).toLocaleString()}`);
        } else {
          setSaved({ doc: EMPTY_DOC, fonts: NO_FONTS });
        }
        setSessionId(id);
      } catch (err) {
        console.warn("Autosave unavailable:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfData, reset]);

  const pendingSave = !!sessionId && (saved?.doc !== doc || saved?.fonts !== customFonts);

  useEffect(() => {
    if (!sessionId || !pendingSave) return;
    const timer = setTimeout(async () => {
      try {
        if (countEdits(doc) > 0 || customFonts.length > 0) {
          await saveSession({ id: sessionId, fileName, pdf: pdfData, doc, fonts: customFonts, updatedAt: Date.now() });
        } else {
          await deleteSession(sessionId);
        }
        setSaved({ doc, fonts: customFonts });
        setSaveFailed(false);
      } catch (err) {
        console.warn("Autosave failed:", err);
        setSaveFailed(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [sessionId, pendingSave, doc, customFonts, fileName, pdfData]);

  const saveStatus: SaveStatus = !sessionId || saveFailed ? (hasEdits ? "unsaved" : "idle") : pendingSave ? "saving" : hasEdits ? "saved" : "idle";
  const atRisk = saveStatus === "unsaved" || saveStatus === "saving";

  useEffect(() => {
    if (!atRisk) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [atRisk]);

  // ---- Viewport ----

  const applyZoom = useCallback((value: number) => {
    const el = scrollRef.current;
    if (el && el.scrollHeight > 0) pendingScroll.current = (el.scrollTop + el.clientHeight / 2) / el.scrollHeight;
    setZoom(clampZoom(value));
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const ratio = pendingScroll.current;
    if (!el || ratio === null) return;
    pendingScroll.current = null;
    el.scrollTop = ratio * el.scrollHeight - el.clientHeight / 2;
  }, [zoom]);

  useEffect(() => {
    if (!scrollEl) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      applyZoom(live.current.zoom * Math.exp(-e.deltaY * 0.01));
    };
    scrollEl.addEventListener("wheel", onWheel, { passive: false });
    return () => scrollEl.removeEventListener("wheel", onWheel);
  }, [scrollEl, applyZoom]);

  const fitWidth = () => {
    const el = scrollRef.current;
    const page = infos[currentPage];
    if (el && page) applyZoom((el.clientWidth - PAGE_PADDING * 2) / page.width);
  };

  const handleScroll = () => {
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const mark = el.getBoundingClientRect().top + el.clientHeight * 0.35;
      let page = 0;
      for (const node of el.querySelectorAll<HTMLElement>("[data-page-index]")) {
        if (node.getBoundingClientRect().top > mark) break;
        page = Number(node.dataset.pageIndex);
      }
      setCurrentPage(page);
    });
  };

  const scrollToPage = (pageIndex: number, offset = -16) => {
    const el = scrollRef.current;
    const node = el?.querySelector(`[data-page-index="${pageIndex}"]`);
    if (!el || !node) return;
    el.scrollTop += node.getBoundingClientRect().top - el.getBoundingClientRect().top + offset;
  };

  const onVisibility = useCallback((pageIndex: number, isVisible: boolean) => {
    setVisible((prev) => {
      if (isVisible === prev.includes(pageIndex)) return prev;
      return isVisible ? [...prev, pageIndex].sort((a, b) => a - b) : prev.filter((p) => p !== pageIndex);
    });
  }, []);

  // ---- Lookups ----

  const findRun = (id: string): TextRun | undefined => {
    const edited = doc.textEdits[id]?.run;
    if (edited) return edited;
    const page = Number(/^p(\d+)r/.exec(id)?.[1]);
    return pageData[page]?.runs.find((r) => r.id === id);
  };
  const findLink = (id: string): ExistingLink | undefined => {
    const edited = doc.linkEdits[id]?.link;
    if (edited) return edited;
    const page = Number(/^p(\d+)l/.exec(id)?.[1]);
    return pageData[page]?.links.find((l) => l.id === id);
  };
  const viewDoc = useMemo(() => (draftText ? { ...doc, objects: [...doc.objects, draftText] } : doc), [doc, draftText]);
  const selectedObject = selection?.type === "object" ? viewDoc.objects.find((o) => o.id === selection.id) : undefined;

  // ---- Mutations ----

  const updateObject = useCallback(
    (id: string, patch: object, gesture?: string) => {
      setDraftText((d) => (d?.id === id ? ({ ...d, ...patch } as TextObject) : d));
      update((d) => {
        if (!d.objects.some((o) => o.id === id)) return d;
        return { ...d, objects: d.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as PageObject) : o)) };
      }, gesture);
    },
    [update]
  );

  const addObject = (obj: PageObject, startEditing = false) => {
    setSelection({ type: "object", id: obj.id });
    setTool("select");
    if (startEditing && obj.kind === "text") {
      setDraftText(obj);
      setEditingId(obj.id);
      return;
    }
    update((d) => ({ ...d, objects: [...d.objects, obj] }));
  };

  const removeObject = (id: string) => update((d) => ({ ...d, objects: d.objects.filter((o) => o.id !== id) }));

  const commitObjectText = (id: string, text: string) => {
    if (draftText?.id === id) {
      setDraftText(null);
      if (text.trim()) update((d) => ({ ...d, objects: [...d.objects, { ...draftText, text }] }));
      else setSelection(null);
      return;
    }
    if (!text.trim()) {
      removeObject(id);
      setSelection(null);
    } else {
      updateObject(id, { text });
    }
  };

  const runText = (run: TextRun, text: string, gesture?: string) =>
    update((d) => setRunEdit(d, run, { text }), gesture);

  const runStyle = (run: TextRun, patch: Partial<TextStyle>, gesture?: string) =>
    update((d) => {
      const edit = d.textEdits[run.id];
      const style: Record<string, unknown> = { ...edit?.style };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete style[k];
        else style[k] = v;
      }
      if (style.fontSize === run.fontSize) delete style.fontSize;
      return setRunEdit(d, run, { style: style as Partial<TextStyle> });
    }, gesture);

  const moveRun = (run: TextRun, dx: number, dy: number, gesture?: string) => {
    const page = infos[run.pageIndex];
    if (!page) return;
    const width = Math.min(run.width, page.width);
    const height = Math.min(run.height, page.height);
    const x = Math.min(Math.max(run.x + dx, 0), page.width - width);
    const y = Math.min(Math.max(run.y + dy, 0), page.height - height);
    update((d) => setRunEdit(d, run, { dx: x - run.x, dy: y - run.y }), gesture);
  };

  const nudgeRun = (run: TextRun, dx: number, dy: number) => {
    const edit = doc.textEdits[run.id];
    moveRun(run, (edit?.dx ?? 0) + dx, (edit?.dy ?? 0) + dy, `nudge-run-${run.id}`);
  };

  const revertRun = (run: TextRun) =>
    update((d) => {
      if (!d.textEdits[run.id]) return d;
      const next = { ...d.textEdits };
      delete next[run.id];
      return { ...d, textEdits: next };
    });

  const editLink = (link: ExistingLink, patch: { url?: string; page?: number }, gesture?: string) =>
    update((d) => {
      const base = d.linkEdits[link.id] ?? { link, url: link.url, page: link.page };
      return { ...d, linkEdits: { ...d.linkEdits, [link.id]: { ...base, ...patch, deleted: false } } };
    }, gesture);

  const setCrop = (pageIndex: number, rect: Rect | null, gesture?: string) => {
    update((d) => {
      if (!rect && !d.crops[pageIndex]) return d;
      const crops = { ...d.crops };
      if (rect) crops[pageIndex] = rect;
      else delete crops[pageIndex];
      return { ...d, crops };
    }, gesture);
    if (!rect && selection?.type === "crop") setSelection(null);
  };

  const cropAll = (rect: Rect) =>
    update((d) => {
      const crops: Record<number, Rect> = {};
      for (const p of infos) {
        const x = Math.min(rect.x, p.width - 1);
        const y = Math.min(rect.y, p.height - 1);
        crops[p.pageIndex] = { x, y, width: Math.min(rect.width, p.width - x), height: Math.min(rect.height, p.height - y) };
      }
      return { ...d, crops };
    });

  const removeSelection = () => {
    if (!selection) return;
    if (selection.type === "object") removeObject(selection.id);
    else if (selection.type === "run") {
      const run = findRun(selection.id);
      if (run) runText(run, "");
    } else if (selection.type === "link") {
      const link = findLink(selection.id);
      if (link) update((d) => ({ ...d, linkEdits: { ...d.linkEdits, [link.id]: { link, deleted: true } } }));
    } else setCrop(selection.pageIndex, null);
    setSelection(null);
  };

  const cloneTo = (obj: PageObject, pageIndex: number, offset: number) => {
    const page = infos[pageIndex];
    if (!page) return;
    const copy = moveObject({ ...obj, id: newId(obj.kind), pageIndex }, offset, offset, page);
    update((d) => ({ ...d, objects: [...d.objects, copy] }));
    setSelection({ type: "object", id: copy.id });
  };

  const duplicate = () => {
    if (selectedObject && selectedObject !== draftText) cloneTo(selectedObject, selectedObject.pageIndex, 12);
  };

  const nudge = (dx: number, dy: number) => {
    if (selection?.type === "object" && selectedObject) {
      const page = infos[selectedObject.pageIndex];
      if (page) update((d) => ({ ...d, objects: d.objects.map((o) => (o.id === selectedObject.id ? moveObject(o, dx, dy, page) : o)) }), `nudge-${selectedObject.id}`);
    } else if (selection?.type === "run") {
      const run = findRun(selection.id);
      if (run) nudgeRun(run, dx, dy);
    } else if (selection?.type === "crop") {
      const rect = doc.crops[selection.pageIndex];
      const page = infos[selection.pageIndex];
      if (rect && page) {
        const x = Math.min(Math.max(rect.x + dx, 0), page.width - rect.width);
        const y = Math.min(Math.max(rect.y + dy, 0), page.height - rect.height);
        setCrop(selection.pageIndex, { ...rect, x, y }, `nudge-crop-${selection.pageIndex}`);
      }
    }
  };

  const selectTool = (next: Tool) => {
    if (next === "image") {
      replaceTarget.current = null;
      imageInput.current?.click();
      return;
    }
    setTool(next);
    setEditingId(null);
    if (next !== "select") setSelection(null);
  };

  const insertImage = async (file: File) => {
    try {
      const img = await loadImageFile(file);
      const targetId = replaceTarget.current;
      replaceTarget.current = null;
      if (targetId) {
        const target = doc.objects.find((o): o is ImageObject => o.id === targetId && o.kind === "image");
        if (target) updateObject(targetId, { src: img.src, height: (target.width * img.height) / img.width });
        return;
      }
      const page = infos[currentPage];
      if (!page) return;
      // Images are sized at 96 dpi, capped to half the page
      const fit = Math.min(1, (page.width * 0.5) / (img.width * 0.75), (page.height * 0.5) / (img.height * 0.75));
      const width = img.width * 0.75 * fit;
      const height = img.height * 0.75 * fit;
      addObject({
        id: newId("image"),
        kind: "image",
        pageIndex: currentPage,
        x: (page.width - width) / 2,
        y: (page.height - height) / 2,
        width,
        height,
        src: img.src,
        opacity: 1,
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't load that image.");
    }
  };

  const uploadFont = async (file: File) => {
    try {
      const font = await loadCustomFont(file);
      setCustomFonts((prev) => [...prev.filter((f) => f.name !== font.name), font]);
      setNotice(`Font "${font.name}" is ready to use.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't load that font.");
    }
  };

  // ---- Search ----

  const hits = useMemo<SearchHit[]>(() => {
    if (!searchOpen || !query) return [];
    const needle = query.toLowerCase();
    const out: SearchHit[] = [];
    for (const { pageIndex } of infos) {
      for (const run of pageData[pageIndex]?.runs ?? []) {
        const text = (doc.textEdits[run.id]?.text ?? run.text).toLowerCase();
        for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) {
          out.push({ key: `${run.id}:${i}`, runId: run.id, pageIndex, start: i, end: i + needle.length });
        }
      }
    }
    return out;
  }, [searchOpen, query, infos, pageData, doc.textEdits]);

  const activeIndex = hits.length ? Math.min(hitIndex, hits.length - 1) : 0;
  const activeHit = hits[activeIndex];
  const hitsByPage = useMemo(() => {
    const map = new Map<number, SearchHit[]>();
    hits.forEach((h) => map.set(h.pageIndex, [...(map.get(h.pageIndex) ?? []), h]));
    return map;
  }, [hits]);

  const stepHit = (dir: 1 | -1) => {
    if (!hits.length) return;
    const next = (activeIndex + dir + hits.length) % hits.length;
    setHitIndex(next);
    const hit = hits[next];
    const run = findRun(hit.runId);
    scrollToPage(hit.pageIndex, (run?.y ?? 0) * zoom - (scrollRef.current?.clientHeight ?? 0) / 3);
  };

  const replaceHits = (targets: SearchHit[], replacement: string) => {
    const byRun = new Map<string, SearchHit[]>();
    targets.forEach((h) => byRun.set(h.runId, [...(byRun.get(h.runId) ?? []), h]));
    update((d) => {
      let next = d;
      for (const [runId, runHits] of byRun) {
        const run = findRun(runId);
        if (!run) continue;
        let text = next.textEdits[runId]?.text ?? run.text;
        for (const h of [...runHits].sort((a, b) => b.start - a.start)) {
          text = text.slice(0, h.start) + replacement + text.slice(h.end);
        }
        next = setRunEdit(next, run, { text });
      }
      return next;
    });
  };

  // ---- Download ----

  const handleDownload = async () => {
    if (!pdf || downloading) return;
    const downloadName = `${fileName.replace(/\.pdf$/i, "")}-edited.pdf`;

    // Must be opened before any await so it still counts as part of the click
    let fileHandle: FileSystemFileHandle | null = null;
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    if (picker) {
      try {
        fileHandle = await picker({
          suggestedName: downloadName,
          types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }],
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        fileHandle = null;
      }
    }

    try {
      setDownloading(true);
      const bytes = await applyEdits(pdfData, doc, { customFonts });
      const blob = new Blob([new Uint8Array(bytes) as BlobPart], { type: "application/pdf" });
      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      }
      submitDownloadForm(blob, downloadName);
    } catch (err) {
      console.error("Download failed:", err);
      alert(`Failed to generate the PDF.\n\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleBack = () => {
    if (atRisk && !confirm("Your latest changes haven't been saved yet. Leave anyway?")) return;
    onBack();
  };

  // ---- Keyboard & clipboard ----

  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const editTarget = selection?.type === "run" ? selection.id : selectedObject?.kind === "text" ? selectedObject.id : null;

      if (mod && key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (typing || showShortcuts) {
        if (showShortcuts && e.key === "Escape") setShowShortcuts(false);
        return;
      }
      if (mod) {
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (key === "y") {
          e.preventDefault();
          redo();
        } else if (key === "=" || key === "+") {
          e.preventDefault();
          applyZoom(zoomStep(zoom, 1));
        } else if (key === "-") {
          e.preventDefault();
          applyZoom(zoomStep(zoom, -1));
        } else if (key === "0") {
          e.preventDefault();
          applyZoom(1);
        } else if (key === "d") {
          e.preventDefault();
          duplicate();
        } else if (key === "c" && selectedObject) {
          clipboard.current = selectedObject;
        }
        return;
      }
      if (e.altKey) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelection();
      } else if (e.key === "Escape") {
        setSelection(null);
        setTool("select");
        setSearchOpen(false);
      } else if (e.key === "?") {
        setShowShortcuts(true);
      } else if (e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? 10 : 1;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (delta && selection) {
          e.preventDefault();
          nudge(delta[0], delta[1]);
        }
      } else if (e.key === "Enter" && editTarget) {
        e.preventDefault();
        setEditingId(editTarget);
      } else if (TOOL_KEYS[key]) {
        selectTool(TOOL_KEYS[key]);
      }
    };

    pasteHandler.current = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        replaceTarget.current = null;
        insertImage(file);
      } else if (clipboard.current) {
        e.preventDefault();
        const source = clipboard.current;
        cloneTo(source, currentPage, source.pageIndex === currentPage ? 12 : 0);
      }
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    const onPaste = (e: ClipboardEvent) => pasteHandler.current(e);
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  // ---- Wiring ----

  const pageActions: PageActions = {
    onVisibility,
    select: (sel) => {
      setSelection(sel);
      if (sel && sel.type !== "crop" && editingId && editingId !== sel.id) setEditingId(null);
    },
    setEditing: setEditingId,
    commitRunText: (run, text) => runText(run, text),
    moveRun,
    commitObjectText,
    updateObject,
    addObject,
    setCrop,
  };

  const panelActions: PanelActions = {
    setDefaults,
    runText,
    runStyle,
    moveRun,
    revertRun,
    updateObject,
    replaceImage: (id) => {
      replaceTarget.current = id;
      imageInput.current?.click();
    },
    editLink,
    setCrop,
    cropAll,
    uploadFont,
    duplicate,
    remove: removeSelection,
  };

  const editedPages = useMemo(() => {
    const pages = new Set<number>();
    Object.values(doc.textEdits).forEach((e) => pages.add(e.run.pageIndex));
    Object.values(doc.linkEdits).forEach((e) => pages.add(e.link.pageIndex));
    doc.objects.forEach((o) => pages.add(o.pageIndex));
    Object.keys(doc.crops).forEach((k) => pages.add(Number(k)));
    return pages;
  }, [doc]);

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      <TopBar
        fileName={fileName}
        onBack={handleBack}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={undo}
        onRedo={redo}
        zoom={zoom}
        onZoom={applyZoom}
        onFitWidth={fitWidth}
        currentPage={currentPage}
        pageCount={infos.length}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onSearch={() => setSearchOpen(true)}
        onShortcuts={() => setShowShortcuts(true)}
        onDownload={handleDownload}
        downloading={downloading}
        saveStatus={saveStatus}
      />

      <div className="flex min-h-0 flex-1">
        <ToolRail tool={tool} onTool={selectTool} />
        {sidebarOpen && pdf && (
          <ThumbnailSidebar pdf={pdf} infos={infos} currentPage={currentPage} editedPages={editedPages} onSelect={(i) => scrollToPage(i)} />
        )}

        <main className="relative min-w-0 flex-1">
          {searchOpen && (
            <SearchBar
              query={query}
              onQuery={(q) => {
                setQuery(q);
                setHitIndex(0);
              }}
              count={hits.length}
              activeIndex={activeIndex}
              scanning={Object.keys(pageData).length < infos.length}
              onStep={stepHit}
              onReplace={(r) => activeHit && replaceHits([activeHit], r)}
              onReplaceAll={(r) => replaceHits(hits, r)}
              onClose={() => setSearchOpen(false)}
            />
          )}
          <div ref={setScrollEl} onScroll={handleScroll} className="absolute inset-0 overflow-auto">
            {error ? (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
                  <p className="mb-2 text-lg font-medium text-red-700">Failed to load PDF</p>
                  <p className="mb-4 text-sm text-red-500">{error}</p>
                  <button onClick={onBack} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
                    Go back
                  </button>
                </div>
              </div>
            ) : !pdf ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <p className="text-sm text-gray-500">Opening PDF…</p>
                </div>
              </div>
            ) : (
              <div className="flex min-w-max flex-col items-center gap-4" style={{ padding: PAGE_PADDING }}>
                {infos.map((info) => (
                  <PageView
                    key={info.pageIndex}
                    info={info}
                    scale={zoom}
                    scrollRoot={scrollEl}
                    imageUrl={images[info.pageIndex]?.url}
                    runs={pageData[info.pageIndex]?.runs}
                    links={pageData[info.pageIndex]?.links}
                    doc={viewDoc}
                    tool={tool}
                    selection={selection}
                    editingId={editingId}
                    hits={hitsByPage.get(info.pageIndex) ?? []}
                    activeHit={activeHit?.key ?? null}
                    defaults={defaults}
                    actions={pageActions}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <PropertiesPanel
          selection={selection}
          tool={tool}
          doc={viewDoc}
          run={selection?.type === "run" ? findRun(selection.id) : undefined}
          link={selection?.type === "link" ? findLink(selection.id) : undefined}
          pageCount={infos.length}
          defaults={defaults}
          customFonts={customFonts}
          actions={panelActions}
        />
      </div>

      <footer className="flex h-9 shrink-0 items-center justify-center gap-3 border-t border-gray-200 bg-white text-xs text-gray-400">
        <span>
          Made with love by <span className="font-medium text-gray-500">Naaji</span>
        </span>
        <span className="text-gray-200">|</span>
        <a
          href="https://www.linkedin.com/in/naaji-navas/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0A66C2] transition-colors hover:text-[#004182]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          LinkedIn
        </a>
        <span className="text-gray-200">|</span>
        <a
          href="https://buymeacoffee.com/naaji"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-[#FFDD00] px-2 py-0.5 text-[11px] font-semibold text-gray-900 transition-colors hover:bg-[#FFCC00]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 884 1279" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M791.1 178.9H479.3l47.2-178.9h312.3l-47.7 178.9z" fill="#0D0C22" />
            <path d="m883.5 481.7-47.7 178.9H523.5l47.7-178.9h312.3z" fill="#0D0C22" />
            <path d="m328 1278.5-47.2-178.9h312.3l47.2 178.9H328z" fill="#0D0C22" />
            <path d="M640.3 1099.6H328l-47.2-178.9h312.3l47.2 178.9z" fill="#0D0C22" />
            <path d="M593.1 920.7H280.8L233.1 741h312.3l47.7 179.7z" fill="#0D0C22" />
            <path d="M545.4 741H233.1L186 562.1h312.3L545.4 741z" fill="#0D0C22" />
            <path d="M498.2 562.1H186L138.3 383.2h312.2l47.7 178.9z" fill="#0D0C22" />
            <path d="M450.5 383.2H138.3L91.1 204.3h312.2l47.2 178.9z" fill="#0D0C22" />
            <path d="M403.3 204.3H91.1L43.4 25.4h312.2l47.7 178.9z" fill="#0D0C22" />
          </svg>
          Buy me a coffee
        </a>
      </footer>

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) insertImage(file);
          e.target.value = "";
        }}
      />

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {notice && (
        <div className="fixed bottom-14 left-1/2 z-[90] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">{notice}</div>
      )}
      {downloading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30">
          <div className="flex items-center gap-3 rounded-xl bg-white px-6 py-4 shadow-xl">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm font-medium text-gray-700">Generating PDF…</span>
          </div>
        </div>
      )}
    </div>
  );
}
