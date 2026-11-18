import math
import re
import uuid
from collections import Counter
from typing import Dict, List, Set

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PayloadSchemaType,
    PointStruct,
    VectorParams,
)

from config import QDRANT_COLLECTION, QDRANT_PATH, QDRANT_URL

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
    "had", "has", "have", "he", "her", "his", "how", "i", "if", "in", "into",
    "is", "it", "its", "of", "on", "or", "our", "she", "that", "the", "their",
    "them", "there", "these", "they", "this", "to", "was", "we", "were", "what",
    "when", "where", "which", "who", "why", "will", "with", "you", "your",
}


def tokenize(text: str) -> List[str]:
    tokens = re.sub(r"[^a-z0-9]+", " ", text.lower()).split()
    return [t for t in tokens if len(t) > 1 and t not in STOPWORDS]


def compute_bm25_scores(query: str, chunks: List[dict]) -> Dict[int, float]:
    query_tokens = tokenize(query)
    if not query_tokens or not chunks:
        return {}

    k1 = 1.5
    b = 0.75
    doc_tokens_list = [tokenize(c["content"]) for c in chunks]
    avg_len = sum(len(dt) for dt in doc_tokens_list) / len(chunks)
    unique_terms = list(set(query_tokens))
    total_docs = len(chunks)

    df: Dict[str, int] = {}
    for term in unique_terms:
        df[term] = sum(1 for dt in doc_tokens_list if term in dt)

    scores: Dict[int, float] = {}
    for idx, chunk in enumerate(chunks):
        dt = doc_tokens_list[idx]
        doc_len = len(dt) or 1
        tf_map = Counter(dt)
        score = 0.0
        for term in unique_terms:
            term_df = df.get(term, 0)
            tf = tf_map.get(term, 0)
            if term_df == 0 or tf == 0:
                continue
            idf = math.log(1.0 + (total_docs - term_df + 0.5) / (term_df + 0.5))
            num = tf * (k1 + 1.0)
            den = tf + k1 * (1.0 - b + b * (doc_len / (avg_len or 1.0)))
            score += idf * (num / den)
        scores[chunk["chunk_order"]] = score

    return scores


class QdrantService:
    _client: QdrantClient | None = None

    @classmethod
    def get_client(cls) -> QdrantClient:
        if cls._client is None:
            if QDRANT_URL:
                cls._client = QdrantClient(url=QDRANT_URL)
            else:
                cls._client = QdrantClient(path=QDRANT_PATH)
        return cls._client

    @classmethod
    def ensure_collection(cls, vector_size: int = 384) -> None:
        client = cls.get_client()
        existing = {c.name for c in client.get_collections().collections}
        if QDRANT_COLLECTION not in existing:
            client.create_collection(
                collection_name=QDRANT_COLLECTION,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            )
            client.create_payload_index(
                collection_name=QDRANT_COLLECTION,
                field_name="document_id",
                field_schema=PayloadSchemaType.KEYWORD,
            )

    @classmethod
    def upsert_chunks(
        cls,
        document_id: str,
        chunks: List[str],
        embeddings: List[List[float]],
    ) -> None:
        if not chunks:
            return

        cls.ensure_collection(vector_size=len(embeddings[0]))
        client = cls.get_client()

        points = []
        for idx, (content, vector) in enumerate(zip(chunks, embeddings), start=1):
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{document_id}:{idx}"))
            points.append(
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "document_id": document_id,
                        "chunk_order": idx,
                        "content": content,
                    },
                )
            )

        client.upsert(collection_name=QDRANT_COLLECTION, points=points)

    @classmethod
    def get_all_chunks(cls, document_id: str) -> List[dict]:
        client = cls.get_client()
        cls.ensure_collection()

        doc_filter = Filter(
            must=[
                FieldCondition(
                    key="document_id",
                    match=MatchValue(value=document_id),
                )
            ]
        )

        all_chunks: List[dict] = []
        next_offset = None

        while True:
            records, next_offset = client.scroll(
                collection_name=QDRANT_COLLECTION,
                scroll_filter=doc_filter,
                limit=256,
                offset=next_offset,
                with_payload=True,
                with_vectors=False,
            )
            for rec in records:
                if rec.payload:
                    all_chunks.append(
                        {
                            "document_id": rec.payload["document_id"],
                            "chunk_order": rec.payload["chunk_order"],
                            "content": rec.payload["content"],
                        }
                    )
            if next_offset is None:
                break

        all_chunks.sort(key=lambda c: c["chunk_order"])
        return all_chunks

    @classmethod
    def hybrid_search(
        cls,
        document_id: str,
        query: str,
        query_embedding: List[float],
        limit: int = 4,
    ) -> List[dict]:
        client = cls.get_client()
        cls.ensure_collection(vector_size=len(query_embedding))

        all_chunks = cls.get_all_chunks(document_id)
        if not all_chunks:
            return []

        # Dense search via Qdrant
        dense_res = client.query_points(
            collection_name=QDRANT_COLLECTION,
            query=query_embedding,
            query_filter=Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            ),
            limit=min(len(all_chunks), max(limit * 4, 20)),
            with_payload=True,
        )

        dense_scores: Dict[int, float] = {}
        for pt in dense_res.points:
            if pt.payload:
                order = int(pt.payload["chunk_order"])
                dense_scores[order] = max(0.0, float(pt.score))

        # Sparse BM25 search across document chunks
        bm25_raw = compute_bm25_scores(query, all_chunks)
        max_bm25 = max(bm25_raw.values(), default=0.0)

        scored: List[tuple[float, dict]] = []
        for chunk in all_chunks:
            order = chunk["chunk_order"]
            d_score = dense_scores.get(order, 0.0)
            b_score = (bm25_raw.get(order, 0.0) / max_bm25) if max_bm25 > 0 else 0.0
            combined = 0.6 * d_score + 0.4 * b_score
            scored.append((combined, chunk))

        scored.sort(key=lambda item: (-item[0], item[1]["chunk_order"]))
        return [item[1] for item in scored[:limit]]

    @classmethod
    def expand_neighbor_chunks(
        cls,
        document_id: str,
        seed_chunks: List[dict],
        radius: int = 1,
    ) -> List[dict]:
        all_chunks = cls.get_all_chunks(document_id)
        by_order = {c["chunk_order"]: c for c in all_chunks}

        selected_orders: Set[int] = set()
        for seed in seed_chunks:
            for offset in range(-radius, radius + 1):
                order = seed["chunk_order"] + offset
                if order in by_order:
                    selected_orders.add(order)

        return [by_order[order] for order in sorted(selected_orders)]

    @classmethod
    def delete_document(cls, document_id: str) -> None:
        client = cls.get_client()
        cls.ensure_collection()
        client.delete(
            collection_name=QDRANT_COLLECTION,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            ),
        )
