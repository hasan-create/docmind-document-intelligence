import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import authRoutes from "./src/routes/auth.js";
import documentRoutes from "./src/routes/documents.js";
import { initStore } from "./src/store.js";

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);

// Ensure unmatched /api/* requests always return JSON
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

const clientDistDir = path.join(process.cwd(), "dist", "client");
app.use(
  express.static(clientDistDir, {
    setHeaders: (res, filePath) => {
      if (
        filePath.endsWith(".html") ||
        filePath.endsWith(".js") ||
        filePath.endsWith(".css")
      ) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  })
);

// React SPA fallback
app.get(/.*/, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(clientDistDir, "index.html"));
});

// Always return JSON errors for API / Multer failures
app.use((err, _req, res, _next) => {
  console.error("Unhandled server error:", err);
  const message =
    err instanceof Error ? err.message : "Internal server error.";
  res.status(400).json({ error: message });
});

initStore()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`DocMind AI server running at http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database store:", err);
    process.exit(1);
  });
