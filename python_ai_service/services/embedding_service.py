from typing import List
from sentence_transformers import SentenceTransformer
from config import EMBEDDING_MODEL


class EmbeddingService:
    _model: SentenceTransformer | None = None

    @classmethod
    def get_model(cls) -> SentenceTransformer:
        if cls._model is None:
            cls._model = SentenceTransformer(EMBEDDING_MODEL)
        return cls._model

    @classmethod
    def generate_embedding(cls, text: str) -> List[float]:
        model = cls.get_model()
        vector = model.encode(text, normalize_embeddings=True)
        return vector.tolist()

    @classmethod
    def generate_embeddings(cls, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        model = cls.get_model()
        vectors = model.encode(
            texts,
            batch_size=32,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vectors.tolist()
