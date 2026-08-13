from .pdf_service import PDFService
from .chunk_service import ChunkService
from .models import Document, Chunk
from .embedding_service import EmbeddingService
from .qdrant_service import QdrantService
from .llm_service import LLMService

import time
class DocumentService:

    # =========================
    # UPLOAD DOCUMENT
    # =========================

    @staticmethod
    def upload_document(user, validated_data):

        # Create document
        start_time = time.time()
        
        
        document = Document.objects.create(
            user=user,
            title=validated_data["title"],
            file=validated_data["file"],
        )

        # =========================
        # EXTRACT TEXT
        # =========================

        text = PDFService.extract_text(
            document.file.path
        )

        # =========================
        # SPLIT TEXT INTO CHUNKS
        # =========================

        chunks = ChunkService.split_text(text)

        print(
            f"TOTAL CHUNKS: {len(chunks)}"
        )

        # =========================
        # CREATE QDRANT COLLECTION
        # =========================

        QdrantService.create_collection()

        # =========================
        # GENERATE BATCH EMBEDDINGS
        # =========================

        print(
            "GENERATING BATCH EMBEDDINGS..."
        )

        embeddings = (
            EmbeddingService.generate_embeddings(
                chunks
            )
        )

        print(
            f"GENERATED EMBEDDINGS: {len(embeddings)}"
        )

        # =========================
        # SAVE CHUNKS TO DATABASE
        # =========================

        saved_chunks = []

        for index, chunk in enumerate(
            chunks,
            start=1
        ):

            saved_chunk = Chunk.objects.create(
                document=document,
                content=chunk,
                chunk_order=index,
                embedding=embeddings[index - 1],
            )

            saved_chunks.append(
                saved_chunk
            )

        # =========================
        # BATCH UPLOAD TO QDRANT
        # =========================

        print(
            "UPLOADING VECTORS TO QDRANT..."
        )

        QdrantService.add_embeddings(
            saved_chunks
        )

        # =========================
        # VERIFY QDRANT
        # =========================

        count = QdrantService.count_vectors()

        print(
            "\n========== UPLOAD COMPLETE =========="
        )

        print(
            f"DOCUMENT ID: {document.id}"
        )

        print(
            f"DOCUMENT CHUNKS: {len(chunks)}"
        )

        print(
            f"TOTAL QDRANT VECTORS: {count}"
        )

        print(
            "========================================\n"
        )
        elapsed = time.time() - start_time

        print(
    f"UPLOAD COMPLETE — took {elapsed:.2f} seconds"
)
        
        return document

    # =========================
    # SEARCH DOCUMENT
    # =========================

    @staticmethod
    def search_document(
        document_id,
        question
    ):

        # Generate embedding for question
        query_embedding = (
            EmbeddingService.generate_embedding(
                question
            )
        )

        # Search relevant chunks
        results = QdrantService.search(
            query_embedding=query_embedding,
            document_id=document_id,
            limit=3,
        )

        # Build context
        context = ""

        for point in results:

            chunk = Chunk.objects.get(
                id=point.id
            )

            context += (
                chunk.content
                + "\n\n"
            )

        # Generate AI answer
        answer = LLMService.generate_answer(
            question=question,
            context=context,
        )

        return {
            "answer": answer
        }