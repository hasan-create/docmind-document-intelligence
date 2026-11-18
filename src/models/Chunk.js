import mongoose from "mongoose";

const chunkSchema = new mongoose.Schema({
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Document",
    required: true,
    index: true,
  },
  content: {
    type: String,
    required: true,
  },
  chunkOrder: {
    type: Number,
    required: true,
  },
  embedding: {
    type: [Number],
    default: null,
  },
});

chunkSchema.index({ documentId: 1, chunkOrder: 1 });

export const ChunkModel =
  mongoose.models.Chunk || mongoose.model("Chunk", chunkSchema);
