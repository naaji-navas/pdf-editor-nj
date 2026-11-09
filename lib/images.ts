const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_CONVERTED_SIDE = 3000;

export interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function decode(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file isn't a readable image."));
    img.src = src;
  });
}

/** PNG and JPEG are embedded as-is; other formats are re-encoded to PNG since PDFs can't hold them. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be under 20 MB.");
  const original = await readAsDataUrl(file);
  const img = await decode(original);
  const passthrough = /^data:image\/(png|jpeg);/.test(original);
  if (passthrough) return { src: original, width: img.naturalWidth, height: img.naturalHeight };

  const ratio = Math.min(1, MAX_CONVERTED_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * ratio);
  canvas.height = Math.round(img.naturalHeight * ratio);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { src: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}
