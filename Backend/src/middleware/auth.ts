import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthedRequest extends Request {
  user?: { id: string };
}

interface SupabaseJwtPayload extends jwt.JwtPayload {
  sub: string; // Supabase user ID
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const token = authHeader.slice("Bearer ".length);

  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    console.error("Missing SUPABASE_JWT_SECRET in environment");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as SupabaseJwtPayload;
    req.user = { id: decoded.sub };
    return next();
  } catch (err) {
    console.error("JWT verification failed:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}