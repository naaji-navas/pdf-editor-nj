"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { deleteSession, listSessions, loadSession, type SessionSummary } from "@/lib/autosave";

function timeAgo(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString();
}

interface PdfUploaderProps {
  onFileLoaded: (data: ArrayBuffer, fileName: string) => void;
}

export default function PdfUploader({ onFileLoaded }: PdfUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    listSessions().then(setSessions, () => setSessions([]));
  }, []);

  const resume = async (id: string) => {
    const session = await loadSession(id).catch(() => undefined);
    if (session) onFileLoaded(session.pdf, session.fileName);
  };

  const discard = async (id: string) => {
    await deleteSession(id).catch(() => {});
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleFile = useCallback(
    (file: File) => {
      if (file.type !== "application/pdf") return;
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          onFileLoaded(reader.result, file.name);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [onFileLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-gray-900">
          PDF Editor
        </h1>
        <p className="text-lg text-gray-500">
          Upload a PDF to edit text directly in your browser
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`flex w-full max-w-lg cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 transition-all duration-200 ${
          isDragging
            ? "border-blue-500 bg-blue-50 shadow-lg shadow-blue-100"
            : "border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50 hover:shadow-md"
        }`}
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <svg
            className="h-8 w-8 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        </div>
        <p className="mb-1 text-base font-medium text-gray-700">
          {isDragging ? "Drop your PDF here" : "Drop a PDF file here"}
        </p>
        <p className="text-sm text-gray-400">or click to browse</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {sessions.length > 0 && (
        <div className="mt-6 w-full max-w-lg">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Continue editing</h2>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <button onClick={() => resume(s.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-gray-800 hover:text-blue-600">{s.fileName}</p>
                  <p className="text-xs text-gray-400">
                    {s.editCount} {s.editCount === 1 ? "edit" : "edits"} · saved {timeAgo(s.updatedAt)}
                  </p>
                </button>
                <button
                  onClick={() => resume(s.id)}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Resume
                </button>
                <button
                  onClick={() => discard(s.id)}
                  className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-red-600"
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Files are processed entirely in your browser. Nothing is uploaded to any
        server. Your edits are saved automatically on this device.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3">
        <p className="text-xs text-gray-400">
          Made with love by <span className="font-medium text-gray-500">Naaji</span>
        </p>
        <div className="flex items-center gap-3">
          <a
            href="https://www.linkedin.com/in/naaji-navas/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0A66C2] px-3 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#004182]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            LinkedIn
          </a>
          <a
            href="https://buymeacoffee.com/naaji"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#FFDD00] px-3 py-1 text-xs font-semibold text-gray-900 shadow-sm transition-colors hover:bg-[#FFCC00]"
          >
            <svg className="h-4 w-4" viewBox="0 0 884 1279" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M791.1 178.9H479.3l47.2-178.9h312.3l-47.7 178.9z" fill="#0D0C22"/>
              <path d="m883.5 481.7-47.7 178.9H523.5l47.7-178.9h312.3z" fill="#0D0C22"/>
              <path d="m328 1278.5-47.2-178.9h312.3l47.2 178.9H328z" fill="#0D0C22"/>
              <path d="M640.3 1099.6H328l-47.2-178.9h312.3l47.2 178.9z" fill="#0D0C22"/>
              <path d="M593.1 920.7H280.8L233.1 741h312.3l47.7 179.7z" fill="#0D0C22"/>
              <path d="M545.4 741H233.1L186 562.1h312.3L545.4 741z" fill="#0D0C22"/>
              <path d="M498.2 562.1H186L138.3 383.2h312.2l47.7 178.9z" fill="#0D0C22"/>
              <path d="M450.5 383.2H138.3L91.1 204.3h312.2l47.2 178.9z" fill="#0D0C22"/>
              <path d="M403.3 204.3H91.1L43.4 25.4h312.2l47.7 178.9z" fill="#0D0C22"/>
            </svg>
            Buy me a coffee
          </a>
        </div>
      </div>
    </div>
  );
}
