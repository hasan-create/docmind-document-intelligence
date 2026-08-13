from .embedding_service import EmbeddingService
from .qdrant_service import QdrantService
from .models import Chunk


def test_search():

    question = "What are the objectives of this project?"

    query_embedding = EmbeddingService.generate_embedding(question)

    results = QdrantService.search(
        query_embedding=query_embedding,
        document_id=7,      # Change this to your uploaded document's ID
        limit=3,
    )

    for point in results:

        chunk = Chunk.objects.get(id=point.id)

        print("=" * 50)
        print("Score:", point.score)
        print("Chunk ID:", point.id)
        print(chunk.content[:300])