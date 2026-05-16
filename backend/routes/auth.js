import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword, verifyPassword, generateToken } from "../services/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();
const prisma = new PrismaClient();

const registerSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required."),
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ─── POST /api/auth/register ───────────────────────────────────────────

router.post("/register", validate(registerSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, error: "An account with this email already exists." });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    const token = generateToken(user);
    res.cookie("token", token, COOKIE_OPTIONS);

    return res.status(201).json({ success: true, user });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────

router.post("/login", validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    const token = generateToken(user);
    res.cookie("token", token, COOKIE_OPTIONS);

    return res.json({
      success: true,
      user: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
});

// ─── POST /api/auth/logout ─────────────────────────────────────────────

router.post("/logout", (_req, res) => {
  res.clearCookie("token", { path: "/" });
  return res.json({ success: true, message: "Logged out." });
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────

router.get("/me", requireAuth, (req, res) => {
  return res.json({ success: true, user: req.user });
});

export default router;
