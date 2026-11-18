import fitz
from google import genai
from google.genai import types
from config import GEMINI_API_KEY, GEMINI_MODEL


class PDFService:
    @staticmethod
    def extract_text(file_bytes: bytes) -> str:
        full_text = ""
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            try:
                for page in doc:
                    full_text += page.get_text("text") + "\n"
            finally:
                doc.close()
        except Exception as exc:
            print(f"PyMuPDF extraction failed, falling back to Gemini PDF OCR: {exc}")

        full_text = full_text.strip()

        # Fallback for scanned/image-only PDFs (<= 20MB)
        if len(full_text) < 20 and len(file_bytes) <= 20 * 1024 * 1024 and GEMINI_API_KEY:
            client = genai.Client(api_key=GEMINI_API_KEY)
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[
                    types.Part.from_bytes(data=file_bytes, mime_type="application/pdf"),
                    "Extract and transcribe all readable text from this PDF document verbatim in reading order. Do not summarize.",
                ],
            )
            full_text = (response.text or "").strip()

        return full_text
