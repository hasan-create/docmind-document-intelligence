import jwt from "jsonwebtoken";
import { store } from "../store.js";

export const JWT_SECRET =
  process.env.JWT_SECRET || "docmind-dev-secret-change-in-production";

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      detail: "Authentication credentials were not provided.",
    });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await store.findUserById(decoded.user_id);

    if (!user) {
      res.status(401).json({
        detail: "User not found. Please log in again.",
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
    };
    next();
  } catch {
    res.status(401).json({
      detail: "Given token not valid for any token type",
    });
  }
}
