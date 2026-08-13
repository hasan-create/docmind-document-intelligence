from django.urls import path

from .views import UploadDocumentView, ChatAPIView


urlpatterns = [
    path("upload/", UploadDocumentView.as_view(), name="upload-document"),
    path("chat/", ChatAPIView.as_view(), name="chat"),
]