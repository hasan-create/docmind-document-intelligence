import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    filename: {
      type: String,
      required: true,
    },
    embeddingMode: {
      type: String,
      enum: ["hybrid", "partial_hybrid", "bm25"],
      default: "hybrid",
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: { createdAt: "uploadedAt", updatedAt: false },
  }
);

export const DocumentModel =
  mongoose.models.Document || mongoose.model("Document", documentSchema);
