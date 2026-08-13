from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import DocumentSerializer, ChatSerializer
from .services import DocumentService


class UploadDocumentView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request):

        serializer = DocumentSerializer(data=request.data)

        if serializer.is_valid():

            document = DocumentService.upload_document(
                request.user,
                serializer.validated_data,
            )

            return Response(
                DocumentSerializer(document).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )


class ChatAPIView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request):

        serializer = ChatSerializer(data=request.data)

        serializer.is_valid(raise_exception=True)

        data = DocumentService.search_document(
            document_id=serializer.validated_data["document_id"],
            question=serializer.validated_data["question"],
        )

        return Response(data, status=status.HTTP_200_OK)