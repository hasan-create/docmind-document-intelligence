import re
from typing import List, Literal
from pydantic import BaseModel
from google import genai
from google.genai import types

from config import GEMINI_API_KEY, GEMINI_MODEL
from services.embedding_service import EmbeddingService
from services.qdrant_service import QdrantService


class VerificationSchema(BaseModel):
    status: Literal["SUFFICIENT", "PARTIAL", "NONE"]
    answer: str


class BatchFindingSchema(BaseModel):
    found: bool
    evidence: str


class AdaptiveRAGService:
    @staticmethod
    def _get_client() -> genai.Client:
        if not GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not set.")
        return genai.Client(api_key=GEMINI_API_KEY)

    @staticmethod
    def is_document_wide_query(question: str) -> bool:
        return bool(
            re.search(
                r"\b(summar(y|ize|ise)|overview|how many|count|list all|find all|classify|all topics|all questions|entire document|whole document)\b",
                question.lower(),
            )
        )

    @classmethod
    def verify_and_answer(cls, question: str, chunks: List[dict]) -> VerificationSchema:
        client = cls._get_client()
        context_text = "\n\n".join(
            f"[Chunk {c['chunk_order']}]\n{c['content']}" for c in chunks
        )

        prompt = f"""
You are an Adaptive RAG verification and answering assistant.
Evaluate ONLY the provided document chunks to answer the user's question.

Rules for "status":
- "SUFFICIENT": The provided chunks contain enough information to answer completely. Provide the complete answer in "answer".
- "PARTIAL": The chunks mention the topic/question, but the answer or list is cut off and likely continues in adjacent chunks. Set "answer" to "".
- "NONE": The answer is not in these chunks, OR the question asks about the entire document. Set "answer" to "".

Formatting rules for "answer" (when status is "SUFFICIENT"):
- Format cleanly in Markdown using newline characters.
- Use headings (### ...) for grouped topics or rule sets.
- Use bullet points (- ) or numbered lists (1. ) for multiple rules/items/steps.
- Use **bold** for key terms and rule names.
- Never dump everything into one dense paragraph.

Context:
{context_text}

Question:
{question}
"""

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=VerificationSchema,
            ),
        )

        if response.parsed:
            return response.parsed
        return VerificationSchema(status="NONE", answer="")

    @classmethod
    def run_batch_analysis(cls, question: str, all_chunks: List[dict]) -> str:
        client = cls._get_client()
        max_batch_chars = 18000
        max_batches = 5

        batches: List[str] = []
        current = ""
        for chunk in all_chunks:
            entry = f"[Chunk {chunk['chunk_order']}]\n{chunk['content']}\n\n"
            if len(current) + len(entry) > max_batch_chars and current:
                batches.append(current)
                current = entry
                if len(batches) >= max_batches:
                    break
            else:
                current += entry

        if current and len(batches) < max_batches:
            batches.append(current)

        findings: List[str] = []
        for idx, batch_text in enumerate(batches, start=1):
            batch_prompt = f"""
You are analyzing section {idx} of {len(batches)} of a document.
Extract ONLY facts, quotes, counts, or answers directly relevant to the user's question.
If nothing is relevant, set found=false and evidence="".

Document Section:
{batch_text}

Question:
{question}
"""
            res = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=batch_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=BatchFindingSchema,
                ),
            )
            if res.parsed and res.parsed.found and res.parsed.evidence.strip():
                findings.append(f"Section {idx}:\n{res.parsed.evidence.strip()}")

        if not findings:
            return "I could not find the answer in the uploaded document."

        final_prompt = f"""
You are a helpful AI assistant.
Synthesize a clear, well-structured final answer using ONLY the verified document evidence below.
Format cleanly in Markdown (### headings, - bullet points, **bold** labels).
If the evidence does not answer the question, reply exactly:
I could not find the answer in the uploaded document.

Evidence:
{chr(10).join(findings)}

Question:
{question}
"""
        final_res = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=final_prompt,
        )
        return (final_res.text or "").strip() or "I could not find the answer in the uploaded document."

    @classmethod
    def answer_question(cls, document_id: str, question: str) -> dict:
        all_chunks = QdrantService.get_all_chunks(document_id)
        if not all_chunks:
            raise ValueError("No indexed chunks found for this document.")

        if cls.is_document_wide_query(question) and len(all_chunks) > 4:
            answer = cls.run_batch_analysis(question, all_chunks)
            return {
                "answer": answer,
                "strategy": "batch_analysis",
                "chunks_used": len(all_chunks),
            }

        # Stage 1: Initial Hybrid Retrieval (Qdrant Cosine + BM25)
        query_embedding = EmbeddingService.generate_embedding(question)
        initial_chunks = QdrantService.hybrid_search(
            document_id=document_id,
            query=question,
            query_embedding=query_embedding,
            limit=4,
        )
        initial_chunks.sort(key=lambda c: c["chunk_order"])

        # Stage 2: LLM Evidence Verification
        stage2 = cls.verify_and_answer(question, initial_chunks)
        if stage2.status == "SUFFICIENT" and stage2.answer.strip():
            return {
                "answer": stage2.answer.strip(),
                "strategy": "direct",
                "chunks_used": len(initial_chunks),
            }

        # Stage 3: Expand Neighboring Chunks (chunk_order ± 1) if PARTIAL
        if stage2.status == "PARTIAL":
            expanded = QdrantService.expand_neighbor_chunks(
                document_id=document_id,
                seed_chunks=initial_chunks,
                radius=1,
            )
            if len(expanded) > len(initial_chunks):
                stage3 = cls.verify_and_answer(question, expanded)
                if stage3.status == "SUFFICIENT" and stage3.answer.strip():
                    return {
                        "answer": stage3.answer.strip(),
                        "strategy": "neighbor_expanded",
                        "chunks_used": len(expanded),
                    }

        if len(initial_chunks) >= len(all_chunks):
            return {
                "answer": "I could not find the answer in the uploaded document.",
                "strategy": "direct",
                "chunks_used": len(all_chunks),
            }

        # Stage 4: Batch Analysis -> Final LLM Synthesis
        answer = cls.run_batch_analysis(question, all_chunks)
        return {
            "answer": answer,
            "strategy": "batch_analysis",
            "chunks_used": len(all_chunks),
        }
