import { NextResponse } from "next/server";

const MAX_BYTES = 100 * 1024 * 1024;
const PDF_MAGIC = "%PDF-";

function safeFileName(raw: FormDataEntryValue | null) {
  const base = (typeof raw === "string" ? raw : "")
    .replace(/\.pdf$/i, "")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[\s.-]+/, "")
    .trim()
    .slice(0, 120);
  return `${base || "document"}.pdf`;
}

// Echoes the client-generated PDF back as a plain HTTP attachment; some browsers (e.g. Arc) stall on blob downloads
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, PDF_MAGIC.length)) !== PDF_MAGIC) {
    return NextResponse.json({ error: "Not a PDF" }, { status: 400 });
  }

  const name = safeFileName(form.get("name"));
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
