import { verifyToken } from "../services/auth.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Middleware that verifies the JWT from the "token" HttpOnly cookie.
 * On success, attaches the user object to req.user.
 * On failure, responds with 401.
 */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ success: false, error: "Authentication required." });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: "Invalid or expired token." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: "User no longer exists." });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

/**
 * Middleware that requires the authenticated user to have the ADMIN role.
 * Must be used after requireAuth.
 */
export async function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ success: false, error: "Forbidden: Admin access required." });
  }
  next();
}
