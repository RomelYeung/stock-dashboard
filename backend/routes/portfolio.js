import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();
const prisma = new PrismaClient();

const portfolioItemSchema = z.object({
  ticker: z
    .string()
    .min(1, "Ticker is required.")
    .max(10)
    .transform((s) => s.toUpperCase()),
  shares: z.number().optional(),
  averagePrice: z.number().optional(),
});

const wishlistSchema = z.object({
  ticker: z
    .string()
    .min(1, "Ticker is required.")
    .max(10)
    .transform((s) => s.toUpperCase()),
});

// All routes require authentication
router.use(requireAuth);

// ─── GET /api/portfolio ─────────────────────────────────────────────────
// Returns user's portfolio items and wishlist items
router.get("/", async (req, res) => {
  try {
    const [portfolio, wishlist] = await Promise.all([
      prisma.portfolioItem.findMany({
        where: { userId: req.user.id },
        select: { id: true, ticker: true, shares: true, averagePrice: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.wishListItem.findMany({
        where: { userId: req.user.id },
        select: { id: true, ticker: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return res.json({ success: true, portfolio, wishlist });
  } catch (err) {
    console.error("GET /api/portfolio error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
});

// ─── POST /api/portfolio/items ──────────────────────────────────────────
// Adds or updates a portfolio item (ticker, shares, averagePrice)
router.post("/items", validate(portfolioItemSchema), async (req, res) => {
  try {
    const { ticker, shares, averagePrice } = req.body;

    const existing = await prisma.portfolioItem.findFirst({
      where: { userId: req.user.id, ticker },
    });

    let item;
    if (existing) {
      item = await prisma.portfolioItem.update({
        where: { id: existing.id },
        data: {
          shares: typeof shares === "number" ? shares : existing.shares,
          averagePrice: typeof averagePrice === "number" ? averagePrice : existing.averagePrice,
        },
      });
    } else {
      item = await prisma.portfolioItem.create({
        data: {
          userId: req.user.id,
          ticker,
          shares: shares ?? 0,
          averagePrice: averagePrice ?? 0,
        },
      });
    }

    return res.json({ success: true, item });
  } catch (err) {
    console.error("POST /api/portfolio/items error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
});

// ─── DELETE /api/portfolio/items/:ticker ────────────────────────────────
// Removes a portfolio item by ticker
router.delete("/items/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();

    const existing = await prisma.portfolioItem.findFirst({
      where: { userId: req.user.id, ticker },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: "Portfolio item not found." });
    }

    await prisma.portfolioItem.delete({ where: { id: existing.id } });
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/portfolio/items/:ticker error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
});

// ─── POST /api/portfolio/wishlist ───────────────────────────────────────
// Adds a ticker to the wishlist
router.post("/wishlist", validate(wishlistSchema), async (req, res) => {
  try {
    const { ticker } = req.body;

    const existing = await prisma.wishListItem.findFirst({
      where: { userId: req.user.id, ticker },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `${ticker} is already in your wishlist.`,
      });
    }

    const item = await prisma.wishListItem.create({
      data: { userId: req.user.id, ticker },
    });

    return res.status(201).json({ success: true, item });
  } catch (err) {
    console.error("POST /api/portfolio/wishlist error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
});

// ─── DELETE /api/portfolio/wishlist/:ticker ─────────────────────────────
// Removes a ticker from the wishlist
router.delete("/wishlist/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();

    const existing = await prisma.wishListItem.findFirst({
      where: { userId: req.user.id, ticker },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: "Wishlist item not found." });
    }

    await prisma.wishListItem.delete({ where: { id: existing.id } });
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/portfolio/wishlist/:ticker error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
});

export default router;
