"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import PdfUploader from "@/components/PdfUploader";

const PdfEditor = dynamic(() => import("@/components/PdfEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p className="text-sm text-gray-500">Loading editor...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const handleFileLoaded = (data: ArrayBuffer, name: string) => {
    setPdfData(data);
    setFileName(name);
  };

  const handleBack = () => {
    setPdfData(null);
    setFileName("");
  };

  if (pdfData) {
    return (
      <PdfEditor pdfData={pdfData} fileName={fileName} onBack={handleBack} />
    );
  }

  return <PdfUploader onFileLoaded={handleFileLoaded} />;
}
