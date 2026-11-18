import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { store } from "../store.js";

export const JWT_SECRET =
  process.env.JWT_SECRET || "docmind-dev-secret-change-in-production";

export interface AuthenticatedUser {
  id: number;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

interface JwtPayload {
  user_id: number;
  email: string;
  token_type?: string;
}

export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      detail: "Authentication credentials were not provided.",
    });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = store.findUserById(decoded.user_id);

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
