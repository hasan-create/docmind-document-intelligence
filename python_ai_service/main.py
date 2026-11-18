from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from config import INTERNAL_API_SECRET
from services.adaptive_rag_service import AdaptiveRAGService
from services.chunk_service import ChunkService
from services.embedding_service import EmbeddingService
from services.pdf_service import PDFService
from services.qdrant_service import QdrantService

app = FastAPI(title="DocMind AI - Python RAG Service", version="1.0.0")


def verify_internal_secret(x_internal_secret: str = Header(default="")) -> None:
    if INTERNAL_API_SECRET and x_internal_secret != INTERNAL_API_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized internal request.")


class ChatRequest(BaseModel):
    document_id: int
    question: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ai/ingest", dependencies=[Depends(verify_internal_secret)])
async def ingest_document(
    document_id: int = Form(...),
    file: UploadFile = File(...),
):
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded PDF file is empty.")

    text = PDFService.extract_text(file_bytes)
    chunks = ChunkService.split_text(text)
    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="Could not extract any readable text from this PDF.",
        )

    embeddings = EmbeddingService.generate_embeddings(chunks)
    QdrantService.upsert_chunks(
        document_id=document_id,
        chunks=chunks,
        embeddings=embeddings,
    )

    return {
        "document_id": document_id,
        "chunk_count": len(chunks),
        "embedding_mode": "hybrid",
    }


@app.post("/ai/chat", dependencies=[Depends(verify_internal_secret)])
def chat_with_document(payload: ChatRequest):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question may not be blank.")

    try:
        return AdaptiveRAGService.answer_question(
            document_id=payload.document_id,
            question=question,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/ai/documents/{document_id}", dependencies=[Depends(verify_internal_secret)])
def delete_document_vectors(document_id: int):
    QdrantService.delete_document(document_id)
    return {"message": "Document vectors deleted."}
