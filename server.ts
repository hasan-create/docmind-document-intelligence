import "dotenv/config";
import path from "path";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import authRoutes from "./src/routes/auth.js";
import documentRoutes from "./src/routes/documents.js";

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);

// Ensure unmatched /api/* requests always return JSON, never HTML
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "API endpoint not found." });
});

const frontendDir = path.join(process.cwd(), "frontend");
app.use(
  express.static(frontendDir, {
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

app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(frontendDir, "index.html"));
});

// Always return JSON errors for API / Multer failures instead of HTML
app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
    console.error("Unhandled server error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error.";
    res.status(400).json({ error: message });
  }
);

app.listen(PORT, HOST, () => {
  console.log(`DocMind AI server running at http://${HOST}:${PORT}`);
});
