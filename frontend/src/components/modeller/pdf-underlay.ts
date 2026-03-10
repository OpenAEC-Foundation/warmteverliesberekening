/**
 * PDF underlay helper — renders the first page of a PDF to a data URL
 * using PDF.js (pdfjs-dist).
 */
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Configure the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const RENDER_SCALE = 2;

interface PdfPageResult {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Render the first page of a PDF file to a PNG data URL.
 * Returns the image dimensions at the rendered scale.
 */
export async function renderPdfFirstPage(file: File): Promise<PdfPageResult> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  // Verify 2D context is available (required by PDF.js)
  if (!canvas.getContext("2d")) {
    page.cleanup();
    pdf.destroy();
    throw new Error("Canvas 2D context niet beschikbaar");
  }

  await page.render({ canvas, viewport }).promise;

  const dataUrl = canvas.toDataURL("image/png");
  const width = viewport.width;
  const height = viewport.height;

  page.cleanup();
  pdf.destroy();

  return { dataUrl, width, height };
}
