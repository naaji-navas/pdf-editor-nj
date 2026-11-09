"use client";

import { useEffect, useRef, useState } from "react";
import type { PageInfo } from "@/lib/types";
import { renderPageImage, type PdfDoc } from "@/lib/pdf-renderer";
import { createRenderQueue } from "@/lib/render-queue";

const THUMB_WIDTH = 112;
const queue = createRenderQueue(1);

interface ThumbnailSidebarProps {
  pdf: PdfDoc;
  infos: PageInfo[];
  currentPage: number;
  editedPages: Set<number>;
  onSelect: (pageIndex: number) => void;
}

export default function ThumbnailSidebar({ pdf, infos, currentPage, editedPages, onSelect }: ThumbnailSidebarProps) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    root?.querySelector(`[data-thumb="${currentPage}"]`)?.scrollIntoView({ block: "nearest" });
  }, [root, currentPage]);

  return (
    <aside
      ref={setRoot}
      className="w-40 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 px-3 py-3"
    >
      <div className="flex flex-col items-center gap-3">
        {infos.map((info) => (
          <Thumbnail
            key={info.pageIndex}
            pdf={pdf}
            info={info}
            root={root}
            active={info.pageIndex === currentPage}
            edited={editedPages.has(info.pageIndex)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  );
}

function Thumbnail({
  pdf,
  info,
  root,
  active,
  edited,
  onSelect,
}: {
  pdf: PdfDoc;
  info: PageInfo;
  root: HTMLElement | null;
  active: boolean;
  edited: boolean;
  onSelect: (pageIndex: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const height = (info.height / info.width) * THUMB_WIDTH;

  useEffect(() => {
    const el = ref.current;
    if (!el || !root) return;
    let created: string | null = null;
    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        queue(() => (cancelled ? Promise.resolve(null) : renderPageImage(pdf, info.pageIndex, THUMB_WIDTH / info.width)))
          .then((result) => {
            if (!result) return;
            if (cancelled) return URL.revokeObjectURL(result);
            created = result;
            setUrl(result);
          })
          .catch(() => {});
      },
      { root, rootMargin: "400px 0px" }
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
      if (created) URL.revokeObjectURL(created);
    };
  }, [pdf, info, root]);

  return (
    <button
      ref={ref}
      data-thumb={info.pageIndex}
      onClick={() => onSelect(info.pageIndex)}
      className="group flex flex-col items-center gap-1"
      aria-label={`Go to page ${info.pageIndex + 1}`}
    >
      <div
        className={`relative overflow-hidden rounded bg-white shadow-sm ring-2 transition ${
          active ? "ring-blue-500" : "ring-transparent group-hover:ring-gray-300"
        }`}
        style={{ width: THUMB_WIDTH, height }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt="" className="h-full w-full" draggable={false} />}
        {edited && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" title="Has edits" />}
      </div>
      <span className={`text-[11px] ${active ? "font-semibold text-blue-600" : "text-gray-500"}`}>{info.pageIndex + 1}</span>
    </button>
  );
}
