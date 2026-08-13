from sentence_transformers import SentenceTransformer


class EmbeddingService:

    model = SentenceTransformer("all-MiniLM-L6-v2")

    @staticmethod
    def generate_embedding(text):

        embedding = EmbeddingService.model.encode(
            text
        )

        return embedding.tolist()


    @staticmethod
    def generate_embeddings(texts):

        embeddings = EmbeddingService.model.encode(
            texts,
            batch_size=16,
            show_progress_bar=True
        )

        return embeddings.tolist()