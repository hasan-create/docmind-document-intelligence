import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractTextFromPdfWithGemini } from "./geminiService.js";

export async function extractTextFromPdf(buffer) {
  let fullText = "";

  try {
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      useSystemFonts: true,
      verbosity: 0,
    });

    const pdf = await loadingTask.promise;

    try {
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        fullText += pageText + "\n";
      }
    } finally {
      await loadingTask.destroy();
    }
  } catch (err) {
    console.warn("pdfjs-dist extraction failed, attempting Gemini PDF OCR fallback:", err);
  }

  fullText = fullText.trim();

  if (fullText.length < 20 && buffer.length <= 20 * 1024 * 1024) {
    console.log("Extracted text too short via pdfjs-dist; using Gemini PDF text extraction...");
    fullText = await extractTextFromPdfWithGemini(buffer);
  }

  return fullText.trim();
}
