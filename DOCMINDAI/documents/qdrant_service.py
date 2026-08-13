from qdrant_client import QdrantClient

from qdrant_client.models import (
    PointStruct,
    Distance,
    VectorParams,
    Filter,
    FieldCondition,
    MatchValue,
)


class QdrantService:

    client = QdrantClient(
        path="./qdrant_data"
    )

    COLLECTION_NAME = "documents"


    # =========================
    # CREATE COLLECTION
    # =========================

    @staticmethod
    def create_collection():

        collections = (
            QdrantService.client
            .get_collections()
            .collections
        )

        collection_names = [
            collection.name
            for collection in collections
        ]


        if (
            QdrantService.COLLECTION_NAME
            not in collection_names
        ):

            QdrantService.client.create_collection(

                collection_name=
                    QdrantService.COLLECTION_NAME,

                vectors_config=VectorParams(

                    size=384,

                    distance=Distance.COSINE,

                ),
            )


    # =========================
    # ADD SINGLE EMBEDDING
    # =========================

    @staticmethod
    def add_embedding(chunk):

        point = PointStruct(

            id=chunk.id,

            vector=chunk.embedding,

            payload={

                "document_id":
                    chunk.document.id,

                "chunk_order":
                    chunk.chunk_order,

            },
        )


        QdrantService.client.upsert(

            collection_name=
                QdrantService.COLLECTION_NAME,

            points=[point],

        )


    # =========================
    # ADD MULTIPLE EMBEDDINGS
    # =========================

    @staticmethod
    def add_embeddings(chunks):

        points = []


        for chunk in chunks:

            point = PointStruct(

                id=chunk.id,

                vector=chunk.embedding,

                payload={

                    "document_id":
                        chunk.document.id,

                    "chunk_order":
                        chunk.chunk_order,

                },
            )

            points.append(point)


        if points:

            QdrantService.client.upsert(

                collection_name=
                    QdrantService.COLLECTION_NAME,

                points=points,

            )


    # =========================
    # COUNT VECTORS
    # =========================

    @staticmethod
    def count_vectors():

        info = (
            QdrantService.client
            .get_collection(
                collection_name=
                    QdrantService.COLLECTION_NAME
            )
        )

        return info.points_count


    # =========================
    # SEARCH
    # =========================

    @staticmethod
    def search(
        query_embedding,
        document_id,
        limit=3
    ):

        results = (
            QdrantService.client.query_points(

                collection_name=
                    QdrantService.COLLECTION_NAME,

                query=query_embedding,

                query_filter=Filter(

                    must=[

                        FieldCondition(

                            key="document_id",

                            match=MatchValue(
                                value=document_id
                            ),

                        )

                    ]

                ),

                limit=limit,

            )
        )


        return results.points